use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr},
    sync::Arc,
};

use axum::extract::ws::{Message as WebSocketMessage, WebSocketUpgrade};
use axum::{
    extract::{ConnectInfo, Path, State},
    response::IntoResponse,
    Json,
};
use axum_extra::{headers::UserAgent, TypedHeader};
use futures::channel::mpsc::unbounded;
use futures_util::StreamExt;

use crate::Server;
use crate::{
    bridge::BridgeConfig,
    error::Error,
    protocol::{self, *},
    util::timestamp_now,
};

pub(crate) async fn bridge_oneshot(
    server: &Server,
    key: &str,
    req: protocol::Request,
) -> Result<Response, Error> {
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), rand::random());

    let pkt = RecvPacket {
        timestamp: timestamp_now(),
        id: rand::random(),
        content: req,
    };

    let (http_tx, mut http_rx) = unbounded();

    {
        let mut bridges = server.remote_bridges.write().unwrap();
        let bridge = bridges
            .values_mut()
            .find(|v| v.key == key)
            .ok_or(Error::BridgeNotFound)?;
        bridge.peers_tx.insert(addr, http_tx);
    }
    {
        let bridges = server.remote_bridges.read().unwrap();
        let bridge = bridges
            .values()
            .find(|v| v.key == key)
            .ok_or(Error::BridgeNotFound)?;

        let addr_msg = WebSocketMessage::Text(serde_json::to_string(&addr).unwrap()); // this must not fail
        let req_msg = WebSocketMessage::Text(serde_json::to_string(&pkt).unwrap());

        bridge.server_tx.unbounded_send(addr_msg).ok();
        bridge.server_tx.unbounded_send(req_msg).ok();
    }

    let resp = http_rx.next().await.ok_or(Error::BridgeFailure)?;

    if let WebSocketMessage::Text(resp_msg) = resp {
        let resp: SendPacket = serde_json::from_str(&resp_msg).map_err(|_| Error::BridgeFailure)?;

        match resp.content {
            Message::Response(Ok(resp)) => Ok(resp),
            _ => Err(Error::BridgeFailure),
        }
    } else {
        Err(Error::BridgeFailure)
    }
}

pub(crate) async fn route_bridge_get_map(
    State(server): State<Arc<Server>>,
    Path((key, map)): Path<(String, String)>,
) -> impl IntoResponse {
    let req = protocol::Request::GetMap(map);
    let resp = bridge_oneshot(&server, &key, req).await?;

    if let protocol::Response::Map(base64) = resp {
        Ok(base64.0)
    } else {
        Err(Error::BridgeFailure)
    }
}

pub(crate) async fn route_bridge_list_maps(
    State(server): State<Arc<Server>>,
    Path(key): Path<String>,
) -> impl IntoResponse {
    let resp = bridge_oneshot(&server, &key, protocol::Request::ListMaps).await?;

    if let protocol::Response::Maps(maps) = resp {
        Ok(Json(maps))
    } else {
        Err(Error::BridgeFailure)
    }
}

pub(crate) async fn route_open_bridge(
    State(server): State<Arc<Server>>,
    Json(cfg): Json<BridgeConfig>,
) -> impl IntoResponse {
    Server::open_bridge(server, cfg).await
}

pub(crate) async fn route_close_bridge(State(server): State<Arc<Server>>) -> impl IntoResponse {
    server.close_bridge();
}

pub(crate) async fn route_server_bridge(
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

    log::info!("remote server {addr} requested bridging.");
    log::debug!("remote server user-agent: `{user_agent}`");

    ws.on_upgrade(move |socket| async move {
        let res = server.handle_server_bridge(socket, addr).await;
        match res {
            Ok(()) => log::info!("remote server {addr} bridge closed"),
            Err(e) => log::error!("remote server bridge closed: {e}"),
        }
    })
}

pub(crate) async fn route_client_bridge(
    Path(key): Path<String>,
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

    log::info!("client {addr} requested connection to remote with key {key}.");
    log::debug!("client user-agent: `{user_agent}`");

    ws.on_upgrade(move |socket| async move {
        let res = server.handle_client_bridge(socket, addr, key).await;
        match res {
            Ok(()) => log::info!("client {addr} disconnected from remote"),
            Err(e) => log::error!("client {addr} disconnected from remote: {e}"),
        }
    })
}
