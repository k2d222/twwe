use std::path::PathBuf;

use clap::Parser;

#[derive(Parser)]
#[clap(name = "TWWE Server")]
#[clap(author = "Mathis Brossier <mathis.brossier@gmail.com>")]
#[clap(version = "0.1")]
#[clap(about = "TeeWorlds Web Editor server", long_about = None)]
pub struct Cli {
    /// Address and port to listen to (addr:port)
    #[clap(value_parser, default_value = "127.0.0.1:16800")]
    pub addr: String,

    // Path to the TLS certificate
    #[clap(value_parser, short, long, requires = "key")]
    pub cert: Option<PathBuf>,

    /// Path to the TLS certificate private key
    #[clap(value_parser, short, long, requires = "cert")]
    pub key: Option<PathBuf>,

    /// Directory of static files to serve
    #[clap(name = "static", value_parser, short, long)]
    pub static_dir: Option<PathBuf>,

    /// path to rules++ executable
    #[clap(name = "rpp", value_parser, long)]
    pub rpp_path: Option<PathBuf>,
}
