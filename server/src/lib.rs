use std::sync::Arc;

use cli::Cli;

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

#[cfg(feature = "bridge")]
mod bridge;
#[cfg(feature = "bridge")]
mod bridge_router;

use room::Room;

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
                    Some(Arc::new(room))
                });

            for r in rooms {
                let mut key = r.name().to_owned();
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
                    Some(Arc::new(room))
                });

            for r in rooms {
                let mut key = r.name().to_owned();
                while server_rooms.contains_key(&key) {
                    key.push('-');
                }
                server_rooms.insert(key, r);
            }
        }
    }
    let rooms = server.rooms().len();
    log::info!("found {rooms} maps");
    if rooms > server.max_maps {
        log::warn!("there are more maps than is allowed by --max-maps");
    }
    Ok(server)
}
