use std::path::PathBuf;

use clap::Parser;

#[derive(Parser)]
#[clap(name = "TWWE Server")]
#[clap(author = "Mathis Brossier <mathis.brossier@gmail.com>")]
#[clap(version = "0.1")]
#[clap(about = "TeeWorlds Web Editor server", long_about = None)]
pub struct Cli {
    /// Address and port to listen to (addr:port)
    #[arg(default_value = "127.0.0.1:16800")]
    pub addr: String,

    // Path to the TLS certificate
    #[arg(short, long, requires = "key")]
    pub cert: Option<PathBuf>,

    /// Path to the TLS certificate private key
    #[arg(short, long, requires = "cert")]
    pub key: Option<PathBuf>,

    /// Path to the maps directories (containing sub-directories containing map.map, config.json etc.)
    #[arg(name = "maps", long)]
    pub maps_dirs: Vec<PathBuf>,

    /// Path to ddnet data directories, if you want to read maps from there.
    /// Map will be read in the maps sub-directory, automappers in editor/automap, map
    /// config is volatile for now. Automappers will be shared between all maps in the
    /// same data directory.
    #[arg(name = "data", long)]
    pub data_dirs: Vec<PathBuf>,

    /// Directory of static files to serve
    #[arg(name = "static", short, long)]
    pub static_dir: Option<PathBuf>,

    /// Path to rules++ executable
    #[arg(name = "rpp", long)]
    pub rpp_path: Option<PathBuf>,

    /// Maximum number of maps in both --maps and --data folders. Default: 1000.
    #[arg(long, default_value_t = 1000)]
    pub max_maps: usize,

    /// Maximum size of a map file, in KiB. Default: 10MiB.
    /// FYI: DDNet maps are typically less than 1MiB, the largest is Cerberus, 5MiB.
    #[arg(long, default_value_t = 10 * 1024)]
    pub max_map_size: usize,

    /// Maximum number of simultaneous websocket connections. Default: 100.
    #[arg(long, default_value_t = 100)]
    pub max_connections: usize,
}
