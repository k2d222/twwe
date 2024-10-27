use std::{fs::File, path::Path};

use serde::{Deserialize, Serialize};

// I updated the content of MapConfig, so this is to convert from the old format
#[derive(Deserialize)]
struct MapConfigOld {
    name: String,
    access: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MapConfig {
    pub name: String,
    pub public: bool,
    pub password: Option<String>,
    pub version: twmap::Version,
}

impl Default for MapConfig {
    fn default() -> Self {
        Self {
            name: Default::default(),
            public: true,
            password: None,
            version: twmap::Version::DDNet06,
        }
    }
}

pub fn read_map_config(path: &Path) -> Option<MapConfig> {
    File::open(path)
        .ok()
        .and_then(|file| serde_json::from_reader(file).ok())
        .or_else(|| {
            File::open(path)
                .ok()
                .and_then(|file| serde_json::from_reader(file).ok())
                .map(|old: MapConfigOld| {
                    let new = MapConfig {
                        name: old.name,
                        public: old.access == "public",
                        password: None,
                        version: twmap::Version::DDNet06,
                    };
                    log::info!(
                        "converting config.json file to new format: {}",
                        path.display()
                    );
                    File::create(path)
                        .ok()
                        .and_then(|f| serde_json::to_writer(f, &new).ok());
                    new
                })
        })
}
