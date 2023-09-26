use std::{net::SocketAddr, sync::Arc};

use axum::{
    body::Bytes,
    extract::{ConnectInfo, DefaultBodyLimit, Path, State, WebSocketUpgrade},
    headers::UserAgent,
    http::Method,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, TypedHeader,
};
use axum_server::tls_rustls::RustlsConfig;
use tower_http::{
    cors,
    services::{ServeDir, ServeFile},
};

use crate::protocol::*;
use crate::{Cli, Server};

pub struct Router {
    addr: SocketAddr,
    router: axum::Router,
}

impl Router {
    pub fn new(server: Arc<Server>, args: &Cli) -> Self {
        let addr: SocketAddr = args.addr.parse().expect("not a valid server address");
        // log::info!("Listening on: {}", addr);

        let cors = cors::CorsLayer::new()
            .allow_methods(vec![Method::GET, Method::PUT, Method::POST, Method::DELETE])
            .allow_origin(cors::Any)
            .allow_credentials(false)
            .allow_headers(cors::Any);

        let mut router = axum::Router::new()
            .route("/ws", get(route_websocket))
            .route("/maps", get(route_get_maps))
            .route(
                "/maps/:map",
                get(route_get_map)
                    .put(route_put_map)
                    .post(route_post_map)
                    .delete(route_delete_map),
            )
            .route("/maps/:map/map/images", get(route_get_images))
            .route("/maps/:map/map/images/:image", get(route_get_image))
            .route(
                "/maps/:map/map/info",
                get(route_get_info).post(route_post_info),
            )
            .route(
                "/maps/:map/map/envelopes",
                get(route_get_envelopes).put(route_put_envelope),
            )
            .route(
                "/maps/:map/map/envelopes/:envelope",
                get(route_get_envelope)
                    .post(route_post_envelope)
                    .delete(route_delete_envelope),
            )
            .route(
                "/maps/:map/map/groups",
                get(route_get_groups).put(route_put_group),
            )
            .route(
                "/maps/:map/map/groups/:group",
                post(route_post_group).delete(route_delete_group),
            )
            .route(
                "/maps/:map/map/groups/:group/layers",
                get(route_get_layers).put(route_put_layer),
            )
            .route(
                "/maps/:map/map/groups/:group/layers/:layer",
                delete(route_delete_layer),
            )
            // .route(
            //     "/maps/:map/map/groups/:group/layers/:layer/tiles",
            //     post(route_post_tiles),
            // )
            .layer(DefaultBodyLimit::max(2 * 1024 * 1024)) // 2 MiB
            .layer(cors)
            .with_state(server);

        // optional endpoint to serve static files
        if let Some(dir) = &args.static_dir {
            let mut index = dir.clone();
            index.push("index.html");
            router = router
                .nest_service("/", ServeDir::new(dir))
                .route_service("/edit/*_", ServeFile::new(index)); // index.html handles edit routes with svelte-router.
        }

        Self { addr, router }
    }

    pub async fn run(self, args: &Cli) {
        match (&args.cert, &args.key) {
            (Some(cert), Some(key)) => {
                let tls_config = RustlsConfig::from_pem_file(cert, key).await.unwrap();

                axum_server::bind_rustls(self.addr, tls_config)
                    .serve(
                        self.router
                            .into_make_service_with_connect_info::<SocketAddr>(),
                    )
                    .await
                    .unwrap();
            }
            _ => {
                axum_server::bind(self.addr)
                    .serve(
                        self.router
                            .into_make_service_with_connect_info::<SocketAddr>(),
                    )
                    .await
                    .unwrap();
            }
        }
    }
}

