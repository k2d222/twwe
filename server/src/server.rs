use std::{
    collections::HashMap,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard, RwLock},
};

use axum_tungstenite::Message as WebSocketMessage;
use axum_tungstenite::WebSocket;
use futures::{
    channel::mpsc::{unbounded, UnboundedSender},
    StreamExt, TryStreamExt,
};
use futures_util::{future::Either, stream, SinkExt};
use image::ImageFormat;
use itertools::Itertools;
use tokio::task::JoinHandle;
use tokio_tungstenite::connect_async;

use crate::{
    base64::Base64,
    checks::PartialCheck,
    cli::Cli,
    error::Error,
    map_cfg::MapAccess,
    protocol::*,
    room::{Peer, Room},
    twmap_map_checks::InternalMapChecking,
    util::{macros::apply_partial, *},
};

type Tx = UnboundedSender<WebSocketMessage>;

pub struct Bridge {
    pub key: String,
    pub map: String,
    pub server_tx: Tx,
    pub peers_tx: HashMap<SocketAddr, Tx>,
}

pub struct Server {
    pub rooms: Mutex<HashMap<String, Arc<Room>>>,
    pub rpp_path: Option<PathBuf>,
    pub maps_dir: Option<PathBuf>,
    pub data_dir: Option<PathBuf>,
    pub bridge: Mutex<Option<JoinHandle<()>>>,
    pub remote_bridges: RwLock<HashMap<SocketAddr, Bridge>>,
}

impl Server {
    pub fn new(cli: &Cli) -> Self {
        Server {
            rooms: Mutex::new(HashMap::new()),
            rpp_path: cli.rpp_path.clone(),
            maps_dir: cli.maps_dirs.get(0).cloned(),
            data_dir: cli.data_dirs.get(0).cloned(),
            bridge: Default::default(),
            remote_bridges: Default::default(),
        }
    }

    pub fn rooms(&self) -> MutexGuard<HashMap<String, Arc<Room>>> {
        self.rooms.lock().expect("failed to lock rooms")
    }

    fn room(&self, name: &str) -> Result<Arc<Room>, Error> {
        self.rooms()
            .get(name)
            .map(Arc::to_owned)
            .ok_or(Error::MapNotFound)
    }
}

impl Server {
    fn send(peer: &Peer, id: Option<u32>, msg: Message) {
        let packet = SendPacket {
            timestamp: timestamp_now(),
            id,
            content: msg,
        };
        let str = serde_json::to_string(&packet).unwrap(); // this must not fail
        peer.tx.unbounded_send(WebSocketMessage::Text(str)).ok(); // this is ok to fail (peer logout)
    }

    fn broadcast_to_lobby(&self, msg: Message) {
        let packet = SendPacket {
            timestamp: timestamp_now(),
            id: None,
            content: msg,
        };

        let str = serde_json::to_string(&packet).unwrap(); // this must not fail
        let _msg = WebSocketMessage::Text(str);

        log::warn!("TODO: broadcast_to_lobby");
    }

    fn broadcast_to_room(&self, room: &Room, content: Message) {
        let packet = SendPacket {
            timestamp: timestamp_now(),
            id: None,
            content,
        };

        let str = serde_json::to_string(&packet).unwrap(); // this must not fail
        let msg = WebSocketMessage::Text(str);

        for p in room.peers().values() {
            p.tx.unbounded_send(msg.to_owned()).ok();
        }
    }

    fn broadcast_to_others(&self, peer: &Peer, content: Message) {
        let packet = SendPacket {
            timestamp: timestamp_now(),
            id: None,
            content,
        };

        let str = serde_json::to_string(&packet).unwrap(); // this must not fail
        let msg = WebSocketMessage::Text(str);

        if let Some(room) = peer.room.clone() {
            for (addr, p) in room.peers().iter() {
                if !addr.eq(&peer.addr) {
                    p.tx.unbounded_send(msg.to_owned()).ok();
                }
            }
        }
    }

    fn broadcast_users(&self, peer: &Peer) {
        if let Some(room) = peer.room.clone() {
            let users = room.peer_count();
            self.broadcast_to_room(&room, Message::Broadcast(Broadcast::Users(users)));
        }
    }

    fn do_request(&self, peer: &mut Peer, req: Request) -> Result<Response, Error> {
        let map_name = peer
            .room
            .as_deref()
            .map(Room::name)
            .ok_or(Error::MapNotFound);

        match req {
            Request::ListMaps => Ok(Response::Maps(self.get_maps())),
            Request::JoinMap(map_name) => self.peer_join(peer, &map_name).map(|()| Response::Ok),
            Request::LeaveMap(map_name) => self.peer_leave(peer, &map_name).map(|()| Response::Ok),
            Request::GetMap(map_name) => self.get_map(&map_name).map(|r| Response::Map(Base64(r))),
            Request::CreateMap(map_name, content) => {
                self.create_map(&map_name, *content).map(|()| Response::Ok)
            }
            Request::DeleteMap(map_name) => self.delete_map(&map_name).map(|()| Response::Ok),
            Request::Save => self.save_map(map_name?).map(|()| Response::Ok),
            Request::Cursor(req) => self.set_cursor(peer, *req).map(|()| Response::Ok),
            Request::Get(req) => match req {
                GetReq::Users => self.get_users(map_name?).map(Response::Users),
                GetReq::Cursors => self.get_cursors(map_name?, peer).map(Response::Cursors),
                GetReq::Map => self.get_map(map_name?).map(|r| Response::Map(Base64(r))),
                GetReq::Images => self.get_images(map_name?).map(Response::Images),
                GetReq::Image(i) => self
                    .get_image(map_name?, i)
                    .map(|r| Response::Image(Base64(r))),
                GetReq::Envelopes => self.get_envelopes(map_name?).map(Response::Envelopes),
                GetReq::Envelope(e) => self
                    .get_envelope(map_name?, e)
                    .map(|r| Response::Envelope(Box::new(r))),
                GetReq::Groups => self.get_groups(map_name?).map(Response::Groups),
                GetReq::Group(g) => self
                    .get_group(map_name?, g)
                    .map(|r| Response::Group(Box::new(r))),
                GetReq::Layers(g) => self.get_layers(map_name?, g).map(Response::Layers),
                GetReq::Layer(g, l) => self
                    .get_layer(map_name?, g, l)
                    .map(|r| Response::Layer(Box::new(r))),
                GetReq::Tiles(g, l) => self
                    .get_tiles(map_name?, g, l)
                    .map(|r| Response::Tiles(Base64(r.into()))),
                GetReq::Quad(g, l, q) => self
                    .get_quad(map_name?, g, l, q)
                    .map(|r| Response::Quad(Box::new(r))),
                GetReq::Automappers => self.get_automappers(map_name?).map(Response::Automappers),
                GetReq::Automapper(am) => self
                    .get_automapper(map_name?, &am)
                    .map(Response::Automapper),
            },
            Request::Create(req) => match req {
                CreateReq::Image(image_name, create) => {
                    self.put_image(map_name?, &image_name, create)
                }
                CreateReq::Envelope(req) => self.put_envelope(map_name?, *req),
                CreateReq::Group(req) => self.put_group(map_name?, *req),
                CreateReq::Layer(g, req) => self.put_layer(map_name?, g, *req),
                CreateReq::Quad(g, l, req) => self.put_quad(map_name?, g, l, *req),
                CreateReq::Automapper(am, file) => self.put_automapper(peer, map_name?, &am, &file),
            }
            .map(|()| Response::Ok),
            Request::Edit(req) => match req {
                EditReq::Config(req) => self.edit_config(map_name?, *req),
                EditReq::Info(req) => self.edit_info(map_name?, *req),
                EditReq::Envelope(e, req) => self.edit_envelope(map_name?, e, *req),
                EditReq::Group(g, req) => self.edit_group(map_name?, g, *req),
                EditReq::Layer(g, l, req) => self.edit_layer(map_name?, g, l, *req),
                EditReq::Tiles(g, l, req) => self.edit_tiles(map_name?, g, l, *req),
                EditReq::Quad(g, l, q, req) => self.edit_quad(map_name?, g, l, q, *req),
                EditReq::Automap(g, l) => self.apply_automapper(map_name?, g, l),
            }
            .map(|()| Response::Ok),
            Request::Delete(req) => match req {
                DeleteReq::Image(i) => self.delete_image(map_name?, i),
                DeleteReq::Envelope(e) => self.delete_envelope(map_name?, e),
                DeleteReq::Group(g) => self.delete_group(map_name?, g),
                DeleteReq::Layer(g, l) => self.delete_layer(map_name?, g, l),
                DeleteReq::Quad(g, l, q) => self.delete_quad(map_name?, g, l, q),
                DeleteReq::Automapper(am) => self.delete_automapper(map_name?, &am),
            }
            .map(|()| Response::Ok),
            Request::Move(req) => match req {
                MoveReq::Image(src, tgt) => self.move_image(map_name?, src, tgt),
                MoveReq::Envelope(src, tgt) => self.move_envelope(map_name?, src, tgt),
                MoveReq::Group(src, tgt) => self.move_group(map_name?, src, tgt),
                MoveReq::Layer(src, tgt) => self.move_layer(map_name?, src, tgt),
                MoveReq::Quad(src, tgt) => self.move_quad(map_name?, src, tgt),
            }
            .map(|()| Response::Ok),
        }
    }

