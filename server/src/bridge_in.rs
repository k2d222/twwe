use std::{collections::HashMap, net::SocketAddr};

use axum::extract::ws::{Message as WebSocketMessage, WebSocket};
use futures::{
    channel::mpsc::{unbounded, UnboundedSender},
    StreamExt, TryStreamExt,
};
use futures_util::future::Either;
use itertools::Itertools;
use serde::{Deserialize, Serialize};

use crate::{error::Error, protocol::*, server::Server, util::*};

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
}
