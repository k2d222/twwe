extern crate pretty_env_logger;

use std::{
    collections::HashMap,
    fs::{self, File},
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};

use axum::extract::ws::Message;
use base64::Engine;
use ndarray::{s, Array2, ArrayView};
use parking_lot::{MappedMutexGuard, Mutex, MutexGuard};

use futures::channel::mpsc::UnboundedSender;

use structview::View;
use twmap::*;
use twmap::{automapper::Automapper, constants};
use uuid::Uuid;

use crate::{
    map_cfg::MapConfig,
    protocol::*,
    twmap_map_checks::{CheckData, InternalMapChecking}, // TODO ask @patiga for granular checks
    twmap_map_edit::{extend_layer, shrink_layer}, // TODO I think twmap has methods for this now
    Peer,
};

type Tx = UnboundedSender<Message>;

// taken as-is from twmap
trait ViewAsBytes: View {
    fn into_boxed_bytes(boxed_slice: Box<[Self]>) -> Box<[u8]> {
        let len = boxed_slice.len() * std::mem::size_of::<Self>();
        let ptr = Box::into_raw(boxed_slice);
        unsafe {
            let byte_slice = std::slice::from_raw_parts_mut(ptr as *mut u8, len);
            Box::from_raw(byte_slice)
        }
    }
}
impl<T: View> ViewAsBytes for T {}

fn server_error<E: std::fmt::Display>(err: E) -> &'static str {
    log::error!("{}", err);
    "internal server error"
}

fn load_map(path: &Path) -> Result<TwMap, twmap::Error> {
    let mut map = TwMap::parse_file(&path)?;
    map.load()?;
    Ok(map)
}

fn set_layer_width<T: TilemapLayer>(layer: &mut T, width: usize) -> Result<(), &'static str> {
    let old_width = layer.tiles().shape().w as isize;
    let diff = width as isize - old_width;

    if width < 2 || width > 10000 {
        return Err("invalid layer dimensions");
    }

    if diff > 0 {
        extend_layer(layer, 0, 0, 0, diff as usize);
    } else if diff < 0 {
        shrink_layer(layer, 0, 0, 0, -diff as usize);
    }

    Ok(())
}

pub fn set_layer_height<T: TilemapLayer>(layer: &mut T, height: usize) -> Result<(), &'static str> {
    let old_height = layer.tiles().shape().h as isize;
    let diff = height as isize - old_height;

    if height < 2 || height > 10000 {
        return Err("invalid layer dimensions");
    }

    if diff > 0 {
        extend_layer(layer, 0, diff as usize, 0, 0);
    } else if diff < 0 {
        shrink_layer(layer, 0, -diff as usize, 0, 0);
    }

    Ok(())
}

// We want the room to have the map loaded when at least 1 peer is connected, but unloaded
// when the last peer disconnects. The LazyMap provides these capabilities.
pub struct LazyMap {
    pub path: PathBuf,
    map: Arc<Mutex<Option<TwMap>>>,
}

impl LazyMap {
    fn new(path: PathBuf) -> Self {
        LazyMap {
            path,
            map: Arc::new(Mutex::new(None)),
        }
    }

    fn unload(&self) {
        *self.map.lock() = None;
        log::debug!("unloaded map {}", self.path.display());
    }

    pub fn get(&self) -> MappedMutexGuard<TwMap> {
        // lazy-load map if not loaded
        let mut map = self.map.lock();
        if *map == None {
            *map = load_map(&self.path).ok();
            log::debug!("loaded map {}", self.path.display());
        }
        match *map {
            Some(_) => MutexGuard::map(map, |m| m.as_mut().unwrap()),
            None => panic!("failed to load map {}", self.path.display()),
        }
    }
}

pub struct RoomPeer {
    pub id: Uuid,
    pub tx: Tx,
    pub cursor: Option<Cursor>,
}

pub struct Room {
    name: String,
    path: PathBuf,
    pub config: MapConfig,
    peers: Mutex<HashMap<SocketAddr, RoomPeer>>,
    pub map: LazyMap,
    saving: Mutex<()>, // this mutex prevents multiple users from saving at the same time
}

const MAP_FILE_NAME: &str = "map.map";
const CFG_FILE_NAME: &str = "config.json";

impl Room {
    pub fn new(path: PathBuf) -> Option<Self> {
        let mut map_path = path.clone();
        map_path.push(MAP_FILE_NAME);

        if !map_path.exists() {
            return None;
        }

        let name = path.file_name()?.to_string_lossy().to_string();

        let mut config_path = path.clone();
        config_path.push(CFG_FILE_NAME);

        let config = File::open(config_path)
            .ok()
            .and_then(|file| serde_json::from_reader(file).ok())
            .unwrap_or_default();

        Some(Room {
            name,
            path,
            config,
            peers: Mutex::new(HashMap::new()),
            map: LazyMap::new(map_path),
            saving: Mutex::new(()),
        })
    }

