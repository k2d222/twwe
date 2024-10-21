use std::{net::SocketAddr, sync::Arc};

use axum::{
    body::Bytes,
    extract::{ConnectInfo, DefaultBodyLimit, Path, State, WebSocketUpgrade},
    http::Method,
    response::IntoResponse,
    routing::{delete, get, post},
    Json,
};
use axum_extra::{headers::UserAgent, TypedHeader};
use axum_server::tls_rustls::RustlsConfig;

use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};
use tower_http::{
    cors,
    services::{ServeDir, ServeFile},
};
use vek::num_traits::clamp;

use crate::{base64::Base64, protocol::*};
use crate::{Cli, Server};

pub struct Router {
    addr: SocketAddr,
    router: axum::Router,
}

impl Router {
    pub fn new(server: Arc<Server>, args: &Cli) -> Self {
        let addr: SocketAddr = args.addr.parse().expect("not a valid server address");

        let cors = cors::CorsLayer::new()
            .allow_methods(vec![Method::GET, Method::PUT, Method::POST, Method::DELETE])
            .allow_origin(cors::Any)
            .allow_credentials(false)
            .allow_headers(cors::Any);

        let http_routes = axum::Router::new()
            .route("/maps", get(route_get_maps))
            .route(
                "/maps/:map",
                get(route_get_map)
                    .put(route_put_map)
                    .post(route_post_map)
                    .delete(route_delete_map),
            )
            .route(
                "/maps/:map/config",
                get(route_get_config).post(route_post_config),
            )
            .route("/maps/:map/info", get(route_get_info).post(route_post_info))
            .route("/maps/:map/images", get(route_get_images))
            .route("/maps/:map/images/:image", get(route_get_image))
            .route(
                "/maps/:map/envelopes",
                get(route_get_envelopes).put(route_put_envelope),
            )
            .route(
                "/maps/:map/envelopes/:envelope",
                get(route_get_envelope)
                    .post(route_post_envelope)
                    .delete(route_delete_envelope),
            )
            .route(
                "/maps/:map/groups",
                get(route_get_groups).put(route_put_group),
            )
            .route(
                "/maps/:map/groups/:group",
                post(route_post_group).delete(route_delete_group),
            )
            .route(
                "/maps/:map/groups/:group/layers",
                get(route_get_layers).put(route_put_layer),
            )
            .route(
                "/maps/:map/groups/:group/layers/:layer",
                delete(route_delete_layer),
            );
        // .route(
        //     "/maps/:map/map/groups/:group/layers/:layer/tiles",
        //     post(route_post_tiles),
        // )

        let mut router = http_routes;
        router = router.route("/ws", get(route_websocket));

        #[cfg(feature = "bridge")]
        {
            use crate::bridge_router::*;
            if cfg!(feature = "bridge_in") {
                router = router
                    .route("/ws/bridge", get(route_server_bridge))
                    .route("/bridge/:key/ws", get(route_client_bridge))
                    .route("/bridge/:key/maps/:map", get(route_bridge_get_map)) // TODO: add the other bridge http routes
                    .route("/bridge/:key/maps", get(route_bridge_list_maps));
            }
            if cfg!(feature = "bridge_out") {
                router = router
                    .route("/bridge_open", post(route_open_bridge))
                    .route("/bridge_close", get(route_close_bridge))
            }
        }

        let mut router = router
            // rate-limits
            .layer(GovernorLayer {
                config: Arc::new(
                    GovernorConfigBuilder::default()
                        .const_burst_size(args.max_http_bursts)
                        .const_per_millisecond(args.http_ratelimit_delay)
                        .finish()
                        .unwrap(),
                ),
            })
            .layer(DefaultBodyLimit::max(
                clamp(args.max_map_size, 1 * 1024, 50 * 1024) * 1024,
            )) // allows uploading maps between 1MiB-50MiB
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
        log::info!("listening on {}", args.addr);

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
    log::info!("client {addr} connected");
    log::debug!("client user-agent: `{user_agent}`");

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
    let content = MapCreation {
        version: Default::default(),
        public: Default::default(),
        password: Default::default(),
        method: CreationMethod::Upload(Base64(file.to_vec())),
    };
    server.create_map(&map, content)
}

async fn route_post_map(
    State(server): State<Arc<Server>>,
    Path(map): Path<String>,
    Json(map_create): Json<MapCreation>,
) -> impl IntoResponse {
    server.create_map(&map, map_create)
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

async fn route_get_config(
    State(server): State<Arc<Server>>,
    Path(map): Path<String>,
) -> impl IntoResponse {
    server.get_config(&map).map(Json)
}

async fn route_post_config(
    State(server): State<Arc<Server>>,
    Path(map): Path<String>,
    Json(part_config): Json<PartialConfig>,
) -> impl IntoResponse {
    server.edit_config(&map, part_config)
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
    server.edit_info(&map, part_info)
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
    server.edit_envelope(&map, env, part_env)
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
    server.edit_group(&map, group, part_group)
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
