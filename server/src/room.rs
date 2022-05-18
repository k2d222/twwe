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
    protocol::{Change, RoomRequest, RoomResponse, Users},
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

    fn set_tile(&self, change: Change) -> Res<()> {
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
        self.broadcast_change(change)?;
        Ok(())
    }

    fn broadcast_change(&self, change: Change) -> Res<()> {
        let str = serde_json::to_string(&RoomResponse::Change(change))?;
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

    pub fn handle_request(&self, peer: &mut Peer, req: RoomRequest) -> Res<()> {
        match req {
            RoomRequest::Change(change) => self.set_tile(change),
            RoomRequest::Map => self.send_map(peer),
            RoomRequest::Save => self.save_map(),
        }
    }
}
