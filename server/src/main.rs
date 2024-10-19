use std::sync::Arc;

use clap::Parser;

use twwe_server::{cli::Cli, create_server, router::Router};

#[tokio::main]
async fn run_server(args: Cli) {
    if args.maps_dirs.is_empty() && args.data_dirs.is_empty() {
        log::error!("you should provide a path to your maps. Either with the --maps <path_to_maps_folder> or --data <path_to_ddnet_data_folder>.");
        panic!("missing argument --maps or --data");
    }
    let server = Arc::new(create_server(&args).expect("failed to create server"));

    let router = Router::new(server, &args);
    router.run(&args).await;
}

fn main() {
    pretty_env_logger::init_timed();

    let args = Cli::parse();

    run_server(args);
}