    fn do_respond(&self, peer: &Peer, packet: &RecvPacket, resp: Result<Response, Error>) {
        Server::send(peer, packet.id, Message::Response(resp.clone()));
        if resp.is_ok() {
            match &packet.content {
                Request::LeaveMap(map_name) | Request::JoinMap(map_name) => self
                    .broadcast_to_others(
                        peer,
                        Message::Broadcast(Broadcast::Users(self.get_users(map_name).unwrap_or(0))),
                    ),
                Request::CreateMap(map_name, _) => {
                    self.broadcast_to_lobby(Message::Broadcast(Broadcast::MapCreated(
                        map_name.clone(),
                    )));
                }
                Request::DeleteMap(map_name) => {
                    self.broadcast_to_lobby(Message::Broadcast(Broadcast::MapDeleted(
                        map_name.clone(),
                    )));
                }
                Request::Save => {
                    self.broadcast_to_others(peer, Message::Broadcast(Broadcast::Saved))
                }
                Request::Create(_) | Request::Edit(_) | Request::Delete(_) | Request::Move(_) => {
                    self.broadcast_to_others(peer, Message::Request(packet.content.clone()))
                }
                Request::ListMaps | Request::GetMap(_) | Request::Cursor(_) | Request::Get(_) => (),
            }
        }
    }

    pub fn handle_request(&self, peer: &mut Peer, packet: RecvPacket) {
        let resp = self.do_request(peer, packet.content.clone());
        self.do_respond(peer, &packet, resp);
    }

    pub async fn handle_websocket(&self, socket: WebSocket, addr: SocketAddr) {
        let (tx, ws_recv) = socket.split();
        let (ws_send, rx) = unbounded();
        let fut_send = rx.map(Ok).forward(tx);

        let mut peer = Peer::new(addr, ws_send);

        let fut_recv = ws_recv.try_for_each(|msg| {
            if let WebSocketMessage::Text(msg) = msg {
                // log::debug!("text message received from {}: {}", addr, text);
                match serde_json::from_str(&msg) {
                    Ok(req) => {
                        self.handle_request(&mut peer, req);
                    }
                    Err(e) => {
                        log::error!("failed to parse message: {e} in {msg}");
                        Server::send(
                            &peer,
                            None,
                            Message::Response(Err(Error::BadRequest(e.to_string()))),
                        )
                    }
                };
            }

            futures::future::ok(())
        });

        // wait for either sender or receiver to complete: this means the connection is closed.
        futures::future::select(fut_send, fut_recv).await;

        if let Some(room) = &peer.room {
            room.remove_peer(&peer);
        }

        self.broadcast_users(&peer);

        log::info!("client disconnected {}", &addr);
    }

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

