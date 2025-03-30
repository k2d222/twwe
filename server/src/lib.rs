use parking_lot::RwLock;
use platform_dirs::AppDirs;
use std::{collections::BTreeSet, path::PathBuf, sync::Arc};

use cli::Cli;
use room::Room;
use server::Server;

mod base64;
mod checks;
pub mod cli;
mod error;
mod map_cfg;
mod protocol;
mod room;
pub mod router;
mod server;
mod twmap_map_checks;
mod twmap_map_edit;
mod util;

#[cfg(feature = "bridge_in")]
mod bridge_in;
#[cfg(feature = "bridge_out")]
mod bridge_out;
#[cfg(feature = "bridge_in")]
mod bridge_router;

pub fn find_data_dirs() -> Vec<PathBuf> {
    // like ddnet's storage.cfg, the last path has the highest priority.
    let mut data_dirs = BTreeSet::new();

    // ddnet's $USERDIR
    if let Some(dirs) = AppDirs::new(Some("ddnet"), false) {
        data_dirs.insert(dirs.config_dir);
        data_dirs.insert(dirs.data_dir);
    }
    // ddnet's $DATADIR
    let known_ddnets = [
        "/usr/share/ddnet/data",
        "/usr/share/games/ddnet/data",
        "/usr/local/share/ddnet/data",
        "/usr/local/share/games/ddnet/data",
        "/usr/pkg/share/ddnet/data",
        "/usr/pkg/share/games/ddnet/data",
        "/opt/ddnet/data",
    ];
    known_ddnets.iter().for_each(|str| {
        let path = PathBuf::from(str);
        data_dirs.insert(path);
    });
    // ddnet's $CURRENTDIR
    if let Ok(dir) = std::env::current_dir() {
        data_dirs.insert(dir.join("data"));
        data_dirs.insert(dir);
    }

    data_dirs
        .into_iter()
        .filter(|path| path.join("maps").is_dir())
        .collect()
}

pub fn create_server(cli: &Cli) -> std::io::Result<Server> {
    let server = Server::new(cli);
    {
        let mut server_rooms = server.rooms();

        for path in cli.data_dirs.iter() {
            let rooms = std::fs::read_dir(path.join("maps"))?
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    let map_path = e.path();
                    let am_path = path.join("editor/automap");
                    let room = if map_path.is_file() {
                        Room::new_from_files(map_path, None, Some(am_path))
                    } else {
                        None
                    }?;
                    Some(Arc::new(RwLock::new(room)))
                });

            for r in rooms {
                let mut key = r.read().name().to_owned();
                while server_rooms.contains_key(&key) {
                    key.push('-');
                }
                server_rooms.insert(key, r);
            }
        }

        for path in cli.maps_dirs.iter() {
            let rooms = std::fs::read_dir(path)?
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    let map_path = e.path();
                    let room = if map_path.is_dir() {
                        Room::new_from_dir(map_path)
                    } else {
                        None
                    }?;
                    Some(Arc::new(RwLock::new(room)))
                });

            for r in rooms {
                let mut key = r.read().name().to_owned();
                while server_rooms.contains_key(&key) {
                    key.push('-');
                }
                server_rooms.insert(key, r);
            }
        }
    }
    let rooms = server.rooms().len();
    log::debug!("server config: {cli:#?}");
    log::info!("found {rooms} maps");
    if rooms > server.max_maps {
        log::warn!("there are more maps than is allowed by --max-maps");
    }
    Ok(server)
}
