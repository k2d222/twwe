// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{collections::BTreeSet, path::PathBuf, sync::Arc};

use twwe_server::find_data_dirs;

#[tokio::main]
async fn server_main() {
    let cli = twwe_server::cli::Cli {
        addr: "127.0.0.1:16800".to_string(),
        cert: None,
        key: None,
        data_dirs: find_data_dirs(),
        maps_dirs: vec![],
        static_dir: None,
        rpp_path: None,
        max_maps: 10000,
        max_map_size: 100 * 1024, // 100MiB
        max_connections: 100,
        max_http_bursts: 100,
        http_ratelimit_delay: 500,
    };
    let server = Arc::new(twwe_server::create_server(&cli).expect("failed to create the server"));

    let router = twwe_server::router::Router::new(server, &cli);

    router.run(&cli).await;
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    std::thread::spawn(server_main);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
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
