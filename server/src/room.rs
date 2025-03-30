use std::{
    cmp::min,
    collections::HashMap,
    fs::File,
    io::Write,
    path::{Path, PathBuf},
    sync::Arc,
};

use crate::{
    error::Error,
    map_cfg::{read_map_config, MapConfig},
    server::User,
};

fn server_error<E: std::fmt::Display>(err: E) -> Error {
    log::error!("{}", err);
    Error::Internal("".into())
}

fn load_map(path: &Path) -> Result<twmap::TwMap, twmap::Error> {
    let mut map = twmap::TwMap::parse(&std::fs::read(path)?)?;
    map.load()?;
    Ok(map)
}

pub struct Room {
    dir_path: Option<PathBuf>,
    map_path: PathBuf,
    cfg_path: Option<PathBuf>,
    am_path: Option<PathBuf>,
    pub config: MapConfig,
    users: HashMap<String, Arc<User>>,
    map: Option<twmap::TwMap>,
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

        Some(Self {
            dir_path: Some(dir_path),
            map_path,
            cfg_path: Some(cfg_path),
            am_path: Some(am_path),
            config,
            users: HashMap::new(),
            map: None,
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

        Some(Self {
            dir_path: None,
            map_path,
            cfg_path,
            am_path,
            config,
            users: HashMap::new(),
            map: None,
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

    pub fn map(&mut self) -> &mut twmap::TwMap {
        if self.map.is_none() {
            self.map = load_map(&self.map_path).ok();
            log::debug!("map loaded `{}`", self.map_path.display());
        }
        self.map
            .as_mut()
            .unwrap_or_else(|| panic!("failed to load map `{}`", self.map_path.display()))
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

    pub fn add_user(&mut self, user: Arc<User>) {
        self.users.insert(user.token.clone(), user);
    }

    pub fn user_count(&self) -> usize {
        self.users.len()
    }

    pub fn remove_user(&mut self, user: &User) {
        self.users.remove(&user.token);
        if self.users.is_empty() {
            self.map = None;
            log::debug!("map unloaded `{}`", self.map_path.display());
        }
    }

    pub fn users(&self) -> impl Iterator<Item = (&str, Arc<User>)> {
        self.users
            .iter()
            .map(|(addr, user)| (addr.as_str(), user.clone()))
    }

    pub fn user(&self, user: &str) -> Option<Arc<User>> {
        self.users.get(user).cloned()
    }

    pub fn remove_closed_users(&mut self) {
        self.users.retain(|_, p| !p.tx.is_closed());
        if self.users.is_empty() {
            self.map = None;
            log::debug!("map unloaded `{}`", self.map_path.display());
        }
    }

    pub fn save_config(&mut self) -> Result<(), Error> {
        if let Some(cfg_path) = &self.cfg_path {
            let file = File::create(cfg_path).map_err(server_error)?;
            serde_json::to_writer(file, &self.config).map_err(server_error)?;
        }
        Ok(())
    }

    pub fn save_map(&mut self, max_size: usize) -> Result<(), Error> {
        let mut tmp_path = self.map_path.clone();
        tmp_path.set_extension("map.tmp");

        (|| -> Result<(), Error> {
            let mut buf = Vec::with_capacity(min(max_size, 1024 * 1024));
            self.map().save(&mut buf).map_err(server_error)?;

            if buf.len() > max_size {
                return Err(Error::MapTooBig);
            }

            let mut file = File::create(&self.map_path).map_err(server_error)?;
            file.write_all(&buf).map_err(server_error)?;
            Ok(())
        })()?;

        log::debug!("map saved `{}`", self.map_path.display());
        Ok(())
    }
}
