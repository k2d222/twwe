// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{collections::BTreeSet, path::PathBuf, sync::Arc};

use platform_dirs::AppDirs;

fn get_maps_dirs() -> Vec<PathBuf> {
    // like ddnet's storage.cfg, the last path has the highest priority.
    let mut maps_dirs = BTreeSet::new();

    // ddnet's $USERDIR
    if let Some(mut dirs) = AppDirs::new(Some("ddnet"), false) {
        dirs.config_dir.push("maps");
        dirs.data_dir.push("maps");
        maps_dirs.insert(dirs.config_dir);
        maps_dirs.insert(dirs.data_dir);
    }
    // ddnet's $DATADIR
    let known_ddnets = [
        "/usr/share/ddnet/data/maps",
        "/usr/share/games/ddnet/data/maps",
        "/usr/local/share/ddnet/data/maps",
        "/usr/local/share/games/ddnet/data/maps",
        "/usr/pkg/share/ddnet/data/maps",
        "/usr/pkg/share/games/ddnet/data/maps",
        "/opt/ddnet/data/maps",
    ];
    known_ddnets.iter().for_each(|str| {
        let path = PathBuf::from(str);
        maps_dirs.insert(path);
    });
    if let Ok(mut dir) = std::env::current_dir() {
        dir.push("data/maps");
        maps_dirs.insert(dir);
    }
    // ddnet's $CURRENTDIR
    if let Ok(mut dir) = std::env::current_dir() {
        dir.push("maps");
        maps_dirs.insert(dir);
    }

    let maps_dirs = maps_dirs.into_iter().filter(|path| path.exists()).collect();
    maps_dirs
}

#[tokio::main]
async fn server_main() {
    let cli = twwe_server::cli::Cli {
        addr: "127.0.0.1:16800".to_string(),
        cert: None,
        key: None,
        maps_dirs: get_maps_dirs(),
        static_dir: None,
        rpp_path: None,
    };
    let server = Arc::new(twwe_server::create_server(&cli).expect("failed to create server"));

    let router = twwe_server::router::Router::new(server, &cli);

    router.run(&cli).await;
}

fn main() {
    twwe_server::init_logger();
    std::thread::spawn(server_main);

    let app = tauri::Builder::default()
        .setup(|_app| Ok(()))
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|_app_handle, event| match event {
        // tauri::RunEvent::Exit => todo!(),
        // tauri::RunEvent::ExitRequested { api } => todo!(),
        // tauri::RunEvent::WindowEvent { label, event } => todo!(),
        // tauri::RunEvent::Ready => todo!(),
        // tauri::RunEvent::Resumed => todo!(),
        // tauri::RunEvent::MainEventsCleared => todo!(),
        _ => (),
    });
}
