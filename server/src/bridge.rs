use std::{collections::HashMap, net::SocketAddr, sync::Arc};

use axum::extract::ws::{Message as WebSocketMessage, WebSocket};
use futures::{
    channel::mpsc::{unbounded, UnboundedSender},
    SinkExt, StreamExt, TryStreamExt,
};
use itertools::Itertools;
use serde::{Deserialize, Serialize};
use tokio_tungstenite::tungstenite::protocol::{frame::coding::CloseCode, CloseFrame};
use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;

use crate::{error::Error, protocol::*, server::Server, server::User, util::*};

use futures_util::{future::Either, stream};
use tokio_tungstenite::connect_async;

type Tx = UnboundedSender<WebSocketMessage>;

pub struct Bridge {
    pub key: String,
    pub map: String,
    pub server_tx: Tx,
    pub users_tx: HashMap<SocketAddr, Tx>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BridgeConfig {
    pub map: String,
    pub key: String,
    pub url: String,
}

impl Server {
    /// A client is connecting to a remote server via the bridge.
    pub async fn handle_client_bridge(
        &self,
        socket: WebSocket,
        addr: SocketAddr,
        key: String,
    ) -> Result<(), Error> {
        let (tx, ws_recv) = socket.split();

        let (ws_send, rx) = unbounded();
        let fut_send = rx.map(Ok).forward(tx);

        let bridge_addr = {
            let mut bridges = self.remote_bridges.write().unwrap();
            let (bridge_addr, bridge) = bridges
                .iter_mut()
                .find(|(_, v)| v.key == key)
                .ok_or(Error::BridgeNotFound)?;

            bridge.users_tx.insert(addr, ws_send);
            bridge_addr.clone()
        };

        log::info!("client {addr} connected to remote server {bridge_addr}");

        let addr_msg = WebSocketMessage::Text(serde_json::to_string(&addr).unwrap());

        let fut_recv = ws_recv
            .map_err(|_| Error::BridgeClosed)
            .try_for_each(|msg| {
                match msg {
                    WebSocketMessage::Text(msg) => {
                        let res = || -> Option<()> {
                            let bridges = self.remote_bridges.read().unwrap();
                            let bridge = bridges.get(&bridge_addr)?;

                            // forward client requests to the remote with the client addr.
                            bridge.server_tx.unbounded_send(addr_msg.clone()).ok();
                            bridge
                                .server_tx
                                .unbounded_send(WebSocketMessage::Text(msg))
                                .ok();

                            Some(())
                        }();
                        futures::future::ready(res.ok_or(Error::BridgeFailure))
                    }
                    WebSocketMessage::Close(_) => futures::future::err(Error::BridgeClosed),
                    WebSocketMessage::Binary(_)
                    | WebSocketMessage::Ping(_)
                    | WebSocketMessage::Pong(_) => futures::future::ok(()),
                }
            });

        // wait for either sender or receiver to complete: this means the connection is closed.
        let res = match futures::future::select(fut_send, fut_recv).await {
            Either::Left((Ok(_), _)) => Ok(()),
            Either::Left((Err(_), _)) => Err(Error::BridgeClosed),
            Either::Right((res, _)) => res,
        };

        // remove the user, send logout
        || -> Option<()> {
            let mut bridges = self.remote_bridges.write().unwrap();
            let bridge = bridges.get_mut(&bridge_addr)?;

            let packet = SendPacket {
                timestamp: timestamp_now(),
                id: None,
                content: Message::Request(Request::LeaveMap(bridge.map.clone())),
            };
            let logout_msg = serde_json::to_string(&packet).unwrap();
            bridge.server_tx.unbounded_send(addr_msg.clone()).ok();
            bridge
                .server_tx
                .unbounded_send(WebSocketMessage::Text(logout_msg))
                .ok();

            bridge.users_tx.remove(&addr);
            Some(())
        }();

        res
    }

    /// a remote server is opening a bridge with this server
    pub async fn handle_server_bridge(
        &self,
        socket: WebSocket,
        addr: SocketAddr,
    ) -> Result<(), Error> {
        let (tx, mut ws_recv) = socket.split();

        let cfg = if let Some(Ok(WebSocketMessage::Text(txt))) = ws_recv.next().await {
            serde_json::from_str::<BridgeConfig>(&txt).map_err(|_| Error::BridgeFailure)
        } else {
            Err(Error::BridgeFailure)
        }?;

        let (ws_send, rx) = unbounded();
        let fut_send = rx.map(Ok).forward(tx);

        let bridge = Bridge {
            key: cfg.key,
            map: cfg.map,
            server_tx: ws_send,
            users_tx: Default::default(),
        };

        self.remote_bridges.write().unwrap().insert(addr, bridge);

        log::info!("remote server {addr} started bridging");

        // forward all messages to the right user
        let fut_recv = ws_recv
            .try_chunks(2)
            .map_err(|_| Error::BridgeClosed)
            .try_for_each(|v| {
                let (addr_msg, payload_msg) = match v.into_iter().collect_tuple() {
                    Some((WebSocketMessage::Text(m1), WebSocketMessage::Text(m2))) => (m1, m2),
                    _ => return futures::future::err(Error::BridgeClosed),
                };
                let res = move || -> Option<()> {
                    let user_addr: SocketAddr = serde_json::from_str(&addr_msg).ok()?;
                    self.remote_bridges
                        .read()
                        .unwrap()
                        .get(&addr)?
                        .users_tx
                        .get(&user_addr)
                        .map(|tx| {
                            tx.unbounded_send(WebSocketMessage::Text(payload_msg)).ok();
                        });
                    Some(())
                }();
                futures::future::ready(res.ok_or(Error::BridgeFailure))
            });

        // wait for either sender or receiver to complete: this means the connection is closed.
        let res = match futures::future::select(fut_send, fut_recv).await {
            Either::Left((Ok(_), _)) => Ok(()),
            Either::Left((Err(_), _)) => Err(Error::BridgeClosed),
            Either::Right((res, _)) => res,
        };

        self.remote_bridges.write().unwrap().remove(&addr);

        res
    }

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
                                    Server::send(
                                        &user,
                                        pkt.id,
                                        Message::Response(Err(Error::MapNotFound)),
                                    );
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
                            Server::send(
                                &user,
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
