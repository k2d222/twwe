// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{collections::BTreeSet, path::PathBuf, sync::Arc};

use platform_dirs::AppDirs;

fn get_data_dirs() -> Vec<PathBuf> {
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

    let maps_dirs = data_dirs
        .into_iter()
        .filter(|path| path.join("maps").is_dir())
        .collect();
    maps_dirs
}

#[tokio::main]
async fn server_main() {
    let cli = twwe_server::cli::Cli {
        addr: "127.0.0.1:16800".to_string(),
        cert: None,
        key: None,
        data_dirs: get_data_dirs(),
        maps_dirs: vec![],
        static_dir: None,
        rpp_path: None,
    };
    let server = Arc::new(twwe_server::create_server(&cli).expect("failed to create the server"));

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
