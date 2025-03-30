use std::{collections::HashMap, sync::Arc};

use axum::{
    extract::{ws::Message as WebSocketMessage, State},
    response::IntoResponse,
    Json,
};
use futures::{channel::mpsc::unbounded, SinkExt, StreamExt, TryStreamExt};
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tokio_tungstenite::tungstenite::protocol::{frame::coding::CloseCode, CloseFrame};
use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;

use crate::{error::Error, protocol::*, server::Server, server::User};

use futures_util::{future::Either, stream};
use tokio_tungstenite::connect_async;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BridgeConfig {
    pub map: String,
    pub key: String,
    pub url: String,
}

impl Server {
    /// Open a bridge with a remote server
    pub async fn open_bridge(server: Arc<Server>, cfg: BridgeConfig) -> Result<(), Error> {
        server.close_bridge();
        let (socket, _resp) = connect_async(&cfg.url)
            .await
            .map_err(|_| Error::BridgeNotFound)?;
        let (mut ws_send, ws_recv) = socket.split();

        ws_send
            .send(TungsteniteMessage::Text(
                serde_json::to_string(&cfg).unwrap(),
            ))
            .await
            .map_err(|_| Error::BridgeClosed)?;

        let (tx, rx) = unbounded();
        let fut_send = rx.map(Ok).forward(ws_send);

        let mut bridge_users: HashMap<String, Arc<User>> = Default::default();

        let server_2 = server.clone();

        let fut_recv = ws_recv
            .try_chunks(2)
            .map_err(|_| Error::BridgeClosed)
            .try_for_each(move |v| {
                let (addr_msg, payload_msg) = match v.into_iter().collect_tuple() {
                    Some((TungsteniteMessage::Text(m1), TungsteniteMessage::Text(m2))) => (m1, m2),
                    _ => return futures::future::err(Error::BridgeClosed),
                };

                let res = || -> Option<()> {
                    let token: String = serde_json::from_str(&addr_msg).ok()?;
                    let user = match bridge_users.get(&token).cloned() {
                        Some(user) => user,
                        None => {
                            let (user_send, user_recv) = unbounded();
                            let addr_msg = addr_msg.clone();
                            let fut = user_recv
                                .flat_map(move |payload| {
                                    stream::iter(vec![
                                        WebSocketMessage::Text(addr_msg.clone()),
                                        payload,
                                    ])
                                })
                                // we need to do a bit of juggling here because we combine axum's tungstenite
                                // with tokio's tungstenite
                                .map(|msg| match msg {
                                    WebSocketMessage::Text(x) => TungsteniteMessage::Text(x),
                                    WebSocketMessage::Binary(x) => TungsteniteMessage::Binary(x),
                                    WebSocketMessage::Ping(x) => TungsteniteMessage::Ping(x),
                                    WebSocketMessage::Pong(x) => TungsteniteMessage::Pong(x),
                                    WebSocketMessage::Close(Some(close)) => {
                                        TungsteniteMessage::Close(Some(CloseFrame {
                                            code: CloseCode::from(close.code),
                                            reason: close.reason,
                                        }))
                                    }
                                    WebSocketMessage::Close(None) => {
                                        TungsteniteMessage::Close(None)
                                    }
                                })
                                .map(Ok)
                                .forward(tx.clone());
                            tokio::spawn(fut);
                            let user = Arc::new(User::new(token.clone(), user_send));
                            bridge_users.insert(token.clone(), user.clone());
                            user
                        }
                    };

                    let pkt: Result<RecvPacket, _> = serde_json::from_str(&payload_msg);
                    match pkt {
                        Ok(pkt) => match &pkt.content {
                            Request::JoinMap(join) => {
                                if join.name == cfg.map {
                                    server.handle_request(user, pkt);
                                } else {
                                    user.send(pkt.id, Message::Response(Err(Error::MapNotFound)));
                                }
                            }
                            Request::ListMaps => {
                                let mut maps = server.get_maps();
                                maps.retain(|m| m.name == cfg.map);
                                server.do_broadcast(&user, &pkt);
                            }
                            _ => server.handle_request(user, pkt),
                        },
                        Err(e) => {
                            log::error!("failed to parse message: {e} in {payload_msg}");
                            user.send(
                                None,
                                Message::Response(Err(Error::BadRequest(e.to_string()))),
                            )
                        }
                    };

                    Some(())
                }();

                futures::future::ready(res.ok_or(Error::BridgeFailure))
            });

        let url = cfg.url.clone();
        log::info!("bridge connected to {}", url);

        let handle = tokio::spawn(async move {
            match futures::future::select(fut_send, fut_recv).await {
                Either::Left((Ok(_), _)) => log::info!("bridge with {url} closed"),
                Either::Left((Err(e), _)) => log::error!("bridge with {url} closed: {e}"),
                Either::Right((_, _)) => log::error!("bridge with {url} closed"),
            }
        });

        // store the task, so it can be cancelled.
        *server_2.bridge.lock() = Some(handle);

        Ok(())
    }

    pub fn close_bridge(&self) {
        let mut bridge = self.bridge.lock();

        if let Some(handle) = bridge.as_ref() {
            handle.abort();
            log::info!("bridge aborted");
            *bridge = None;
        }
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
