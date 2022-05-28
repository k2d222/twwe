extern crate pretty_env_logger;

use std::{
    collections::HashMap,
    error::Error,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};

use parking_lot::{MappedMutexGuard, Mutex, MutexGuard};

use futures::channel::mpsc::UnboundedSender;

use tungstenite::protocol::Message;

use twmap::{Layer, TwMap};

use crate::{
    protocol::{
        GroupChange, LayerChange, OneGroupChange, OneLayerChange, RoomRequest, RoomResponse,
        TileChange, Users,
    },
    Peer,
};

type Tx = UnboundedSender<Message>;
type Res<T> = Result<T, Box<dyn Error>>;

fn load_map(path: &Path) -> Res<TwMap> {
    let mut map = TwMap::parse_file(&path)?;
    map.load()?;
    Ok(map)
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

    fn get(&self) -> Res<MappedMutexGuard<TwMap>> {
        // lazy-load map if not loaded
        let mut map = self.map.lock();
        if *map == None {
            *map = load_map(&self.path).ok();
            log::debug!("loaded map {}", self.path.display());
        }
        match *map {
            Some(_) => Ok(MutexGuard::map(map, |m| m.as_mut().unwrap())),
            None => Err(format!("failed to load map {}", self.path.display()).into()),
        }
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
        self.broadcast_users();
    }

    pub fn remove_peer(&self, peer: &Peer) {
        self.peers().remove(&peer.addr);
        if self.peers().is_empty() {
            self.map.unload()
        }
        self.broadcast_users();
    }

    pub fn peers(&self) -> MutexGuard<HashMap<SocketAddr, Tx>> {
        self.peers.lock()
    }

    fn send_map(&self, peer: &Peer) -> Res<()> {
        let buf = {
            let mut buf = Vec::new();
            self.map.get()?.save(&mut buf)?; // TODO: this is blocking for the server
            buf
        };
        peer.tx.unbounded_send(Message::Binary(buf))?;

        Ok(())
    }

    fn save_map(&self) -> Res<()> {
        // Avoid concurrent saves
        let _lck = self.saving.lock();

        // clone the map to release the lock as soon as possible
        self.map.get()?.clone().save_file(&self.map.path)?;
        log::info!("saved {}", self.map.path.display());
        Ok(())
    }

    fn set_tile(&self, change: TileChange) -> Res<()> {
        let mut map = self.map.get()?;
        let layer = map
            .groups
            .iter_mut()
            .find_map(|g| {
                g.layers.iter_mut().find_map(|l| match l {
                    Layer::Game(gl) => Some(gl),
                    _ => None,
                })
            })
            .ok_or("no game layer")?;
        let tiles = layer.tiles.unwrap_mut(); // map must be loaded
        let mut tile = tiles
            .get_mut((change.y as usize, change.x as usize))
            .ok_or("tile change outside layer")?;
        tile.id = change.id;

        log::debug!("changed pixel {:?}", change);
        self.broadcast(&RoomResponse::TileChange(change))?;
        Ok(())
    }

    fn broadcast(&self, resp: &RoomResponse) -> Res<()> {
        let str = serde_json::to_string(resp)?;
        let msg = Message::Text(str);
        for (_addr, tx) in self.peers().iter() {
            tx.unbounded_send(msg.clone())?;
        }
        Ok(())
    }

    fn broadcast_users(&self) {
        let n = self.peers().len();
        let resp = Users { count: n as u32 };
        let str = serde_json::to_string(&RoomResponse::Users(resp)).unwrap();
        let msg = Message::Text(str);
        for (_addr, tx) in self.peers().iter() {
            tx.unbounded_send(msg.clone()).unwrap();
        }
    }

    fn handle_group_change(&self, change: GroupChange) -> Res<()> {
        {
            let mut map = self.map.get()?;
            let mut group = map
                .groups
                .get_mut(change.group as usize)
                .ok_or("invalid group index")?;

            use OneGroupChange::*;
            match change.change.clone() {
                // FIXME: we don't accept reordering atm because it can
                // lead to desync between clients when they perform edits
                // at the same time and layer / group ids don't refer to the
                // same. We would need to uniquely identify groups / layers
                // to avoid this.
                // Order(order) => {
                //     let group = map.groups.remove(change.group as usize);
                //     map.groups.insert(order as usize, group);
                // }
                Order(_) => return Err("TODO: Reordering not supported yet.".into()),
                OffX(off_x) => group.offset_x = off_x,
                OffY(off_y) => group.offset_y = off_y,
                ParaX(para_x) => group.parallax_x = para_x,
                ParaY(para_y) => group.parallax_y = para_y,
                Name(name) => group.name = name,
            }
        }

        self.broadcast(&RoomResponse::GroupChange(change))?;
        Ok(())
    }

    fn handle_layer_change(&self, change: LayerChange) -> Res<()> {
        let mut map = self.map.get()?;
        let layer = map
            .groups
            .get_mut(change.group as usize)
            .ok_or("invalid group index")?
            .layers
            .get_mut(change.layer as usize)
            .ok_or("invalid layer index")?;

        use OneLayerChange::*;
        match change.change.clone() {
            // FIXME: see fixme for handle_group_change.
            Order(_) => return Err("TODO: Reordering not supported yet.".into()),
            Name(name) => *layer.name_mut().ok_or("cannot change layer name")? = name,
            Color(color) => match layer {
                Layer::Tiles(layer) => layer.color = color,
                _ => return Err("cannot change layer color".into()),
            },
        }

        self.broadcast(&RoomResponse::LayerChange(change))?;
        Ok(())
    }

    pub fn handle_request(&self, peer: &mut Peer, req: RoomRequest) -> Res<()> {
        match req {
            RoomRequest::GroupChange(change) => self.handle_group_change(change),
            RoomRequest::LayerChange(change) => self.handle_layer_change(change),
            RoomRequest::TileChange(change) => self.set_tile(change),
            RoomRequest::Map => self.send_map(peer),
            RoomRequest::Save => self.save_map(),
        }
    }
}
