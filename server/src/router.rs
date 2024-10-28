use std::{net::SocketAddr, sync::Arc};

use axum::{
    body::Bytes,
    extract::{ws, ConnectInfo, DefaultBodyLimit, Path, State, WebSocketUpgrade},
    http::{
        header::{AUTHORIZATION, CONTENT_TYPE},
        Method,
    },
    response::IntoResponse,
    routing::{delete, get, post},
    Json,
};
use axum_extra::{
    headers::{authorization::Bearer, Authorization, UserAgent},
    TypedHeader,
};
use axum_server::tls_rustls::RustlsConfig;

use rand::Rng;
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};
use tower_http::{
    cors,
    services::{ServeDir, ServeFile},
};
use vek::num_traits::clamp;

use crate::{base64::Base64, error::Error, protocol::*};
use crate::{Cli, Server};

pub struct Router {
    addr: SocketAddr,
    router: axum::Router,
}

impl Router {
    pub fn new(server: Arc<Server>, args: &Cli) -> Self {
        let addr: SocketAddr = args.addr.parse().expect("not a valid server address");

        let cors = cors::CorsLayer::new()
            .allow_methods([Method::GET, Method::PUT, Method::POST, Method::DELETE])
            .allow_headers([CONTENT_TYPE, AUTHORIZATION])
            .allow_origin(cors::AllowOrigin::mirror_request());

        let http_routes = axum::Router::new()
            .route("/http", post(route_http))
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

        #[cfg(feature = "bridge_in")]
        {
            use crate::bridge_router::*;
            router = router
                .route("/ws/bridge", get(route_server_bridge))
                .route("/bridge/:key/ws", get(route_client_bridge))
                .route("/bridge/:key/maps/:map", get(route_bridge_get_map)) // TODO: add the other bridge http routes
                .route("/bridge/:key/maps", get(route_bridge_list_maps));
        }
        #[cfg(feature = "bridge_out")]
        {
            use crate::bridge_out::*;
            router = router
                .route("/bridge_open", post(route_open_bridge))
                .route("/bridge_close", get(route_close_bridge));
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
                clamp(args.max_map_size, 1024, 50 * 1024) * 1024,
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

fn gen_token() -> String {
    rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(20)
        .map(char::from)
        .collect()
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

    let token = gen_token();

    log::info!("client {addr} connected as {token}");
    log::debug!("client user-agent: `{user_agent}`");

    ws.on_upgrade(move |mut socket| async move {
        socket
            .send(ws::Message::Text(format!("{{\"token\":\"{token}\"}}")))
            .await
            .ok();
        server.handle_websocket(token, socket).await;
        log::info!("client {addr} disconnected");
    })
}

fn ensure_access_authorized(
    auth: &Option<TypedHeader<Authorization<Bearer>>>,
    map: &str,
    server: &Server,
) -> Result<(), Error> {
    let room = server.room(map)?;
    let token = auth.as_ref().map(|auth| auth.token());
    let user = token.and_then(|token| server.user(token).ok());
    let authorized = room.config.password.is_none()
        || user
            .as_ref()
            .and_then(|user| user.room())
            .is_some_and(|r| r == room);
    if !authorized {
        log::debug!(
            "unauthorized: `{map}` for {}",
            token.unwrap_or("nameless tee")
        );
    }
    authorized.then_some(()).ok_or(Error::Unauthorized)
}

async fn route_http(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Json(req_packet): Json<RecvPacket>,
) -> impl IntoResponse {
    let user = auth
        .as_ref()
        .map(|auth| auth.token())
        .and_then(|token| server.user(token).ok());

    let resp = server.do_request(user.clone(), req_packet.content.clone());

    if let Some(user) = &user {
        if resp.is_ok() {
            server.do_broadcast(user, &req_packet);
        }
    }

    let resp_packet = SendPacket::new(req_packet.id, Message::Response(resp));
    Json(resp_packet)
}

async fn route_get_maps(State(server): State<Arc<Server>>) -> impl IntoResponse {
    Json(server.get_maps())
}

async fn route_get_map(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path(map): Path<String>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
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
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path(map): Path<String>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.delete_map(&map)
}

async fn route_get_images(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path(map): Path<String>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.get_images(&map).map(Json)
}

async fn route_get_image(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path((map, image)): Path<(String, u16)>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
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
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path(map): Path<String>,
    Json(part_config): Json<PartialConfig>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.edit_config(&map, part_config)
}

async fn route_get_info(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path(map): Path<String>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.get_info(&map).map(Json)
}

async fn route_post_info(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path(map): Path<String>,
    Json(part_info): Json<PartialInfo>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.edit_info(&map, part_info)
}

async fn route_get_envelopes(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path(map): Path<String>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.get_envelopes(&map).map(Json)
}

async fn route_put_envelope(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path(map): Path<String>,
    Json(part_env): Json<PartialEnvelope>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.put_envelope(&map, part_env)
}

async fn route_get_envelope(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path((map, env)): Path<(String, u16)>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.get_envelope(&map, env).map(Json)
}

async fn route_post_envelope(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path((map, env)): Path<(String, u16)>,
    Json(part_env): Json<PartialEnvelope>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.edit_envelope(&map, env, part_env)
}

async fn route_delete_envelope(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path((map, env)): Path<(String, u16)>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.delete_envelope(&map, env)
}

async fn route_get_groups(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path(map): Path<String>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.get_groups(&map).map(Json)
}

async fn route_post_group(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path((map, group)): Path<(String, u16)>,
    Json(part_group): Json<PartialGroup>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.edit_group(&map, group, part_group)
}

async fn route_put_group(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path(map): Path<String>,
    Json(part_group): Json<PartialGroup>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.put_group(&map, part_group)
}

async fn route_delete_group(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path((map, group)): Path<(String, u16)>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.delete_group(&map, group)
}

async fn route_get_layers(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path((map, group)): Path<(String, u16)>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.get_layers(&map, group).map(Json)
}

async fn route_put_layer(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path((map, group)): Path<(String, u16)>,
    Json(part_layer): Json<PartialLayer>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.put_layer(&map, group, part_layer)
}

async fn route_delete_layer(
    State(server): State<Arc<Server>>,
    auth: Option<TypedHeader<Authorization<Bearer>>>,
    Path((map, group, layer)): Path<(String, u16, u16)>,
) -> impl IntoResponse {
    ensure_access_authorized(&auth, &map, &server)?;
    server.delete_layer(&map, group, layer)
}
