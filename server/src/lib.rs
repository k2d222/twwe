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

use room::Room;

pub fn create_server(cli: &Cli) -> std::io::Result<Server> {
    let server = Server::new(cli);
    {
        let mut server_rooms = server.rooms();
        for path in cli.maps_dirs.iter() {
            let rooms = std::fs::read_dir(path)?
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    let path = e.path();

                    let room = if path.is_dir() {
                        Room::new_from_dir(path)
                    } else {
                        Room::new_from_files(path, None, None)
                    }?;

                    Some(Arc::new(room))
                });

            for r in rooms {
                let key = r.name().to_owned();
                if !server_rooms.contains_key(&key) {
                    server_rooms.insert(key, r);
                }
            }
        }
    }
    log::info!("found {} maps.", server.rooms().len());
    Ok(server)
}

pub fn init_logger() {
    pretty_env_logger::init_timed();
}
