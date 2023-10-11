use std::sync::Arc;

use clap::Parser;

use twwe_server::{cli::Cli, create_server, router::Router};

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
