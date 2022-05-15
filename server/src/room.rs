extern crate pretty_env_logger;

use std::{
    collections::HashMap,
    error::Error,
    net::SocketAddr,
    sync::{Mutex, MutexGuard},
};

use futures::channel::mpsc::UnboundedSender;

use tungstenite::protocol::Message;

use twmap::{Layer, TwMap};

use crate::{
    protocol::{Change, RoomRequest, RoomResponse, Users},
    Peer,
};

type Tx = UnboundedSender<Message>;
type Res<T> = Result<T, Box<dyn Error>>;

fn load_map(name: &str) -> TwMap {
    let path = format!("maps/{}.map", name);
    let mut map = TwMap::parse_file(&path).expect("failed to parse map");

    // use std::time::Instant;
    // let now = Instant::now();
    // map.save_file(&format!("{}.map", path));
    // let elapsed = now.elapsed();
    // println!("Elapsed: {:.2?}", elapsed);

    map.load().expect("failed to load map");
    // state.maps.insert(name.to_string(), map);
    log::info!("loaded map {}", name);
    map
}

#[derive(Debug)]
pub struct Room {
    name: String,
    peers: Mutex<HashMap<SocketAddr, Tx>>,
    map: Mutex<TwMap>,
    saving: Mutex<()>, // this mutex prevents multiple users from saving at the same time
}

impl Room {
    fn new(name: String, map: TwMap) -> Self {
        Room {
            peers: Mutex::new(HashMap::new()),
            map: Mutex::new(map),
            name,
            saving: Mutex::new(()),
        }
    }

    pub fn create(name: String) -> Self {
        let map = load_map(&name);
        Room::new(name, map)
    }

    pub fn add_peer(&self, peer: &Peer) {
        self.peers().insert(peer.addr, peer.tx.clone());
        self.send_map(peer).unwrap();
        self.broadcast_users();
    }

    pub fn remove_peer(&self, peer: &Peer) {
        self.peers().remove(&peer.addr);
        self.broadcast_users();
    }

    fn map(&self) -> MutexGuard<TwMap> {
        self.map.lock().expect("failed to lock map")
    }

    fn peers(&self) -> MutexGuard<HashMap<SocketAddr, Tx>> {
        self.peers.lock().expect("failed to lock peers")
    }

    fn send_map(&self, peer: &Peer) -> Res<()> {
        let buf = {
            let mut buf = Vec::new();
            self.map().save(&mut buf)?; // TODO: this is blocking for the server
            buf
        };
        peer.tx.unbounded_send(Message::Binary(buf))?;

        Ok(())
    }

    fn save_map(&self, name: String) -> Res<()> {
        if name != self.name {
            return Err("map name mismatch".into());
        }

        // Avoid concurrent saves
        let _lck = self.saving.lock().unwrap();

        // clone the map to release the lock as soon as possible
        let path = format!("maps/{}.map", self.name);
        self.map().clone().save_file(path)?;
        log::info!("saved {}", self.name);
        Ok(())
    }

    fn set_tile(&self, change: Change) -> Res<()> {
        {
            let mut map = self.map();
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
        }

        // broadcast message
        {
            let str = serde_json::to_string(&RoomResponse::Change(change)).unwrap();
            let msg = Message::Text(str);
            for (_addr, tx) in self.peers().iter() {
                tx.unbounded_send(msg.clone()).unwrap();
            }
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
            RoomRequest::Save(map_name) => self.save_map(map_name),
        }
    }
}
