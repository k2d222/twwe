extern crate pretty_env_logger;

use std::{
    collections::HashMap,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};

use ndarray::Array2;
use parking_lot::{MappedMutexGuard, Mutex, MutexGuard};

use futures::channel::mpsc::UnboundedSender;

use tokio_tungstenite::tungstenite::protocol::Message;

use twmap::{
    constants, map_checks::CheckData, CompressedData, EmbeddedImage, ExternalImage, FrontLayer,
    GameLayer, Group, Image, Layer, LayerKind, QuadsLayer, SpeedupLayer, SwitchLayer, TeleLayer,
    TileFlags, TileMapLayer, TilesLayer, TuneLayer, TwMap,
};

use crate::{
    protocol::*,
    twmap_map_edit::{extend_layer, shrink_layer},
    Peer,
};

type Tx = UnboundedSender<Message>;

fn server_error<E: std::fmt::Display>(err: E) -> &'static str {
    log::error!("{}", err);
    "internal server error"
}

fn load_map(path: &Path) -> Result<TwMap, twmap::Error> {
    let mut map = TwMap::parse_file(&path)?;
    map.load()?;
    Ok(map)
}

fn set_layer_width<T: TileMapLayer>(layer: &mut T, width: usize) -> Result<(), &'static str> {
    let old_width = layer.tiles().shape().1 as isize;
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

pub fn set_layer_height<T: TileMapLayer>(layer: &mut T, height: usize) -> Result<(), &'static str> {
    let old_height = layer.tiles().shape().0 as isize;
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
    pub fn get_opt(&self) -> MutexGuard<Option<TwMap>> {
        self.map.lock()
    }
}

pub struct Room {
    peers: Mutex<HashMap<SocketAddr, Tx>>,
    pub map: LazyMap,
    saving: Mutex<()>, // this mutex prevents multiple users from saving at the same time
}

impl Room {
    pub fn new(path: PathBuf) -> Self {
        Room {
            peers: Mutex::new(HashMap::new()),
            map: LazyMap::new(path),
            saving: Mutex::new(()),
        }
    }

    pub fn add_peer(&self, peer: &Peer) {
        self.peers().insert(peer.addr, peer.tx.clone());
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

    pub fn peers(&self) -> MutexGuard<HashMap<SocketAddr, Tx>> {
        self.peers.lock()
    }

    pub fn remove_closed_peers(&self) {
        let mut peers = self.peers();
        peers.retain(|_, tx| !tx.is_closed());
        if peers.is_empty() {
            self.map.unload()
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

    pub fn save_copy(&self, path: &PathBuf) -> Result<(), &'static str> {
        // clone the map to release the lock as soon as possible
        self.map
            .get()
            .clone()
            .save_file(path)
            .map_err(server_error)?;

        log::debug!("cloned {} to {}", self.map.path.display(), path.display());
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
            (Layer::Game(layer), Tile(edit)) => {
                let mut tile = tile!(layer);
                tile.id = edit.id;
                tile.flags = TileFlags::from_bits(edit.flags).ok_or("invalid tile flags")?;
                if tile.flags.contains(TileFlags::OPAQUE) {
                    return Err("game layer cannot have the opaque flag");
                }
            }
            (Layer::Tiles(layer), Tile(edit)) => {
                let mut tile = tile!(layer);
                tile.id = edit.id;
                tile.flags = TileFlags::from_bits(edit.flags).ok_or("invalid tile flags")?;
            }
            (Layer::Front(layer), Tile(edit)) => {
                let mut tile = tile!(layer);
                tile.id = edit.id;
                tile.flags = TileFlags::from_bits(edit.flags).ok_or("invalid tile flags")?;
            }
            (Layer::Tele(layer), Tele(edit)) => {
                let mut tile = tile!(layer);
                tile.number = edit.number;
                tile.id = edit.id;
            }
            (Layer::Speedup(layer), Speedup(edit)) => {
                if !(0..360).contains(&edit.angle) {
                    return Err("speedup angle must be in range (0..360)");
                }
                let mut tile = tile!(layer);
                tile.force = edit.force;
                tile.max_speed = edit.max_speed;
                tile.id = edit.id;
                tile.angle = edit.angle.into();
            }
            (Layer::Switch(layer), Switch(edit)) => {
                let mut tile = tile!(layer);
                tile.number = edit.number;
                tile.id = edit.id;
                tile.flags = TileFlags::from_bits(edit.flags).ok_or("invalid tile flags")?;
                tile.delay = edit.delay;
                if tile.flags.contains(TileFlags::OPAQUE) {
                    return Err("switch layer cannot have the opaque flag");
                }
            }
            (Layer::Tune(layer), Tune(edit)) => {
                let mut tile = tile!(layer);
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
        let mut group = map
            .groups
            .get_mut(edit_group.group as usize)
            .ok_or("invalid group index")?;

        use OneGroupChange::*;
        match edit_group.change.clone() {
            OffX(off_x) => group.offset_x = off_x,
            OffY(off_y) => group.offset_y = off_y,
            ParaX(para_x) => group.parallax_x = para_x,
            ParaY(para_y) => group.parallax_y = para_y,
            Name(name) => {
                if group.is_physics_group() {
                    return Err("cannot rename the physics group");
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
        let default_layer_size = map.find_physics_layer::<GameLayer>().unwrap().tiles.shape();
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

                let tiles = CompressedData::Loaded(Array2::default(default_layer_size));
                let layer = $struct { tiles };
                group.layers.push($enum(layer));
            }};
        }

        match create_layer.kind {
            // LayerKind::Game => todo!(),
            LayerKind::Tiles => {
                let mut layer = TilesLayer::new(default_layer_size);
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
            let tile_dims_ok = image.width() % 16 == 0 && image.height() % 16 == 0;

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

        let group = map
            .groups
            .get_mut(edit_layer.group as usize)
            .ok_or("invalid group index")?;
        let layer = group
            .layers
            .get_mut(edit_layer.layer as usize)
            .ok_or("invalid layer index")?;

        match edit_layer.change.clone() {
            Name(name) => *layer.name_mut().ok_or("cannot change layer name")? = name,
            Color(color) => match layer {
                Layer::Tiles(layer) => layer.color = color,
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

        let (width, height) =
            constants::external_dimensions(&name, map.version).ok_or("invalid external image")?;

        let image = ExternalImage {
            name,
            width,
            height,
        };
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
            width: image.width() as u32,
            height: image.height() as u32,
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
}