    pub fn name(&self) -> &str {
        self.name.as_ref()
    }

    pub fn path(&self) -> &Path {
        self.path.as_ref()
    }

    pub fn add_peer(&self, peer: &Peer) {
        self.peers().insert(
            peer.addr,
            RoomPeer {
                id: Uuid::new_v4(),
                tx: peer.tx.clone(),
                cursor: None,
            },
        );
    }

    pub fn peer_count(&self) -> usize {
        self.peers().len()
    }

    pub fn remove_peer(&self, peer: &Peer) {
        self.peers().remove(&peer.addr);
        if self.peers().is_empty() {
            self.map.unload()
        }
    }

    pub fn peers(&self) -> MutexGuard<HashMap<SocketAddr, RoomPeer>> {
        self.peers.lock()
    }

    pub fn remove_closed_peers(&self) {
        let mut peers = self.peers();
        peers.retain(|_, p| !p.tx.is_closed());
        if peers.is_empty() {
            self.map.unload()
        }
    }

    pub fn layer_data(&self, group: usize, layer: usize) -> Result<String, &'static str> {
        let mut map = self.map.get();
        let group = map.groups.get_mut(group).ok_or("invalid group index")?;
        let layer = group.layers.get_mut(layer).ok_or("invalid layer index")?;

        // TODO I really need to stop using macros and use traits instead
        macro_rules! layer_data {
            ($layer: ident) => {{
                let data = $layer
                    .tiles
                    .unwrap_ref()
                    .to_owned()
                    .into_raw_vec()
                    .into_boxed_slice();
                let buf = ViewAsBytes::into_boxed_bytes(data);
                let str = base64::engine::general_purpose::STANDARD.encode(buf);
                Ok(str)
            }};
        }

