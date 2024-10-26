use std::{
    cmp::min,
    collections::HashMap,
    fs::File,
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
};

use axum::extract::ws::Message as WebSocketMessage;
use parking_lot::{MappedMutexGuard, Mutex, MutexGuard};

use futures::channel::mpsc::UnboundedSender;

use uuid::Uuid;

use crate::{
    error::Error,
    map_cfg::{read_map_config, MapConfig},
    protocol::*,
    server::User,
};

type Tx = UnboundedSender<WebSocketMessage>;

fn server_error<E: std::fmt::Display>(err: E) -> Error {
    log::error!("{}", err);
    Error::Internal("".into())
}

fn load_map(path: &Path) -> Result<twmap::TwMap, twmap::Error> {
    let mut map = twmap::TwMap::parse(&std::fs::read(path)?)?;
    map.load()?;
    Ok(map)
}

// We want the room to have the map loaded when at least 1 user is connected, but unloaded
// when the last user disconnects. The LazyMap provides these capabilities.
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
        log::debug!("map `{}` unloaded", self.path.display());
    }

    pub fn get(&self) -> MappedMutexGuard<twmap::TwMap> {
        // lazy-load map if not loaded
        let mut map = self.map.lock();
        if map.is_none() {
            *map = load_map(&self.path).ok();
            log::debug!("map `{}` loaded", self.path.display());
        }
        match *map {
            Some(_) => MutexGuard::map(map, |m| m.as_mut().unwrap()),
            None => panic!("failed to load map `{}`", self.path.display()),
        }
    }
}

pub struct Roomuser {
    pub id: Uuid,
    pub tx: Tx,
    pub cursor: Option<Cursor>,
}

pub struct Room {
    dir_path: Option<PathBuf>,
    map_path: PathBuf,
    cfg_path: Option<PathBuf>,
    am_path: Option<PathBuf>,
    pub config: MapConfig,
    users: Mutex<HashMap<String, Roomuser>>,
    map: LazyMap,
    saving: Mutex<()>, // this mutex prevents multiple users from saving at the same time
}

const MAP_FILE_NAME: &str = "map.map";
const CFG_FILE_NAME: &str = "config.json";
const AUTOMAPPER_DIR_NAME: &str = "automappers";

impl Room {
    pub fn new_from_dir(dir_path: PathBuf) -> Option<Self> {
        let mut map_path = dir_path.clone();
        map_path.push(MAP_FILE_NAME);

        if !map_path.exists() {
            return None;
        }

        let mut cfg_path = dir_path.clone();
        cfg_path.push(CFG_FILE_NAME);

        let mut am_path = dir_path.clone();
        am_path.push(AUTOMAPPER_DIR_NAME);

        let name = dir_path.file_name()?.to_string_lossy().to_string();

        let config = read_map_config(&cfg_path).unwrap_or_else(|| MapConfig {
            name,
            ..Default::default()
        });

        let map = LazyMap::new(map_path.clone());

        Some(Room {
            dir_path: Some(dir_path),
            map_path,
            cfg_path: Some(cfg_path),
            am_path: Some(am_path),
            config,
            users: Mutex::new(HashMap::new()),
            map,
            saving: Mutex::new(()),
        })
    }

    pub fn new_from_files(
        map_path: PathBuf,
        cfg_path: Option<PathBuf>,
        am_path: Option<PathBuf>,
    ) -> Option<Self> {
        let name = map_path.file_stem()?.to_string_lossy().to_string();

        let config = cfg_path
            .as_ref()
            .and_then(|path| read_map_config(path))
            .unwrap_or_else(|| MapConfig {
                name,
                ..Default::default()
            });

        let map = LazyMap::new(map_path.clone());

        Some(Room {
            dir_path: None,
            map_path,
            cfg_path,
            am_path,
            config,
            users: Mutex::new(HashMap::new()),
            map,
            saving: Mutex::new(()),
        })
    }

    pub fn delete(&self) {
        if let Some(path) = &self.dir_path {
            std::fs::remove_dir_all(path).ok();
        } else {
            std::fs::remove_file(&self.map_path).ok();
            if let Some(path) = &self.cfg_path {
                std::fs::remove_file(path).ok();
            }
        }
    }

    pub fn map(&self) -> MappedMutexGuard<twmap::TwMap> {
        self.map.get()
    }

    pub fn name(&self) -> &str {
        self.config.name.as_ref()
    }

    pub fn dir_path(&self) -> Option<&Path> {
        self.dir_path.as_deref()
    }

    pub fn map_path(&self) -> &Path {
        self.map_path.as_ref()
    }

    pub fn cfg_path(&self) -> Option<&Path> {
        self.cfg_path.as_deref()
    }

    pub fn automapper_path(&self) -> Option<&Path> {
        self.am_path.as_deref()
    }

    pub fn add_user(&self, user: &User) {
        self.users().insert(
            user.token.clone(),
            Roomuser {
                id: Uuid::new_v4(),
                tx: user.tx.clone(),
                cursor: None,
            },
        );
    }

    pub fn user_count(&self) -> usize {
        self.users().len()
    }

    pub fn remove_user(&self, user: &User) {
        self.users().remove(&user.token);
        if self.users().is_empty() {
            self.map.unload()
        }
    }

    pub fn users(&self) -> MutexGuard<HashMap<String, Roomuser>> {
        self.users.lock()
    }

    pub fn remove_closed_users(&self) {
        let mut users = self.users();
        users.retain(|_, p| !p.tx.is_closed());
        if users.is_empty() {
            self.map.unload()
        }
    }

    pub fn save_config(&self) -> Result<(), Error> {
        if let Some(cfg_path) = &self.cfg_path {
            let file = File::create(cfg_path).map_err(server_error)?;
            serde_json::to_writer(file, &self.config).map_err(server_error)?;
        }
        Ok(())
    }

    pub fn save_map(&self, max_size: usize) -> Result<(), Error> {
        // clone the map to release the lock as soon as possible
        let mut tmp_path = self.map.path.clone();
        tmp_path.set_extension("map.tmp");

        (|| -> Result<(), Error> {
            // Avoid concurrent saves
            let _lck = self.saving.lock();

            let mut buf = Vec::with_capacity(min(max_size, 1024 * 1024));
            self.map
                .get()
                .clone()
                .save(&mut buf)
                .map_err(server_error)?;

            if buf.len() > max_size {
                return Err(Error::MapTooBig);
            }

            let mut file = File::create(&self.map.path).map_err(server_error)?;
            file.write_all(&buf).map_err(server_error)?;
            Ok(())
        })()?;

        log::debug!("map `{}` saved", self.map.path.display());
        Ok(())
    }
}
