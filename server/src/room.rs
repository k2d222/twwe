extern crate pretty_env_logger;

use std::{
    collections::HashMap,
    fs::File,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};

use axum::extract::ws::Message;
use parking_lot::{MappedMutexGuard, Mutex, MutexGuard};

use futures::channel::mpsc::UnboundedSender;

use structview::View;
use uuid::Uuid;

use crate::{map_cfg::MapConfig, protocol::*};

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

fn load_map(path: &Path) -> Result<twmap::TwMap, twmap::Error> {
    let mut map = twmap::TwMap::parse_file(path)?;
    map.load()?;
    Ok(map)
}

// We want the room to have the map loaded when at least 1 peer is connected, but unloaded
// when the last peer disconnects. The LazyMap provides these capabilities.
pub struct LazyMap {
    pub path: PathBuf,
    map: Arc<Mutex<Option<twmap::TwMap>>>,
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
        log::debug!("unloaded map '{}'", self.path.display());
    }

    pub fn get(&self) -> MappedMutexGuard<twmap::TwMap> {
        // lazy-load map if not loaded
        let mut map = self.map.lock();
        if map.is_none() {
            *map = load_map(&self.path).ok();
            log::debug!("loaded map '{}'", self.path.display());
        }
        match *map {
            Some(_) => MutexGuard::map(map, |m| m.as_mut().unwrap()),
            None => panic!("failed to load map '{}'", self.path.display()),
        }
    }
}

pub struct Peer {
    // name: String, // TODO add more information about users
    pub addr: SocketAddr,
    pub tx: Tx,
    pub room: Option<Arc<Room>>,
}

impl Peer {
    pub fn new(addr: SocketAddr, tx: Tx) -> Self {
        Peer {
            // name: "Unnamed user".to_owned(),
            addr,
            tx,
            room: None,
        }
    }
}

pub struct RoomPeer {
    pub id: Uuid,
    pub tx: Tx,
    pub cursor: Option<Cursor>,
}

pub struct Room {
    path: PathBuf,
    pub config: MapConfig,
    peers: Mutex<HashMap<SocketAddr, RoomPeer>>,
    map: LazyMap,
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

        let mut config_path = path.clone();
        config_path.push(CFG_FILE_NAME);

        let mut config: MapConfig = File::open(config_path)
            .ok()
            .and_then(|file| serde_json::from_reader(file).ok())
            .unwrap_or_default();

        config.name = path.file_name()?.to_string_lossy().to_string();

        Some(Room {
            path,
            config,
            peers: Mutex::new(HashMap::new()),
            map: LazyMap::new(map_path),
            saving: Mutex::new(()),
        })
    }

    pub fn map(&self) -> MappedMutexGuard<twmap::TwMap> {
        self.map.get()
    }

    pub fn name(&self) -> &str {
        self.config.name.as_ref()
    }

    pub fn path(&self) -> &Path {
        self.path.as_ref()
    }

    pub fn map_path(&self) -> &Path {
        &self.map.path
    }

    pub fn cfg_path(&self) -> PathBuf {
        let mut cfg_path = self.path.clone();
        cfg_path.push(CFG_FILE_NAME);
        cfg_path
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
}
