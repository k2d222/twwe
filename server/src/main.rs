use std::sync::Arc;

use clap::Parser;
use cli::Cli;

use glob::glob;
use router::Router;
use server::Server;

mod base64;
mod checks;
mod cli;
mod error;
mod map_cfg;
mod protocol;
mod room;
mod router;
mod server;
mod twmap_map_checks;
mod twmap_map_edit;
mod util;

use room::Room;

fn create_server(cli: &Cli) -> std::io::Result<Server> {
    let server = Server::new(cli);
    {
        let mut server_rooms = server.rooms();
        for path in cli.maps_path.iter() {
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
                server_rooms.insert(r.name().to_owned(), r);
            }
        }
    }
    log::info!("found {} maps.", server.rooms().len());
    Ok(server)
}

#[tokio::main]
async fn run_server(args: Cli) {
    let server = Arc::new(create_server(&args).expect("failed to create server"));

    let router = Router::new(server, &args);
    router.run(&args).await;
}

fn main() {
    pretty_env_logger::init_timed();

    let args = Cli::parse();

    run_server(args);
}
