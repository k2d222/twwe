use std::sync::Arc;

use clap::Parser;

use twwe_server::{cli::Cli, create_server, find_data_dirs, router::Router};

#[tokio::main]
async fn run_server(mut args: Cli) {
    if args.maps_dirs.is_empty() && args.data_dirs.is_empty() {
        args.data_dirs = find_data_dirs();
    }
    let server = Arc::new(create_server(&args).expect("failed to create server"));

    let router = Router::new(server, &args);
    router.run(&args).await;
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let args = Cli::parse();

    run_server(args);
}
