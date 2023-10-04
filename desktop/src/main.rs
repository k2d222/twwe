// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;

#[tokio::main]
async fn server_main() {
    let cli = server::cli::Cli {
        addr: "127.0.0.1:16800".to_string(),
        cert: None,
        key: None,
        static_dir: None,
        rpp_path: None,
    };
    let server = Arc::new(server::create_server(&cli));

    let router = server::router::Router::new(server, &cli);

    router.run(&cli).await;
}

fn main() {
    server::init_logger();
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