        match layer {
            Layer::Game(layer) => layer_data!(layer),
            Layer::Tiles(layer) => layer_data!(layer),
            Layer::Front(layer) => layer_data!(layer),
            Layer::Tele(layer) => layer_data!(layer),
            Layer::Speedup(layer) => layer_data!(layer),
            Layer::Switch(layer) => layer_data!(layer),
            Layer::Tune(layer) => layer_data!(layer),
            Layer::Invalid(_) | Layer::Sounds(_) | Layer::Quads(_) => Err("not a tiles layer"),
        }
    }

    pub fn send_map(&self, peer: &Peer) -> Result<(), &'static str> {
        let buf = {
            let mut buf = Vec::new();
            self.map.get().save(&mut buf).map_err(server_error)?; // TODO: this is blocking for the server
            buf
        };

        peer.tx.unbounded_send(Message::Binary(buf)).ok();

        Ok(())
    }

    pub fn save_map_copy(&self, path: &PathBuf) -> Result<(), &'static str> {
        // clone the map to release the lock as soon as possible
        self.map
            .get()
            .clone()
            .save_file(path)
            .map_err(server_error)?;

        log::debug!("cloned {} to {}", self.map.path.display(), path.display());
        Ok(())
    }

    pub fn save_config(&self) -> Result<(), &'static str> {
        let mut cfg_path = self.path.clone();
        cfg_path.push(CFG_FILE_NAME);
        let file = File::create(cfg_path).map_err(server_error)?;
        serde_json::to_writer(file, &self.config).map_err(server_error)?;
        Ok(())
    }

    pub fn save_map(&self) -> Result<(), &'static str> {
        // Avoid concurrent saves
        let _lck = self.saving.lock();

        // clone the map to release the lock as soon as possible
        let mut tmp_path = self.map.path.clone();
        tmp_path.set_extension("map.tmp");
        self.map
            .get()
            .clone()
            .save_file(&tmp_path)
            .map_err(server_error)?;
        std::fs::rename(&tmp_path, &self.map.path).map_err(server_error)?;

        log::debug!("saved {}", self.map.path.display());
        Ok(())
    }

    pub fn set_tile(&self, edit_tile: &EditTile) -> Result<(), &'static str> {
        let mut map = self.map.get();
        let group = map
            .groups
            .get_mut(edit_tile.group as usize)
            .ok_or("invalid group index")?;
        let layer = group
            .layers
            .get_mut(edit_tile.layer as usize)
            .ok_or("invalid layer index")?;

        // because all the tilemap layers share the same fields, but cannot
        // be mutated with the TileMapLayer trait, the easyest is to copy-paste
        // the code with a macro.
        macro_rules! tile {
            ($layer: ident) => {{
                let tiles = $layer.tiles_mut().unwrap_mut(); // map must be loaded
                let tile = tiles
                    .get_mut((edit_tile.y as usize, edit_tile.x as usize))
                    .ok_or("tile change outside layer")?;
                tile
            }};
        }

        use EditTileContent::*;

        match (layer, edit_tile.content.clone()) {
            (Layer::Game(layer), Tiles(edit)) => {
                let tile = tile!(layer);
                tile.id = edit.id;
                tile.flags = TileFlags::from_bits(edit.flags).ok_or("invalid tile flags")?;
                if tile.flags.contains(TileFlags::OPAQUE) {
                    return Err("game layer cannot have the opaque flag");
                }
            }
            (Layer::Tiles(layer), Tiles(edit)) => {
                let tile = tile!(layer);
                tile.id = edit.id;
                tile.flags = TileFlags::from_bits(edit.flags).ok_or("invalid tile flags")?;
            }
            (Layer::Front(layer), Tiles(edit)) => {
                let tile = tile!(layer);
                tile.id = edit.id;
                tile.flags = TileFlags::from_bits(edit.flags).ok_or("invalid tile flags")?;
            }
            (Layer::Tele(layer), Tele(edit)) => {
                let tile = tile!(layer);
                tile.number = edit.number;
                tile.id = edit.id;
            }
            (Layer::Speedup(layer), Speedup(edit)) => {
                if !(0..360).contains(&edit.angle) {
                    return Err("speedup angle must be in range (0..360)");
                }
                let tile = tile!(layer);
                tile.force = edit.force;
                tile.max_speed = edit.max_speed;
                tile.id = edit.id;
                tile.angle = edit.angle.into();
            }
            (Layer::Switch(layer), Switch(edit)) => {
                let tile = tile!(layer);
                tile.number = edit.number;
                tile.id = edit.id;
                tile.flags = TileFlags::from_bits(edit.flags).ok_or("invalid tile flags")?;
                tile.delay = edit.delay;
                if tile.flags.contains(TileFlags::OPAQUE) {
                    return Err("switch layer cannot have the opaque flag");
                }
            }
            (Layer::Tune(layer), Tune(edit)) => {
                let tile = tile!(layer);
                tile.number = edit.number;
                tile.id = edit.id;
            }
            (Layer::Quads(_) | Layer::Sounds(_) | Layer::Invalid(_), _) => {
                return Err("layer is not a tile layer");
            }
            (_, _) => {
                return Err("tile type incompatible with layer type");
            }
        };

        Ok(())
    }

    pub fn set_tiles(&self, edit_tiles: &EditTiles) -> Result<(), &'static str> {
        let mut map = self.map.get();
        let group = map
            .groups
            .get_mut(edit_tiles.group as usize)
            .ok_or("invalid group index")?;
        let layer = group
            .layers
            .get_mut(edit_tiles.layer as usize)
            .ok_or("invalid layer index")?;

        if layer.kind() != edit_tiles.kind {
            return Err("invalid layer kind");
        }

        // because all the tilemap layers share the same fields, but cannot
        // be mutated with the TileMapLayer trait, the easyest is to copy-paste
        // the code with a macro.
        macro_rules! tiles {
            ($layer: ident) => {{
                let x = edit_tiles.x as usize;
                let y = edit_tiles.y as usize;
                let width = edit_tiles.width as usize;
                let height = edit_tiles.height as usize;
                let shape = $layer.tiles().shape();

                if x + width > shape.w || y + height > shape.h {
                    return Err("tile change outside layer");
                }

                let buf = base64::engine::general_purpose::STANDARD
                    .decode(&edit_tiles.data)
                    .map_err(|_| "invalid data")?;
                let tiles =
                    structview::View::view_slice(buf.as_slice()).map_err(|_| "invalid data")?;
                let tiles =
                    ArrayView::from_shape((height, width), tiles).map_err(|_| "invalid data")?;

                let mut view = $layer
                    .tiles_mut()
                    .unwrap_mut()
                    .slice_mut(s![y..y + height, x..x + width]);
                view.assign(&tiles);
            }};
        }

        match layer {
            Layer::Game(l) => tiles!(l),
            Layer::Tiles(l) => tiles!(l),
            Layer::Front(l) => tiles!(l),
            Layer::Tele(l) => tiles!(l),
            Layer::Speedup(l) => tiles!(l),
            Layer::Switch(l) => tiles!(l),
            Layer::Tune(l) => tiles!(l),
            Layer::Quads(_) | Layer::Sounds(_) | Layer::Invalid(_) => {
                return Err("layer is not a tile layer");
            }
        };

        Ok(())
    }

    pub fn create_quad(&self, create_quad: &CreateQuad) -> Result<(), &'static str> {
        let mut map = self.map.get();
        let group = map
            .groups
            .get_mut(create_quad.group as usize)
            .ok_or("invalid group index")?;
        let layer = group
            .layers
            .get_mut(create_quad.layer as usize)
            .ok_or("invalid layer index")?;

        match layer {
            Layer::Quads(layer) => {
                let mut quad = twmap::Quad::default();
                quad.position = create_quad.content.position;
                quad.corners = create_quad.content.corners;
                quad.texture_coords = create_quad.content.tex_coords;
                layer.quads.push(quad);
            }
            _ => return Err("layer is not a quads layer"),
        }

        Ok(())
    }

    pub fn set_quad(&self, edit_quad: &EditQuad) -> Result<(), &'static str> {
        let mut map = self.map.get();

        if let Some(pos_env) = edit_quad.content.pos_env {
            match map.envelopes.get(pos_env as usize) {
                Some(Envelope::Position(_)) => (),
                _ => return Err("invalid envelope index or type"),
            }
        }

        if let Some(color_env) = edit_quad.content.color_env {
            match map.envelopes.get(color_env as usize) {
                Some(Envelope::Color(_)) => (),
                _ => return Err("invalid envelope index or type"),
            }
        }

        let group = map
            .groups
            .get_mut(edit_quad.group as usize)
            .ok_or("invalid group index")?;
        let layer = group
            .layers
            .get_mut(edit_quad.layer as usize)
            .ok_or("invalid layer index")?;

        match layer {
            Layer::Quads(layer) => {
                let quad = layer
                    .quads
                    .get_mut(edit_quad.quad as usize)
                    .ok_or("invalid quad index")?;

                quad.position = edit_quad.content.position;
                quad.corners = edit_quad.content.corners;
                quad.colors = edit_quad.content.colors;
                quad.texture_coords = edit_quad.content.tex_coords;
                quad.position_env = edit_quad.content.pos_env;
                quad.position_env_offset = edit_quad.content.pos_env_offset;
                quad.color_env = edit_quad.content.color_env;
                quad.color_env_offset = edit_quad.content.color_env_offset;
            }
            _ => return Err("layer is not a quads layer"),
        }

        Ok(())
    }

    pub fn delete_quad(&self, delete_quad: &DeleteQuad) -> Result<(), &'static str> {
        let mut map = self.map.get();
        let group = map
            .groups
            .get_mut(delete_quad.group as usize)
            .ok_or("invalid group index")?;
        let layer = group
            .layers
            .get_mut(delete_quad.layer as usize)
            .ok_or("invalid layer index")?;

        match layer {
            Layer::Quads(layer) => {
                if delete_quad.quad as usize >= layer.quads.len() {
                    return Err("invalid quad index");
                }

                layer.quads.remove(delete_quad.quad as usize);
            }
            _ => return Err("layer is not a quads layer"),
        }

        Ok(())
    }

    pub fn create_envelope(&self, create_envelope: &CreateEnvelope) -> Result<(), &'static str> {
        let mut map = self.map.get();

        if create_envelope.name.len() > Envelope::MAX_NAME_LENGTH {
            return Err("envelope name too long");
        }
        if map.envelopes.len() == u16::MAX as usize {
            return Err("max number of envelopes reached");
        }

        let mut env = match create_envelope.kind {
            EnvelopeKind::Color => Envelope::Color(Env::default()),
            EnvelopeKind::Position => Envelope::Position(Env::default()),
            EnvelopeKind::Sound => Envelope::Sound(Env::default()),
        };

        *env.name_mut() = create_envelope.name.to_owned();

        map.envelopes.push(env);

        Ok(())
    }

    pub fn edit_envelope(&self, edit_envelope: &EditEnvelope) -> Result<(), &'static str> {
        let mut map = self.map.get();

        // first, the checks with immutable ref to map
        match edit_envelope.change {
            OneEnvelopeChange::Points(ref points) => match points {
                EnvPoints::Color(points) => {
                    EnvPoint::check_all(&points, &map).map_err(|_| "invalid envelope points")?
                }
                EnvPoints::Position(points) => {
                    EnvPoint::check_all(&points, &map).map_err(|_| "invalid envelope points")?
                }
                EnvPoints::Sound(points) => {
                    EnvPoint::check_all(&points, &map).map_err(|_| "invalid envelope points")?
                }
            },
            _ => (),
        };

        let envelope = map
            .envelopes
            .get_mut(edit_envelope.index as usize)
            .ok_or("invalid envelope index")?;

        match edit_envelope.change.clone() {
            OneEnvelopeChange::Name(name) => {
                if name.len() > Envelope::MAX_NAME_LENGTH {
                    return Err("envelope name too long");
                } else {
                    *envelope.name_mut() = name;
                }
            }
            OneEnvelopeChange::Synchronized(synchronized) => match envelope {
                Envelope::Color(env) => env.synchronized = synchronized,
                Envelope::Position(env) => env.synchronized = synchronized,
                Envelope::Sound(env) => env.synchronized = synchronized,
            },
            OneEnvelopeChange::Points(points) => match (envelope, points) {
                (Envelope::Color(env), EnvPoints::Color(points)) => {
                    env.points = points;
                }
                (Envelope::Position(env), EnvPoints::Position(points)) => {
                    env.points = points;
                }
                (Envelope::Sound(env), EnvPoints::Sound(points)) => {
                    env.points = points;
                }
                _ => return Err("invalid envelope points type"),
            },
        }

        Ok(())
    }

    pub fn remove_envelope(&self, index: u16) -> Result<(), &'static str> {
        let mut map = self.map.get();

        if index as usize >= map.envelopes.len() {
            return Err("invalid envelope index");
        }

        if map.is_env_in_use(index) {
            return Err("envelope in use");
        }

        map.envelopes.remove(index as usize);
        map.edit_env_indices(|i| i.map(|i| if i > index { i - 1 } else { i }));

        Ok(())
    }

    pub fn create_group(&self, create_group: &CreateGroup) -> Result<(), &'static str> {
        let mut map = self.map.get();
        let mut group = Group::default();

        if create_group.name.len() > Group::MAX_NAME_LENGTH {
            return Err("group name too long");
        }
        if map.groups.len() == u16::MAX as usize {
            return Err("max number of groups reached");
        }

        group.name = create_group.name.to_owned();
        map.groups.push(group);
        Ok(())
    }

    pub fn edit_group(&self, edit_group: &EditGroup) -> Result<(), &'static str> {
        let mut map = self.map.get();
        let group = map
            .groups
            .get_mut(edit_group.group as usize)
            .ok_or("invalid group index")?;

        use OneGroupChange::*;
        match edit_group.change.clone() {
            OffX(off_x) => group.offset.x = off_x,
            OffY(off_y) => group.offset.y = off_y,
            ParaX(para_x) => group.parallax.x = para_x,
            ParaY(para_y) => group.parallax.y = para_y,
            Clipping(clipping) => group.clipping = clipping,
            ClipX(clip_x) => group.clip.x = clip_x,
            ClipY(clip_y) => group.clip.y = clip_y,
            ClipW(clip_w) => group.clip.w = clip_w,
            ClipH(clip_h) => group.clip.h = clip_h,
            Name(name) => {
                if group.is_physics_group() {
                    return Err("cannot rename the physics group");
                }
                if name.len() > Group::MAX_NAME_LENGTH {
                    return Err("group name too long");
                }
                group.name = name
            }
        }

        Ok(())
    }

    pub fn reorder_group(&self, reorder_group: &ReorderGroup) -> Result<(), &'static str> {
        let mut map = self.map.get();

        if reorder_group.group as usize >= map.groups.len() {
            return Err("invalid group index");
        }

        let group = map.groups.remove(reorder_group.group as usize);

        if reorder_group.new_group as usize > map.groups.len() {
            return Err("invalid new group index");
        }

        map.groups.insert(reorder_group.new_group as usize, group);

        Ok(())
    }

    pub fn delete_group(&self, delete_group: &DeleteGroup) -> Result<(), &'static str> {
        let mut map = self.map.get();
        let group = map
            .groups
            .get_mut(delete_group.group as usize)
            .ok_or("invalid group index")?;

        if group.is_physics_group() {
            return Err("cannot delete the physics group");
        }

        map.groups.remove(delete_group.group as usize);

        Ok(())
    }

    pub fn create_layer(&self, create_layer: &CreateLayer) -> Result<(), &'static str> {
        if create_layer.name.len() > Layer::MAX_NAME_LENGTH {
            return Err("layer name too long");
        }

        let mut map = self.map.get();
        let size = map.find_physics_layer::<GameLayer>().unwrap().tiles.shape();
        let group = map
            .groups
            .get_mut(create_layer.group as usize)
            .ok_or("invalid group index")?;

        macro_rules! physics_layer {
            ($kind: expr, $struct: ident, $enum: expr) => {{
                if !group.is_physics_group() {
                    return Err("cannot create physics layer outside of the physics group");
                }

                if group.layers.iter().find(|l| l.kind() == $kind).is_some() {
                    return Err("cannot create multiple physics layers of the same kind");
                }

                let tiles = CompressedData::Loaded(Array2::default((size.w, size.h)));
                let layer = $struct { tiles };
                group.layers.push($enum(layer));
            }};
        }

        match create_layer.kind {
            // LayerKind::Game => todo!(),
            LayerKind::Tiles => {
                let mut layer = TilesLayer::new((size.w, size.h));
                layer.name = create_layer.name.to_owned();
                group.layers.push(Layer::Tiles(layer));
            }
            LayerKind::Quads => {
                let mut layer = QuadsLayer::default();
                layer.name = create_layer.name.to_owned();
                group.layers.push(Layer::Quads(layer));
            }
            LayerKind::Front => physics_layer!(LayerKind::Front, FrontLayer, Layer::Front),
            LayerKind::Tele => physics_layer!(LayerKind::Tele, TeleLayer, Layer::Tele),
            LayerKind::Speedup => physics_layer!(LayerKind::Speedup, SpeedupLayer, Layer::Speedup),
            LayerKind::Switch => physics_layer!(LayerKind::Switch, SwitchLayer, Layer::Switch),
            LayerKind::Tune => physics_layer!(LayerKind::Tune, TuneLayer, Layer::Tune),
            LayerKind::Sounds | LayerKind::Game | LayerKind::Invalid(_) => {
                return Err("invalid new layer kind");
            }
        }

        Ok(())
    }

    pub fn edit_layer(&self, edit_layer: &EditLayer) -> Result<(), &'static str> {
        use OneLayerChange::*;
        let mut map = self.map.get();

        // COMBAK: layer mutable borrow interferes with immutable borrow of image.
        // I copy-pasted code but there must be a better way.

        if let Image(Some(i)) = edit_layer.change {
            let image = map.images.get(i as usize).ok_or("invalid image index")?;
            let tile_dims_ok = image.size().w % 16 == 0 && image.size().h % 16 == 0;

            let group = map
                .groups
                .get_mut(edit_layer.group as usize)
                .ok_or("invalid group index")?;
            let layer = group
                .layers
                .get_mut(edit_layer.layer as usize)
                .ok_or("invalid layer index")?;

            match layer {
                Layer::Tiles(layer) => {
                    if !tile_dims_ok {
                        return Err("invalid image dimensions for tile layer");
                    }
                    layer.image = Some(i)
                }
                Layer::Quads(layer) => layer.image = Some(i),
                _ => return Err("cannot change layer image"),
            }
        }

        if let ColorEnv(Some(i)) = edit_layer.change {
            match map.envelopes.get(i as usize) {
                Some(Envelope::Color(_)) => (),
                _ => return Err("invalid envelope index or type"),
            }
        }

        let group = map
            .groups
            .get_mut(edit_layer.group as usize)
            .ok_or("invalid group index")?;
        let layer = group
            .layers
            .get_mut(edit_layer.layer as usize)
            .ok_or("invalid layer index")?;

        match edit_layer.change.clone() {
            Name(name) => {
                if name.len() > Layer::MAX_NAME_LENGTH {
                    return Err("layer name too long");
                }
                *layer.name_mut().ok_or("cannot change layer name")? = name
            }
            Flags(flags) => match layer {
                Layer::Front(_)
                | Layer::Tele(_)
                | Layer::Speedup(_)
                | Layer::Switch(_)
                | Layer::Tune(_)
                | Layer::Invalid(_)
                | Layer::Game(_) => (),
                Layer::Tiles(layer) => layer.detail = (flags & 0b1) == 1,
                Layer::Quads(layer) => layer.detail = (flags & 0b1) == 1,
                Layer::Sounds(layer) => layer.detail = (flags & 0b1) == 1,
            },
            Color(color) => match layer {
                Layer::Tiles(layer) => layer.color = color.into(),
                _ => return Err("cannot change layer color"),
            },
            Width(width) => match layer {
                Layer::Game(_)
                | Layer::Front(_)
                | Layer::Tele(_)
                | Layer::Speedup(_)
                | Layer::Switch(_)
                | Layer::Tune(_) => {
                    for layer in group.layers.iter_mut() {
                        match layer {
                            Layer::Game(layer) => set_layer_width(layer, width as usize)?,
                            Layer::Front(layer) => set_layer_width(layer, width as usize)?,
                            Layer::Tele(layer) => set_layer_width(layer, width as usize)?,
                            Layer::Speedup(layer) => set_layer_width(layer, width as usize)?,
                            Layer::Switch(layer) => set_layer_width(layer, width as usize)?,
                            Layer::Tune(layer) => set_layer_width(layer, width as usize)?,
                            Layer::Tiles(_)
                            | Layer::Quads(_)
                            | Layer::Sounds(_)
                            | Layer::Invalid(_) => (),
                        }
                    }
                }
                Layer::Tiles(layer) => set_layer_width(layer, width as usize)?,
                Layer::Quads(_) | Layer::Invalid(_) | Layer::Sounds(_) => {
                    return Err("cannot change layer dimensions")
                }
            },
            Height(height) => match layer {
                Layer::Game(_)
                | Layer::Front(_)
                | Layer::Tele(_)
                | Layer::Speedup(_)
                | Layer::Switch(_)
                | Layer::Tune(_) => {
                    for layer in group.layers.iter_mut() {
                        match layer {
                            Layer::Game(layer) => set_layer_height(layer, height as usize)?,
                            Layer::Front(layer) => set_layer_height(layer, height as usize)?,
                            Layer::Tele(layer) => set_layer_height(layer, height as usize)?,
                            Layer::Speedup(layer) => set_layer_height(layer, height as usize)?,
                            Layer::Switch(layer) => set_layer_height(layer, height as usize)?,
                            Layer::Tune(layer) => set_layer_height(layer, height as usize)?,
                            Layer::Tiles(_)
                            | Layer::Quads(_)
                            | Layer::Sounds(_)
                            | Layer::Invalid(_) => (),
                        }
                    }
                }
                Layer::Tiles(layer) => set_layer_height(layer, height as usize)?,
                Layer::Quads(_) | Layer::Invalid(_) | Layer::Sounds(_) => {
                    return Err("cannot change layer dimensions")
                }
            },
            Image(Some(_)) => (), // already handled
            Image(None) => match layer {
                Layer::Tiles(layer) => layer.image = None,
                Layer::Quads(layer) => layer.image = None,
                _ => return Err("cannot change layer image"),
            },
            ColorEnv(color_env) => match layer {
                Layer::Tiles(layer) => layer.color_env = color_env, // envelope check performed earlier
                _ => return Err("cannot change layer color envelope"),
            },
            ColorEnvOffset(color_env_off) => match layer {
                Layer::Tiles(layer) => layer.color_env_offset = color_env_off,
                _ => return Err("cannot change layer color envelope offset"),
            },
            Automapper(config) => match layer {
                Layer::Tiles(layer) => layer.automapper_config = config,
                _ => return Err("cannot change layer automapper"),
            },
        }

        Ok(())
    }

    pub fn reorder_layer(&self, reorder_layer: &ReorderLayer) -> Result<(), &'static str> {
        let mut map = self.map.get();
        let group = map
            .groups
            .get_mut(reorder_layer.group as usize)
            .ok_or("invalid group index")?;

        if reorder_layer.layer as usize >= group.layers.len() {
            return Err("invalid layer index");
        }

        if reorder_layer.group != reorder_layer.new_group {
            let layer = group.layers.remove(reorder_layer.layer as usize);

            if reorder_layer.group != reorder_layer.new_group && layer.kind().is_physics_layer() {
                return Err("cannot change physics layer group");
            }

            let new_group = map
                .groups
                .get_mut(reorder_layer.new_group as usize)
                .ok_or("invalid new group index")?;

            if reorder_layer.new_layer as usize > new_group.layers.len() {
                return Err("invalid new layer index");
            }

            new_group
                .layers
                .insert(reorder_layer.new_layer as usize, layer);
        } else if reorder_layer.layer != reorder_layer.new_layer {
            let layer = group.layers.remove(reorder_layer.layer as usize);

            if reorder_layer.new_layer as usize > group.layers.len() {
                return Err("invalid new layer index");
            }

            group.layers.insert(reorder_layer.new_layer as usize, layer);
        }

        Ok(())
    }

    pub fn delete_layer(&self, delete_layer: &DeleteLayer) -> Result<(), &'static str> {
        let mut map = self.map.get();
        let group = map
            .groups
            .get_mut(delete_layer.group as usize)
            .ok_or("invalid group index")?;
        let layer = group
            .layers
            .get_mut(delete_layer.layer as usize)
            .ok_or("invalid layer index")?;

        if layer.kind() != LayerKind::Game {
            group.layers.remove(delete_layer.layer as usize);
            Ok(())
        } else {
            Err("cannot delete the game layer")
        }
    }

    pub fn add_embedded_image(
        &self,
        path: &PathBuf,
        name: String,
        index: u16,
    ) -> Result<(), &'static str> {
        let mut map = self.map.get();

        if name.len() > Image::MAX_NAME_LENGTH {
            return Err("image name too long");
        }

        if index as usize != map.images.len() {
            return Err("invalid image index");
        }

        if map.images.len() == u16::MAX as usize {
            return Err("max number of images reached");
        }

        let mut image = EmbeddedImage::from_file(path).map_err(|_| "failed to load png image")?;
        image.image.check_data().map_err(|_| "invalid image data")?;
        image.name = name;
        map.images.push(Image::Embedded(image));

        Ok(())
    }

    pub fn add_external_image(&self, name: String, index: u16) -> Result<(), &'static str> {
        let mut map = self.map.get();

        if index as usize != map.images.len() {
            return Err("invalid image index");
        }

        if map.images.len() == u16::MAX as usize {
            return Err("max number of images reached");
        }

        let size =
            constants::external_dimensions(&name, map.version).ok_or("invalid external image")?;

        let image = ExternalImage { name, size };
        map.images.push(Image::External(image));

        Ok(())
    }

    pub fn image_info(&self, index: u16) -> Result<ImageInfo, &'static str> {
        let map = self.map.get();
        let image = map
            .images
            .get(index as usize)
            .ok_or("invalid image index")?;
        Ok(ImageInfo {
            index: index as u16,
            name: image.name().to_owned(),
            width: image.size().w as u32,
            height: image.size().h as u32,
        })
    }

    pub fn send_image(&self, peer: &Peer, index: u16) -> Result<(), &'static str> {
        let map = self.map.get();
        let image = map
            .images
            .get(index as usize)
            .ok_or("invalid image index")?;

        match image {
            twmap::Image::External(_) => Err("cannot send external image"),
            twmap::Image::Embedded(image) => {
                let data = image.image.unwrap_ref().as_raw().to_owned();
                peer.tx.unbounded_send(Message::Binary(data)).ok();
                Ok(())
            }
        }
    }

    pub fn remove_image(&self, index: u16) -> Result<(), &'static str> {
        let mut map = self.map.get();

        if index as usize >= map.images.len() {
            return Err("invalid image index");
        }

        if map.is_image_in_use(index) {
            return Err("image in use");
        }

        map.images.remove(index as usize);
        map.edit_image_indices(|i| i.map(|i| if i > index { i - 1 } else { i }));

        Ok(())
    }

    pub fn set_map_info(&self, info: Info) -> Result<(), &'static str> {
        if info.author.len() > Info::MAX_AUTHOR_LENGTH {
            Err("author field too long")
        } else if info.version.len() > Info::MAX_VERSION_LENGTH {
            Err("version field too long")
        } else if info.credits.len() > Info::MAX_CREDITS_LENGTH {
            Err("credits field too long")
        } else if info.license.len() > Info::MAX_LICENSE_LENGTH {
            Err("license field too long")
        } else if info
            .settings
            .iter()
            .filter(|s| s.len() > Info::MAX_SETTING_LENGTH)
            .next()
            .is_some()
        {
            Err("settings line too long")
        } else {
            let mut map = self.map.get();
            map.info = info;
            Ok(())
        }
    }

    pub fn apply_automapper(&self, apply_automapper: &ApplyAutomapper) -> Result<(), &'static str> {
        let mut map = self.map.get();

        // COMBAK: some shenanigans to get the image name before mutable borrow of layer
        // HELP ME RUST GOD THIS HURTS
        let group = map
            .groups
            .get(apply_automapper.group as usize)
            .ok_or("invalid group index")?;
        let layer = group
            .layers
            .get(apply_automapper.layer as usize)
            .ok_or("invalid layer index")?;
        let image_name = if let Layer::Tiles(layer) = layer {
            let img_index = layer.image.ok_or("layer has no image")?;
            let image_name = map
                .images
                .get(img_index as usize)
                .ok_or("internal server error")?
                .name()
                .to_owned();
            Some(image_name)
        } else {
            None
        }
        .ok_or("layer is not a tiles layer")?;

        let group = map
            .groups
            .get_mut(apply_automapper.group as usize)
            .ok_or("invalid group index")?;
        let layer = group
            .layers
            .get_mut(apply_automapper.layer as usize)
            .ok_or("invalid layer index")?;

        match layer {
            Layer::Tiles(layer) => {
                let mut path = self.path.clone();
                path.push(format!("{}.rules", image_name));
                let contents = fs::read_to_string(path).map_err(|_| "automapper file not found")?;
                let automapper = Automapper::parse(image_name, &contents)
                    .map_err(|_| "automapper syntax error")?;
                layer
                    .run_automapper(&automapper)
                    .map_err(|_| "automapper parse failure")?;
                Ok(())
            }
            _ => Err("layer is not a tiles layer"),
        }
    }
}