async fn route_websocket(
    State(server): State<Arc<Server>>,
    ws: WebSocketUpgrade,
    user_agent: Option<TypedHeader<UserAgent>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> impl IntoResponse {
    let user_agent = if let Some(TypedHeader(user_agent)) = user_agent {
        user_agent.to_string()
    } else {
        String::from("Unknown browser")
    };
    log::info!("`{user_agent}` at {addr} connected.");

    ws.on_upgrade(move |socket| async move { server.handle_websocket(socket, addr).await })
}

async fn route_get_maps(State(server): State<Arc<Server>>) -> impl IntoResponse {
    Json(server.get_maps())
}

async fn route_get_map(
    State(server): State<Arc<Server>>,
    Path(map): Path<String>,
) -> impl IntoResponse {
    server.get_map(&map)
}

async fn route_put_map(
    State(server): State<Arc<Server>>,
    Path(map): Path<String>,
    file: Bytes,
) -> impl IntoResponse {
    server.put_map(&map, &file)
}

async fn route_post_map(
    State(server): State<Arc<Server>>,
    Path(map): Path<String>,
    Json(map_create): Json<MapCreation>,
) -> impl IntoResponse {
    server.post_map(&map, map_create)
}

async fn route_delete_map(
    State(server): State<Arc<Server>>,
    Path(map): Path<String>,
) -> impl IntoResponse {
    server.delete_map(&map)
}

async fn route_get_images(
    State(server): State<Arc<Server>>,
    Path(map): Path<String>,
) -> impl IntoResponse {
    server.get_images(&map).map(Json)
}

async fn route_get_image(
    State(server): State<Arc<Server>>,
    Path((map, image)): Path<(String, u16)>,
) -> impl IntoResponse {
    server.get_image(&map, image)
}

async fn route_get_info(
    State(server): State<Arc<Server>>,
    Path(map): Path<String>,
) -> impl IntoResponse {
    server.get_info(&map).map(Json)
}

async fn route_post_info(
    State(server): State<Arc<Server>>,
    Path(map): Path<String>,
    Json(part_info): Json<PartialInfo>,
) -> impl IntoResponse {
    server.post_info(&map, part_info)
}

async fn route_get_envelopes(
    State(server): State<Arc<Server>>,
    Path(map): Path<String>,
) -> impl IntoResponse {
    server.get_envelopes(&map).map(Json)
}

async fn route_put_envelope(
    State(server): State<Arc<Server>>,
    Path(map): Path<String>,
    Json(part_env): Json<PartialEnvelope>,
) -> impl IntoResponse {
    server.put_envelope(&map, part_env)
}

async fn route_get_envelope(
    State(server): State<Arc<Server>>,
    Path((map, env)): Path<(String, u16)>,
) -> impl IntoResponse {
    server.get_envelope(&map, env).map(Json)
}

async fn route_post_envelope(
    State(server): State<Arc<Server>>,
    Path((map, env)): Path<(String, u16)>,
    Json(part_env): Json<PartialEnvelope>,
) -> impl IntoResponse {
    server.post_envelope(&map, env, part_env)
}

async fn route_delete_envelope(
    State(server): State<Arc<Server>>,
    Path((map, env)): Path<(String, u16)>,
) -> impl IntoResponse {
    server.delete_envelope(&map, env)
}

async fn route_get_groups(
    State(server): State<Arc<Server>>,
    Path(map): Path<String>,
) -> impl IntoResponse {
    server.get_groups(&map).map(Json)
}

async fn route_post_group(
    State(server): State<Arc<Server>>,
    Path((map, group)): Path<(String, u16)>,
    Json(part_group): Json<PartialGroup>,
) -> impl IntoResponse {
    server.post_group(&map, group, part_group)
}

async fn route_put_group(
    State(server): State<Arc<Server>>,
    Path(map): Path<String>,
    Json(part_group): Json<PartialGroup>,
) -> impl IntoResponse {
    server.put_group(&map, part_group)
}

async fn route_delete_group(
    State(server): State<Arc<Server>>,
    Path((map, group)): Path<(String, u16)>,
) -> impl IntoResponse {
    server.delete_group(&map, group)
}

async fn route_get_layers(
    State(server): State<Arc<Server>>,
    Path((map, group)): Path<(String, u16)>,
) -> impl IntoResponse {
    server.get_layers(&map, group).map(Json)
}

async fn route_put_layer(
    State(server): State<Arc<Server>>,
    Path((map, group)): Path<(String, u16)>,
    Json(part_layer): Json<PartialLayer>,
) -> impl IntoResponse {
    server.put_layer(&map, group, part_layer)
}

async fn route_delete_layer(
    State(server): State<Arc<Server>>,
    Path((map, group, layer)): Path<(String, u16, u16)>,
) -> impl IntoResponse {
    server.delete_layer(&map, group, layer)
}