            bridge.peers_tx.insert(addr, ws_send);
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
                    | WebSocketMessage::Pong(_)
                    | WebSocketMessage::Frame(_) => futures::future::ok(()),
                }
            });

        // wait for either sender or receiver to complete: this means the connection is closed.
        let res = match futures::future::select(fut_send, fut_recv).await {
            Either::Left((Ok(_), _)) => Ok(()),
            Either::Left((Err(_), _)) => Err(Error::BridgeClosed),
            Either::Right((res, _)) => res,
        };

        // remove the peer, send logout
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

            bridge.peers_tx.remove(&addr);
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
            peers_tx: Default::default(),
        };

        self.remote_bridges.write().unwrap().insert(addr, bridge);

        log::info!("remote server {addr} started bridging");

        // forward all messages to the right peer
        let fut_recv = ws_recv
            .try_chunks(2)
            .map_err(|_| Error::BridgeClosed)
            .try_for_each(|v| {
                let (addr_msg, payload_msg) = match v.into_iter().collect_tuple() {
                    Some((WebSocketMessage::Text(m1), WebSocketMessage::Text(m2))) => (m1, m2),
                    _ => return futures::future::err(Error::BridgeClosed),
                };
                let res = move || -> Option<()> {
                    let peer_addr: SocketAddr = serde_json::from_str(&addr_msg).ok()?;
                    self.remote_bridges
                        .read()
                        .unwrap()
                        .get(&addr)?
                        .peers_tx
                        .get(&peer_addr)
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
        let url = url::Url::parse(&cfg.url).map_err(|_| Error::BridgeNotFound)?;

        let (socket, _resp) = connect_async(&url)
            .await
            .map_err(|_| Error::BridgeNotFound)?;
        let (mut ws_send, ws_recv) = socket.split();

        ws_send
            .send(WebSocketMessage::Text(serde_json::to_string(&cfg).unwrap()))
            .await
            .map_err(|_| Error::BridgeClosed)?;

        let (tx, rx) = unbounded();
        let fut_send = rx.map(Ok).forward(ws_send);

        let mut bridge_peers: HashMap<SocketAddr, Peer> = Default::default();

        let server_2 = server.clone();

        let fut_recv = ws_recv
            .try_chunks(2)
            .map_err(|_| Error::BridgeClosed)
            .try_for_each(move |v| {
                let (addr_msg, payload_msg) = match v.into_iter().collect_tuple() {
                    Some((WebSocketMessage::Text(m1), WebSocketMessage::Text(m2))) => (m1, m2),
                    _ => return futures::future::err(Error::BridgeClosed),
                };

                let res = || -> Option<()> {
                    let addr: SocketAddr = serde_json::from_str(&addr_msg).ok()?;
                    let peer = match bridge_peers.get_mut(&addr) {
                        Some(peer) => peer,
                        None => {
                            let (peer_send, peer_recv) = unbounded();
                            let addr_msg = addr_msg.clone();
                            let fut = peer_recv
                                .flat_map(move |payload| {
                                    stream::iter(vec![
                                        WebSocketMessage::Text(addr_msg.clone()),
                                        payload,
                                    ])
                                })
                                .map(Ok)
                                .forward(tx.clone());
                            tokio::spawn(fut);
                            let peer = Peer::new(addr, peer_send);
                            bridge_peers.insert(addr, peer);
                            bridge_peers.get_mut(&addr).unwrap()
                        }
                    };

                    let pkt: Result<RecvPacket, _> = serde_json::from_str(&payload_msg);
                    match pkt {
                        Ok(pkt) => match &pkt.content {
                            Request::JoinMap(map) => {
                                if map == &cfg.map {
                                    server.handle_request(peer, pkt);
                                } else {
                                    Server::send(
                                        &peer,
                                        pkt.id,
                                        Message::Response(Err(Error::MapNotFound)),
                                    );
                                }
                            }
                            Request::ListMaps => {
                                let mut maps = server.get_maps();
                                maps.retain(|m| m.name == cfg.map);
                                server.do_respond(peer, &pkt, Ok(Response::Maps(maps)));
                            }
                            _ => server.handle_request(peer, pkt),
                        },
                        Err(e) => {
                            log::error!("failed to parse message: {e} in {payload_msg}");
                            Server::send(
                                &peer,
                                None,
                                Message::Response(Err(Error::BadRequest(e.to_string()))),
                            )
                        }
                    };

                    Some(())
                }();

                futures::future::ready(res.ok_or(Error::BridgeFailure))
            });

        log::info!("bridge connected to {}", &url);
        let url = url.clone();

        let handle = tokio::spawn(async move {
            match futures::future::select(fut_send, fut_recv).await {
                Either::Left((Ok(_), _)) => log::info!("bridge with {url} closed"),
                Either::Left((Err(e), _)) => log::error!("bridge with {url} closed: {e}"),
                Either::Right((_, _)) => log::error!("bridge with {url} closed"),
            }
        });

        // store the task, so it can be cancelled.
        *server_2.bridge.lock().unwrap() = Some(handle);

        Ok(())
    }

    pub fn close_bridge(&self) {
        let mut val = self.bridge.lock().unwrap();

        if let Some(handle) = val.as_ref() {
            handle.abort();
            log::info!("bridge aborted");
            *val = None;
        }
    }
}

impl Server {
    pub fn get_maps(&self) -> Vec<MapDetail> {
        self.rooms()
            .iter()
            .filter(|(_, v)| v.config.access == MapAccess::Public)
            .map(|(k, v)| MapDetail {
                name: k.to_owned(),
                users: v.peer_count(),
            })
            .collect()
    }

    pub fn get_map(&self, map_name: &str) -> Result<Vec<u8>, Error> {
        let room = self.room(map_name)?;

        let mut buf = Vec::new();
        let mut map = room.map().clone(); // cloned to avoid blocking
        map.save(&mut buf)
            .map_err(|e| Error::ServerError(e.to_string().into()))?;

        Ok(buf)
    }

    pub fn create_map(&self, map_name: &str, creation: MapCreation) -> Result<(), Error> {
        if !check_file_name(map_name) {
            return Err(Error::InvalidMapName);
        }

        if self.room(map_name).is_ok() {
            return Err(Error::MapNameTaken);
        }

        let mut map = match creation.method {
            CreationMethod::Upload(file) => {
                let map =
                    twmap::TwMap::parse(&file.0).map_err(|e| Error::MapError(e.to_string()))?;
                // self.put_map(map_name, &file.0)?;
                map
            }
            CreationMethod::Clone(clone_name) => {
                let room = self.room(&clone_name)?;
                let map = room.map().clone();
                map
            }
            CreationMethod::Blank { w, h } => {
                if let Some(version) = creation.version {
                    if version != Version::DDNet06 {
                        return Err(Error::UnsupportedMapType);
                    }
                }
                let mut map = twmap::TwMap::empty(twmap::Version::DDNet06);
                let mut group = twmap::Group::physics();
                let layer = twmap::GameLayer {
                    tiles: twmap::CompressedData::Loaded(ndarray::Array2::default((
                        h as usize, w as usize,
                    ))),
                };
                group.layers.push(twmap::Layer::Game(layer));
                map.groups.push(group);
                map.check().map_err(|e| Error::MapError(e.to_string()))?;
                map
            }
        };

        let room = if let Some(maps_dir) = self.maps_dir.as_ref() {
            let path = maps_dir.join(map_name);
            let map_path = path.join("map.map");

            std::fs::create_dir(&path).map_err(|e| Error::ServerError(e.to_string().into()))?;
            map.save_file(&map_path)
                .map_err(|e| Error::MapError(e.to_string()))?;

            let mut room =
                Room::new_from_dir(path).ok_or(Error::ServerError("map creation failed".into()))?;

            room.config.access = creation.access.unwrap_or(MapAccess::Public);
            room.save_config()
                .map_err(|e| Error::ServerError(e.into()))?;
            room
        } else if let Some(data_dir) = self.data_dir.as_ref() {
            let mut map_path = data_dir.join("maps").join(map_name);
            map_path.set_extension("map");
            let am_path = data_dir.join("editor/automap");

            if map_path.exists() {
                return Err(Error::MapNameTaken);
            }

            map.save_file(&map_path)
                .map_err(|e| Error::MapError(e.to_string()))?;

            let mut room = Room::new_from_files(map_path, None, Some(am_path))
                .ok_or(Error::ServerError("map creation failed".into()))?;

            room.config.access = creation.access.unwrap_or(MapAccess::Public);
            room
        } else {
            return Err(Error::BadRequest("missing map path".into()));
        };

        // lock the rooms: this is blocking the whole server but prevents TOCTOU bugs.
        {
            let mut rooms = self.rooms();

            if rooms.contains_key(map_name) {
                return Err(Error::MapNameTaken);
            } else {
                rooms.insert(map_name.to_owned(), Arc::new(room));
            }
        }

        log::info!("map created `{}`", map_name);
        Ok(())
    }

    pub fn delete_map(&self, map_name: &str) -> Result<(), Error> {
        let room = self.room(map_name)?;

        if room.peers().len() != 0 {
            return Err(Error::RoomNotEmpty);
        }

        self.rooms().remove(map_name);

        room.delete();

        log::info!("map deleted `{}`", room.name());

        Ok(())
    }

    pub fn get_info(&self, map_name: &str) -> Result<twmap::Info, Error> {
        Ok(self.room(map_name)?.map().info.clone())
    }

    pub fn edit_info(&self, map_name: &str, part_info: PartialInfo) -> Result<(), Error> {
        let room = self.room(map_name)?;

        part_info.check_self()?;

        let mut map = room.map();
        apply_partial!(part_info => map.info, author, version, credits, license, settings);

        Ok(())
    }

    pub fn edit_config(&self, _map_name: &str, _part_conf: PartialConfig) -> Result<(), Error> {
        // let room = self.room(map_name)?.clone();
        // apply_partial!(part_conf => room.config, name, access);
        // Ok(())
        Err(Error::ToDo)
    }

    pub fn get_images(&self, map_name: &str) -> Result<Vec<String>, Error> {
        Ok(self
            .room(map_name)?
            .map()
            .images
            .iter()
            .map(|img| img.name().to_owned())
            .collect())
    }

    pub fn get_image(&self, map_name: &str, image_index: u16) -> Result<Vec<u8>, Error> {
        let room = self.room(map_name)?;

        let mut buf = Vec::new();

        let image = room
            .map()
            .images
            .get(image_index as usize)
            .ok_or(Error::ImageNotFound)?
            .clone(); // cloned to avoid blocking

        match image {
            twmap::Image::External(_) => {
                Err(Error::ServerError("cannot send external images".into()))?
            }
            twmap::Image::Embedded(image) => image
                .image
                .unwrap_ref()
                .write_to(&mut std::io::Cursor::new(&mut buf), ImageFormat::Png)
                .map_err(|e| Error::ServerError(e.to_string().into()))?,
        };

        Ok(buf)
    }

    pub fn put_image(&self, map_name: &str, image_name: &str, create: Image) -> Result<(), Error> {
        let room = self.room(map_name)?;

        if image_name.len() > twmap::Image::MAX_NAME_LENGTH {
            return Err(Error::InvalidFileName);
        }

        if !check_file_name(image_name) {
            return Err(Error::InvalidFileName);
        }

        if room.map().images.len() == 64usize {
            return Err(Error::MaxImages);
        }

        let image = match create {
            Image::External { size: _ } => {
                // this also checks is_external_name
                let size = twmap::constants::external_dimensions(image_name, room.map().version)
                    .ok_or(Error::InvalidImage)?;

                twmap::Image::External(twmap::ExternalImage {
                    name: image_name.to_owned(),
                    size,
                })
            }
            Image::Embedded(file) => twmap::Image::Embedded(
                twmap::EmbeddedImage::from_reader(image_name, std::io::Cursor::new(file.0))
                    .map_err(|_| Error::InvalidImage)?,
            ),
        };

        image
            .check(&room.map(), &mut ())
            .map_err(|e| Error::MapError(e.to_string()))?;

        room.map().images.push(image);
        Ok(())
    }

    pub fn delete_image(&self, map_name: &str, image_index: u16) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();

        if image_index as usize >= map.images.len() {
            return Err(Error::ImageNotFound);
        }

        if map.is_image_in_use(image_index) {
            return Err(Error::ImageInUse);
        }

        map.images.remove(image_index as usize);
        map.edit_image_indices(|i| i.map(|i| if i > image_index { i - 1 } else { i }));

        Ok(())
    }

    pub fn get_envelopes(&self, map_name: &str) -> Result<Vec<String>, Error> {
        Ok(self
            .room(map_name)?
            .map()
            .envelopes
            .iter()
            .map(|env| env.name().to_owned())
            .collect())
    }

    pub fn get_envelope(&self, map_name: &str, env_index: u16) -> Result<twmap::Envelope, Error> {
        Ok(self
            .room(map_name)?
            .map()
            .envelopes
            .get(env_index as usize)
            .ok_or(Error::EnvelopeNotFound)?
            .to_owned())
    }

    pub fn put_envelope(&self, map_name: &str, part_env: PartialEnvelope) -> Result<(), Error> {
        let room = self.room(map_name)?;

        if room.map().envelopes.len() == u16::MAX as usize {
            return Err(Error::MaxEnvelopes);
        }

        // create
        let env = match part_env {
            PartialEnvelope::Position(part_env) => twmap::Envelope::Position({
                let mut env = twmap::Env::default();
                apply_partial!(part_env => env, name, synchronized, points);
                env
            }),
            PartialEnvelope::Color(part_env) => twmap::Envelope::Color({
                let mut env = twmap::Env::default();
                apply_partial!(part_env => env, name, synchronized, points);
                env
            }),
            PartialEnvelope::Sound(part_env) => twmap::Envelope::Sound({
                let mut env = twmap::Env::default();
                apply_partial!(part_env => env, name, synchronized, points);
                env
            }),
        };

        // check
        env.check(&room.map(), &mut ())
            .map_err(|e| Error::MapError(e.to_string()))?;

        room.map().envelopes.push(env);
        Ok(())
    }

    pub fn edit_envelope(
        &self,
        map_name: &str,
        env_index: u16,
        part_env: PartialEnvelope,
    ) -> Result<(), Error> {
        part_env.check_self()?;
        let room = self.room(map_name)?;
        part_env.check_map(&room.map())?;

        // edit
        {
            let mut map = room.map();
            let env = map
                .envelopes
                .get_mut(env_index as usize)
                .ok_or(Error::EnvelopeNotFound)?;

            match (env, part_env) {
                (twmap::Envelope::Position(env), PartialEnvelope::Position(part_env)) => {
                    apply_partial!(part_env => env, name, synchronized, points)
                }
                (twmap::Envelope::Color(env), PartialEnvelope::Color(part_env)) => {
                    apply_partial!(part_env => env, name, synchronized, points)
                }
                (twmap::Envelope::Sound(env), PartialEnvelope::Sound(part_env)) => {
                    apply_partial!(part_env => env, name, synchronized, points)
                }
                _ => return Err(Error::WrongEnvelopeType),
            }
        }

        Ok(())
    }

    pub fn delete_envelope(&self, map_name: &str, env_index: u16) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();

        if env_index as usize >= map.envelopes.len() {
            return Err(Error::EnvelopeNotFound);
        }

        if map.is_env_in_use(env_index) {
            return Err(Error::EnvelopeInUse);
        }

        map.envelopes.remove(env_index as usize);
        map.edit_env_indices(|i| i.map(|i| if i > env_index { i - 1 } else { i }));

        Ok(())
    }

    pub fn get_groups(&self, map_name: &str) -> Result<Vec<String>, Error> {
        Ok(self
            .room(map_name)?
            .map()
            .groups
            .iter()
            .map(|g| g.name.to_owned())
            .collect())
    }

    pub fn get_group(&self, map_name: &str, group_index: u16) -> Result<twmap::Group, Error> {
        let room = self.room(map_name)?;
        let map = room.map();
        let group = map
            .groups
            .get(group_index as usize)
            .ok_or(Error::GroupNotFound)?;

        // we don't want to just group.clone() because of the layers
        Ok(twmap::Group {
            name: group.name.clone(),
            offset: group.offset,
            parallax: group.parallax,
            layers: Vec::new(),
            clipping: group.clipping,
            clip: group.clip,
        })
    }

    pub fn put_group(&self, map_name: &str, part_group: PartialGroup) -> Result<(), Error> {
        part_group.check_self()?;
        let room = self.room(map_name)?;
        let mut map = room.map();

        if map.groups.len() == u16::MAX as usize {
            return Err(Error::MaxGroups);
        }

        let mut group = twmap::Group::default();
        apply_partial!(part_group => group, name, offset, parallax, clipping, clip);

        map.groups.push(group);
        Ok(())
    }

    pub fn edit_group(
        &self,
        map_name: &str,
        group_index: u16,
        part_group: PartialGroup,
    ) -> Result<(), Error> {
        part_group.check_self()?;
        let room = self.room(map_name)?;
        let mut map = room.map();
        let group = map
            .groups
            .get_mut(group_index as usize)
            .ok_or(Error::GroupNotFound)?;

        if group.is_physics_group() {
            Err(Error::EditPhysicsGroup)
        } else {
            apply_partial!(part_group => group, name, offset, parallax, clipping, clip);
            Ok(())
        }
    }

    pub fn delete_group(&self, map_name: &str, group_index: u16) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();
        let group = map
            .groups
            .get_mut(group_index as usize)
            .ok_or(Error::GroupNotFound)?;

        if group.is_physics_group() {
            return Err(Error::DeletePhysicsGroup);
        }

        map.groups.remove(group_index as usize);

        Ok(())
    }

    pub fn get_layers(&self, map_name: &str, group_index: u16) -> Result<Vec<String>, Error> {
        Ok(self
            .room(map_name)?
            .map()
            .groups
            .get(group_index as usize)
            .ok_or(Error::GroupNotFound)?
            .layers
            .iter()
            .map(|l| l.name().to_owned())
            .collect())
    }

    pub fn get_layer(
        &self,
        map_name: &str,
        group_index: u16,
        layer_index: u16,
    ) -> Result<twmap::Layer, Error> {
        let room = self.room(map_name)?;
        let map = room.map();
        let layer = map
            .groups
            .get(group_index as usize)
            .ok_or(Error::GroupNotFound)?
            .layers
            .get(layer_index as usize)
            .ok_or(Error::LayerNotFound)?;

        macro_rules! default_physics_layer {
            ($kind:ident, $struct:ident) => {
                twmap::Layer::$kind(twmap::$struct {
                    tiles: twmap::CompressedData::Loaded(Default::default()),
                })
            };
        }

        // we don't want to just layer.clone() because of the tiles
        Ok(match layer {
            twmap::Layer::Game(_) => default_physics_layer!(Game, GameLayer),
            twmap::Layer::Front(_) => default_physics_layer!(Front, FrontLayer),
            twmap::Layer::Tele(_) => default_physics_layer!(Tele, TeleLayer),
            twmap::Layer::Speedup(_) => default_physics_layer!(Speedup, SpeedupLayer),
            twmap::Layer::Switch(_) => default_physics_layer!(Switch, SwitchLayer),
            twmap::Layer::Tune(_) => default_physics_layer!(Tune, TuneLayer),
            twmap::Layer::Tiles(layer) => twmap::Layer::Tiles(twmap::TilesLayer {
                name: layer.name.clone(),
                detail: layer.detail,
                color: layer.color,
                color_env: layer.color_env,
                color_env_offset: layer.color_env_offset,
                image: layer.image,
                tiles: twmap::CompressedData::Loaded(Default::default()),
                automapper_config: layer.automapper_config.clone(),
            }),
            twmap::Layer::Quads(_) | twmap::Layer::Sounds(_) | twmap::Layer::Invalid(_) => {
                layer.clone()
            }
        })
    }

    pub fn put_layer(
        &self,
        map_name: &str,
        group_index: u16,
        part_layer: PartialLayer,
    ) -> Result<(), Error> {
        part_layer.check_self()?;
        let room = self.room(map_name)?;
        part_layer.check_map(&room.map())?;

        let mut map = room.map();

        let layers_count = map.groups.iter().flat_map(|g| g.layers.iter()).count();

        if layers_count == u16::MAX as usize {
            return Err(Error::MaxLayers);
        }

        let game_layer_shape = map
            .find_physics_layer::<twmap::GameLayer>()
            .unwrap()
            .tiles
            .shape();
        let game_layer_shape = (game_layer_shape.h, game_layer_shape.w);

        let group = map
            .groups
            .get_mut(group_index as usize)
            .ok_or(Error::GroupNotFound)?;

        macro_rules! create_physics_layer {
            ($kind:ident, $struct:ident) => {{
                if !group.is_physics_group() {
                    return Err(Error::CreatePhysicsLayerOutOfPhysicsGroup);
                }

                if group
                    .layers
                    .iter()
                    .find(|l| l.kind() == twmap::LayerKind::$kind)
                    .is_some()
                {
                    return Err(Error::CreateDuplicatePhysicsLayer);
                }

                let tiles =
                    twmap::CompressedData::Loaded(ndarray::Array2::default(game_layer_shape));
                twmap::Layer::$kind(twmap::$struct { tiles })
            }};
        }

        let layer = match part_layer {
            PartialLayer::Game(_) => return Err(Error::CreateGameLayer),
            PartialLayer::Tiles(part_layer) => {
                let mut layer = twmap::TilesLayer::new(game_layer_shape);
                apply_partial!(part_layer => layer, name, detail, color, color_env, color_env_offset, image, automapper_config);
                twmap::Layer::Tiles(layer)
            }
            PartialLayer::Quads(part_layer) => {
                let mut layer = twmap::QuadsLayer::default();
                apply_partial!(part_layer => layer, name, detail, image);
                twmap::Layer::Quads(layer)
            }
            PartialLayer::Front(_) => create_physics_layer!(Front, FrontLayer),
            PartialLayer::Tele(_) => create_physics_layer!(Tele, TeleLayer),
            PartialLayer::Speedup(_) => create_physics_layer!(Speedup, SpeedupLayer),
            PartialLayer::Switch(_) => create_physics_layer!(Switch, SwitchLayer),
            PartialLayer::Tune(_) => create_physics_layer!(Tune, TuneLayer),
        };

        group.layers.push(layer);
        Ok(())
    }

    pub fn edit_layer(
        &self,
        map_name: &str,
        group_index: u16,
        layer_index: u16,
        part_layer: PartialLayer,
    ) -> Result<(), Error> {
        part_layer.check_self()?;
        let room = self.room(map_name)?;
        part_layer.check_map(&room.map())?;

        // edit
        {
            let mut map = room.map();
            let group = map
                .groups
                .get_mut(group_index as usize)
                .ok_or(Error::GroupNotFound)?;
            let layer = group
                .layers
                .get_mut(layer_index as usize)
                .ok_or(Error::LayerNotFound)?;

            macro_rules! apply_dimensions {
                ($src:expr => $tgt:expr) => {{
                    if let Some(width) = $src.width {
                        set_layer_width($tgt, width).map_err(|_| Error::InvalidLayerDimensions)?;
                    }
                    if let Some(height) = $src.height {
                        set_layer_height($tgt, height)
                            .map_err(|_| Error::InvalidLayerDimensions)?;
                    }
                }};
            }

            macro_rules! apply_physics_dimensions {
                ($src:expr) => {{
                    for layer in group.layers.iter_mut() {
                        match layer {
                            twmap::Layer::Game(layer) => apply_dimensions!($src => layer),
                            twmap::Layer::Front(layer) => apply_dimensions!($src => layer),
                            twmap::Layer::Tele(layer) => apply_dimensions!($src => layer),
                            twmap::Layer::Speedup(layer) => apply_dimensions!($src => layer),
                            twmap::Layer::Switch(layer) => apply_dimensions!($src => layer),
                            twmap::Layer::Tune(layer) => apply_dimensions!($src => layer),
                            _ => (),
                        }
                    }
                }};
            }

            match (layer, part_layer) {
                (twmap::Layer::Game(_), PartialLayer::Game(part_layer)) => {
                    apply_physics_dimensions!(part_layer);
                }
                (twmap::Layer::Tiles(layer), PartialLayer::Tiles(part_layer)) => {
                    apply_dimensions!(part_layer => layer);
                    apply_partial!(part_layer => layer, name, detail, color, color_env, color_env_offset, image, automapper_config);
                }
                (twmap::Layer::Quads(layer), PartialLayer::Quads(part_layer)) => {
                    apply_partial!(part_layer => layer, name, detail, image);
                }
                (twmap::Layer::Front(_), PartialLayer::Front(part_layer)) => {
                    apply_physics_dimensions!(part_layer);
                }
                (twmap::Layer::Tele(_), PartialLayer::Tele(part_layer)) => {
                    apply_physics_dimensions!(part_layer);
                }
                (twmap::Layer::Speedup(_), PartialLayer::Speedup(part_layer)) => {
                    apply_physics_dimensions!(part_layer);
                }
                (twmap::Layer::Switch(_), PartialLayer::Switch(part_layer)) => {
                    apply_physics_dimensions!(part_layer);
                }
                (twmap::Layer::Tune(_), PartialLayer::Tune(part_layer)) => {
                    apply_physics_dimensions!(part_layer);
                }
                _ => return Err(Error::WrongLayerType),
            }
        }

        Ok(())
    }

    pub fn delete_layer(
        &self,
        map_name: &str,
        group_index: u16,
        layer_index: u16,
    ) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();

        let group = map
            .groups
            .get_mut(group_index as usize)
            .ok_or(Error::GroupNotFound)?;
        let layer = group
            .layers
            .get(layer_index as usize)
            .ok_or(Error::LayerNotFound)?;

        if layer.kind() == twmap::LayerKind::Game {
            return Err(Error::DeleteGameLayer);
        }

        group.layers.remove(layer_index as usize);

        Ok(())
    }

    pub fn get_tiles(
        &self,
        map_name: &str,
        group_index: u16,
        layer_index: u16,
    ) -> Result<Box<[u8]>, Error> {
        let room = self.room(map_name)?;
        let map = room.map();

        let layer = map
            .groups
            .get(group_index as usize)
            .ok_or(Error::GroupNotFound)?
            .layers
            .get(layer_index as usize)
            .ok_or(Error::LayerNotFound)?;

        macro_rules! layer_data {
            ($layer: ident) => {{
                let data = $layer
                    .tiles
                    .unwrap_ref()
                    .to_owned()
                    .into_raw_vec()
                    .into_boxed_slice();
                let buf = ViewAsBytes::into_boxed_bytes(data);
                Ok(buf)
            }};
        }

        match layer {
            twmap::Layer::Game(layer) => layer_data!(layer),
            twmap::Layer::Tiles(layer) => layer_data!(layer),
            twmap::Layer::Front(layer) => layer_data!(layer),
            twmap::Layer::Tele(layer) => layer_data!(layer),
            twmap::Layer::Speedup(layer) => layer_data!(layer),
            twmap::Layer::Switch(layer) => layer_data!(layer),
            twmap::Layer::Tune(layer) => layer_data!(layer),
            twmap::Layer::Invalid(_) | twmap::Layer::Sounds(_) | twmap::Layer::Quads(_) => {
                Err(Error::WrongLayerType)
            }
        }
    }

    pub fn edit_tiles(
        &self,
        map_name: &str,
        group_index: u16,
        layer_index: u16,
        part_tiles: Tiles,
    ) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();
        let layer = map
            .groups
            .get_mut(group_index as usize)
            .ok_or(Error::GroupNotFound)?
            .layers
            .get_mut(layer_index as usize)
            .ok_or(Error::LayerNotFound)?;

        macro_rules! apply_tiles {
            ($layer:ident) => {{
                let shape = twmap::TilemapLayer::tiles($layer).shape();
                let x = part_tiles.rect.x as usize;
                let y = part_tiles.rect.y as usize;
                let w = part_tiles.rect.w as usize;
                let h = part_tiles.rect.h as usize;

                if x + w > shape.w || y + h > shape.h {
                    return Err(Error::TilesOutOfBounds);
                }

                let tiles = structview::View::view_slice(&part_tiles.tiles.0)
                    .map_err(|_| Error::InvalidTiles)?;
                let tiles = ndarray::ArrayView::from_shape((h, w), tiles)
                    .map_err(|_| Error::InvalidTiles)?;

                // TODO
                // for tile in tiles.iter() {
                //     tile.check()
                // }

                let mut view = twmap::TilemapLayer::tiles_mut($layer)
                    .unwrap_mut()
                    .slice_mut(ndarray::s![y..y + h, x..x + w]);
                view.assign(&tiles);
            }};
        }

        match layer {
            twmap::Layer::Game(layer) => apply_tiles!(layer),
            twmap::Layer::Tiles(layer) => apply_tiles!(layer),
            twmap::Layer::Front(layer) => apply_tiles!(layer),
            twmap::Layer::Tele(layer) => apply_tiles!(layer),
            twmap::Layer::Speedup(layer) => apply_tiles!(layer),
            twmap::Layer::Switch(layer) => apply_tiles!(layer),
            twmap::Layer::Tune(layer) => apply_tiles!(layer),
            twmap::Layer::Quads(_) | twmap::Layer::Sounds(_) | twmap::Layer::Invalid(_) => {
                return Err(Error::WrongLayerType);
            }
        };

        Ok(())
    }

    pub fn get_quad(
        &self,
        map_name: &str,
        group_index: u16,
        layer_index: u16,
        quad_index: u16,
    ) -> Result<twmap::Quad, Error> {
        let room = self.room(map_name)?;
        let map = room.map();
        let layer = map
            .groups
            .get(group_index as usize)
            .ok_or(Error::GroupNotFound)?
            .layers
            .get(layer_index as usize)
            .ok_or(Error::LayerNotFound)?;

        if let twmap::Layer::Quads(layer) = layer {
            Ok(layer
                .quads
                .get(quad_index as usize)
                .ok_or(Error::QuadNotFound)?
                .clone())
        } else {
            Err(Error::WrongLayerType)
        }
    }

    pub fn put_quad(
        &self,
        map_name: &str,
        group_index: u16,
        layer_index: u16,
        quad: twmap::Quad,
    ) -> Result<(), Error> {
        quad.check_self()?;
        let room = self.room(map_name)?;
        let mut map = room.map();
        quad.check_map(&map)?;
        let layer = map
            .groups
            .get_mut(group_index as usize)
            .ok_or(Error::GroupNotFound)?
            .layers
            .get_mut(layer_index as usize)
            .ok_or(Error::LayerNotFound)?;

        if let twmap::Layer::Quads(layer) = layer {
            // COMBAK: this is a lower bound
            if layer.quads.len() == u16::MAX as usize {
                Err(Error::MaxQuads)
            } else {
                layer.quads.push(quad);
                Ok(())
            }
        } else {
            Err(Error::WrongLayerType)
        }
    }

    pub fn edit_quad(
        &self,
        map_name: &str,
        group_index: u16,
        layer_index: u16,
        quad_index: u16,
        quad: twmap::Quad,
    ) -> Result<(), Error> {
        quad.check_self()?;
        let room = self.room(map_name)?;
        let mut map = room.map();
        quad.check_map(&map)?;
        let layer = map
            .groups
            .get_mut(group_index as usize)
            .ok_or(Error::GroupNotFound)?
            .layers
            .get_mut(layer_index as usize)
            .ok_or(Error::LayerNotFound)?;

        if let twmap::Layer::Quads(layer) = layer {
            let cur_quad = layer
                .quads
                .get_mut(quad_index as usize)
                .ok_or(Error::QuadNotFound)?;
            let _ = std::mem::replace(cur_quad, quad);
            Ok(())
        } else {
            Err(Error::WrongLayerType)
        }
    }

    pub fn delete_quad(
        &self,
        map_name: &str,
        group_index: u16,
        layer_index: u16,
        quad_index: u16,
    ) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();
        let layer = map
            .groups
            .get_mut(group_index as usize)
            .ok_or(Error::GroupNotFound)?
            .layers
            .get_mut(layer_index as usize)
            .ok_or(Error::LayerNotFound)?;

        if let twmap::Layer::Quads(layer) = layer {
            if quad_index as usize >= layer.quads.len() {
                Err(Error::QuadNotFound)
            } else {
                layer.quads.remove(quad_index as usize);
                Ok(())
            }
        } else {
            Err(Error::WrongLayerType)
        }
    }

    pub fn get_automappers(&self, map_name: &str) -> Result<Vec<AutomapperDetail>, Error> {
        let room = self.room(map_name)?;
        let path = room.automapper_path();

        if let Some(path) = path {
            if let Ok(read_dir) = std::fs::read_dir(&path) {
                let automappers = read_dir
                    .filter_map(|e| e.ok())
                    .filter_map(|e| {
                        let path = e.path();
                        if let Some(kind) = is_automapper(&path) {
                            let name = e.file_name().to_string_lossy().into_owned();
                            let image = path
                                .file_stem()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .into_owned();
                            let configs = (kind == AutomapperKind::DDNet)
                                .then(|| {
                                    let file = std::fs::read_to_string(&path).ok()?;
                                    let am =
                                        twmap::automapper::Automapper::parse(image.clone(), &file)
                                            .ok()?;
                                    Some(am.configs.iter().map(|c| c.name.to_owned()).collect())
                                })
                                .flatten();

                            Some(AutomapperDetail {
                                name,
                                image,
                                kind,
                                configs,
                            })
                        } else {
                            None
                        }
                    })
                    .collect();
                Ok(automappers)
            } else {
                Ok(vec![])
            }
        } else {
            Ok(vec![])
        }
    }

    pub fn get_automapper(&self, map_name: &str, am: &str) -> Result<String, Error> {
        if !check_file_name(am) {
            return Err(Error::InvalidFileName);
        }

        let path = self
            .room(map_name)?
            .automapper_path()
            .ok_or(Error::AutomapperNotFound)?
            .join(am);

        if is_automapper(&path).is_none() {
            return Err(Error::AutomapperNotFound);
        }

        let file = std::fs::read_to_string(&path).map_err(|_| Error::AutomapperNotFound)?;

        Ok(file)
    }

    pub fn compile_rpp(&self, path: &Path) -> Result<(), Error> {
        let rpp_path = self
            .rpp_path
            .as_ref()
            .ok_or(Error::ServerError("rpp path not provided".into()))?;

        let root = path
            .parent()
            .ok_or(Error::ServerError("no parent".into()))?;

        let in_fname = path
            .file_name()
            .ok_or(Error::ServerError("no file name".into()))?
            .to_string_lossy();
        let out_fname = format!(
            "{}.rules",
            path.file_stem()
                .ok_or(Error::ServerError("no file name".into()))?
                .to_string_lossy()
        );

        let rpp_exe = rpp_path.join("rpp");
        let rpp_base_r = rpp_path.join("base.r");
        let rpp_base_p = rpp_path.join("base.p");

        let exec = std::process::Command::new(&rpp_exe)
            .current_dir(root)
            .args([
                "--output",
                &out_fname,
                "--memory",
                "100",
                "--include",
                &rpp_base_r.to_string_lossy(),
                "--include",
                &rpp_base_p.to_string_lossy(),
                "--no-pause",
                &in_fname,
            ])
            .output()
            .map_err(|e| Error::ServerError(e.to_string().into()))?;

        match exec.status.code() {
            Some(0) => Ok(()),
            Some(_) => {
                log::info!("rpp: {}", String::from_utf8_lossy(&exec.stderr));
                Err(Error::AutomapperError(
                    String::from_utf8_lossy(&exec.stderr).into_owned(),
                ))
            }
            None => {
                log::error!("rpp: {}", String::from_utf8_lossy(&exec.stderr));
                Err(Error::ServerError("rpp: no exit status".into()))
            }
        }
    }

    pub fn put_automapper(
        &self,
        peer: &Peer,
        map_name: &str,
        am: &str,
        file: &str,
    ) -> Result<(), Error> {
        if !check_file_name(am) {
            return Err(Error::InvalidFileName);
        }

        let room = self.room(map_name)?;

        let path = room
            .automapper_path()
            .ok_or(Error::ServerError(
                "No automapper directory available for this map".into(),
            ))?
            .join(am);

        let kind = is_automapper(&path).ok_or(Error::InvalidFileName)?;

        std::fs::create_dir_all(room.automapper_path().unwrap()).ok();
        std::fs::write(&path, file).map_err(|e| Error::ServerError(e.to_string().into()))?;

        if kind == AutomapperKind::RulesPP {
            self.compile_rpp(&path)
                .and_then(|()| {
                    let target = path.with_extension("rules");
                    let file = std::fs::read_to_string(&target)
                        .map_err(|e| Error::AutomapperError(e.to_string()))?;
                    let name = target
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    let message =
                        Message::Request(Request::Create(CreateReq::Automapper(name, file)));
                    self.broadcast_to_room(&room, message);
                    Ok(())
                })
                .unwrap_or_else(|err| Server::send(peer, None, Message::Response(Err(err))));
        }

        Ok(())
    }

    pub fn delete_automapper(&self, map_name: &str, am: &str) -> Result<(), Error> {
        if !check_file_name(am) {
            return Err(Error::InvalidFileName);
        }

        let path = self
            .room(map_name)?
            .automapper_path()
            .ok_or(Error::AutomapperNotFound)?
            .join(am);

        if is_automapper(&path).is_none() {
            return Err(Error::InvalidFileName);
        }

        std::fs::remove_file(path).map_err(|e| Error::ServerError(e.to_string().into()))?;

        Ok(())
    }

    pub fn apply_automapper(
        &self,
        map_name: &str,
        group_index: u16,
        layer_index: u16,
    ) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();

        let image_name = {
            let layer = map
                .groups
                .get(group_index as usize)
                .ok_or(Error::GroupNotFound)?
                .layers
                .get(layer_index as usize)
                .ok_or(Error::LayerNotFound)?;

            if let twmap::Layer::Tiles(layer) = layer {
                let index = layer.image.ok_or(Error::LayerHasNoImage)?;
                map.images
                    .get(index as usize)
                    .ok_or(Error::ImageNotFound)?
                    .name()
                    .to_owned()
            } else {
                return Err(Error::WrongLayerType);
            }
        };

        let layer = map
            .groups
            .get_mut(group_index as usize)
            .ok_or(Error::GroupNotFound)?
            .layers
            .get_mut(layer_index as usize)
            .ok_or(Error::LayerNotFound)?;

        if let twmap::Layer::Tiles(layer) = layer {
            let am_path = room
                .automapper_path()
                .ok_or(Error::AutomapperNotFound)?
                .join(format!("{image_name}.rules"));
            let file = std::fs::read_to_string(am_path).map_err(|_| Error::AutomapperNotFound)?;
            let automapper = twmap::automapper::Automapper::parse(image_name, &file)
                .map_err(|e| Error::AutomapperError(e.to_string()))?;
            layer
                .run_automapper(&automapper)
                .map_err(|_| Error::AutomapperError("config out of bounds".to_owned()))?;
            Ok(())
        } else {
            Err(Error::WrongLayerType)
        }
    }

    pub fn move_image(&self, map_name: &str, src: u16, tgt: u16) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();

        if src as usize > map.images.len() {
            return Err(Error::ImageNotFound);
        }

        if tgt as usize > map.images.len() {
            return Err(Error::ImageNotFound);
        }

        map.edit_image_indices(|i| {
            i.map(|i| {
                if i == src {
                    tgt
                } else if src < i && i <= tgt {
                    i - 1
                } else {
                    i
                }
            })
        });

        let env = map.images.remove(src as usize);
        map.images.insert(tgt as usize, env);

        Ok(())
    }

    pub fn move_envelope(&self, map_name: &str, src: u16, tgt: u16) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();

        if src as usize > map.envelopes.len() {
            return Err(Error::EnvelopeNotFound);
        }

        if tgt as usize > map.envelopes.len() {
            return Err(Error::EnvelopeNotFound);
        }

        map.edit_env_indices(|i| {
            i.map(|i| {
                if i == src {
                    tgt
                } else if src < i && i <= tgt {
                    i - 1
                } else {
                    i
                }
            })
        });

        let env = map.envelopes.remove(src as usize);
        map.envelopes.insert(tgt as usize, env);

        Ok(())
    }

    pub fn move_group(&self, map_name: &str, src: u16, tgt: u16) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();

        if src as usize > map.groups.len() {
            return Err(Error::GroupNotFound);
        }

        if tgt as usize > map.groups.len() {
            return Err(Error::GroupNotFound);
        }

        let group = map.groups.remove(src as usize);
        map.groups.insert(tgt as usize, group);

        Ok(())
    }

    pub fn move_layer(
        &self,
        map_name: &str,
        src: (u16, u16),
        tgt: (u16, u16),
    ) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();

        // checks
        {
            let src_group = map.groups.get(src.0 as usize).ok_or(Error::GroupNotFound)?;
            let src_layer = src_group
                .layers
                .get(src.1 as usize)
                .ok_or(Error::LayerNotFound)?;

            if src.0 != tgt.0 && src_layer.kind().is_physics_layer() {
                return Err(Error::PhysicsLayerChangeGroup);
            }

            let tgt_group = map.groups.get(tgt.0 as usize).ok_or(Error::GroupNotFound)?;

            if src.0 == tgt.0 && tgt.1 as usize >= tgt_group.layers.len()
                || src.0 != tgt.0 && tgt.1 as usize > tgt_group.layers.len()
            {
                return Err(Error::LayerNotFound);
            }
        }

        let layer = map.groups[src.0 as usize].layers.remove(src.1 as usize);
        map.groups[tgt.0 as usize]
            .layers
            .insert(tgt.1 as usize, layer);

        Ok(())
    }

    pub fn move_quad(&self, map_name: &str, src: (u16, u16, u16), tgt: u16) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();

        let layer = map
            .groups
            .get_mut(src.0 as usize)
            .ok_or(Error::GroupNotFound)?
            .layers
            .get_mut(src.1 as usize)
            .ok_or(Error::LayerNotFound)?;

        if let twmap::Layer::Quads(layer) = layer {
            if src.2 as usize >= layer.quads.len() || tgt as usize >= layer.quads.len() {
                Err(Error::QuadNotFound)
            } else {
                let quad = layer.quads.remove(src.0 as usize);
                layer.quads.insert(tgt as usize, quad);
                Ok(())
            }
        } else {
            Err(Error::WrongLayerType)
        }
    }

    pub fn get_users(&self, map_name: &str) -> Result<usize, Error> {
        let room = self.room(map_name)?;
        Ok(room.peer_count())
    }

    pub fn get_cursors(
        &self,
        map_name: &str,
        peer: &Peer,
    ) -> Result<HashMap<String, Cursor>, Error> {
        let room = self.room(map_name)?;

        let peer_id = room.peers().get(&peer.addr).ok_or(Error::NotJoined)?.id;

        let cursors = room
            .peers()
            .iter()
            .filter(|(_, v)| v.id != peer_id)
            .filter_map(|(_, v)| v.cursor.as_ref().map(|c| (v.id.to_string(), c.clone())))
            .collect();

        Ok(cursors)
    }

    pub fn set_cursor(&self, peer: &Peer, cursor: Cursor) -> Result<(), Error> {
        let room = peer.room.clone().ok_or(Error::MapNotFound)?;
        let mut peers = room.peers();
        let room_peer = peers
            .get_mut(&peer.addr)
            .ok_or(Error::ServerError("server error".into()))?;
        room_peer.cursor = Some(cursor);

        Ok(())
    }

    pub fn save_map(&self, map_name: &str) -> Result<(), Error> {
        let room = self.room(map_name)?;
        room.save_map().map_err(|e| Error::ServerError(e.into()))
    }

    pub fn peer_join(&self, peer: &mut Peer, map_name: &str) -> Result<(), Error> {
        if peer.room.is_some() {
            return Err(Error::AlreadyJoined);
        }

        let room = self.room(map_name)?;
        room.add_peer(peer);
        peer.room = Some(room);
        Ok(())
    }

    pub fn peer_leave(&self, peer: &mut Peer, map_name: &str) -> Result<(), Error> {
        match &peer.room {
            Some(room) => {
                if room.name() == map_name {
                    room.remove_peer(peer);
                    peer.room = None;
                    Ok(())
                } else {
                    Err(Error::NotJoined)
                }
            }
            None => Err(Error::NotJoined),
        }
    }
}
