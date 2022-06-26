use std::{
    collections::HashMap,
    env, io,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard},
    time::SystemTime,
};

use glob::glob;

use futures::{
    channel::mpsc::{unbounded, UnboundedSender},
    future, StreamExt, TryStreamExt,
};
use tokio::net::{TcpListener, TcpStream};

mod room;
use room::Room;

mod protocol;
use protocol::*;

use tungstenite::Message;
use twmap::TwMap;

type Tx = UnboundedSender<Message>;
type Res = Result<ResponseContent, &'static str>;

fn server_error<E: std::fmt::Display>(err: E) -> &'static str {
    log::error!("{}", err);
    "internal server error"
}

pub struct Peer {
    // name: String, // TODO add more information about users
    addr: SocketAddr,
    tx: Tx,
    room: Option<Arc<Room>>, // stream: WebSocketStream<TcpStream>,
}

impl Peer {
    fn new(addr: SocketAddr, tx: Tx) -> Self {
        Peer {
            // name: "Unnamed user".to_owned(),
            addr,
            tx,
            room: None,
        }
    }
}

struct Server {
    rooms: Mutex<HashMap<String, Arc<Room>>>,
}

impl Server {
    fn new() -> Self {
        Server {
            rooms: Mutex::new(HashMap::new()),
        }
    }

    fn rooms(&self) -> MutexGuard<HashMap<String, Arc<Room>>> {
        self.rooms.lock().expect("failed to lock rooms")
    }

    fn room(&self, name: &str) -> Option<Arc<Room>> {
        self.rooms().get(name).map(Arc::to_owned)
    }

    fn respond(&self, peer: &Peer, id: u32, content: Res) {
        let msg = Response {
            timestamp: SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            id,
            content,
        };
        let str = serde_json::to_string(&msg).unwrap(); // this must not fail
        peer.tx.unbounded_send(Message::Text(str)).ok(); // this is ok to fail (peer logout)
    }

    // fn broadcast_to_all(&self, content: ResponseContent) {
    //     let msg = Broadcast {
    //         timestamp: SystemTime::now()
    //             .duration_since(SystemTime::UNIX_EPOCH)
    //             .unwrap()
    //             .as_secs(),
    //         content,
    //     };

    //     let str = serde_json::to_string(&msg).unwrap(); // this must not fail
    //     let msg = Message::Text(str);

    //     for room in self.rooms().values() {
    //         for tx in room.peers().values() {
    //             tx.unbounded_send(msg.to_owned()).ok();
    //         }
    //     }
    // }

    fn broadcast_to_room(&self, peer: &Peer, content: ResponseContent) {
        let msg = Broadcast {
            timestamp: SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            content,
        };

        let str = serde_json::to_string(&msg).unwrap(); // this must not fail
        let msg = Message::Text(str);

        if let Some(room) = peer.room.clone() {
            for tx in room.peers().values() {
                tx.unbounded_send(msg.to_owned()).ok();
            }
        }
    }

    fn broadcast_to_others(&self, peer: &Peer, content: ResponseContent) {
        let msg = Broadcast {
            timestamp: SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            content,
        };

        let str = serde_json::to_string(&msg).unwrap(); // this must not fail
        let msg = Message::Text(str);

        if let Some(room) = peer.room.clone() {
            for (addr, tx) in room.peers().iter() {
                if !addr.eq(&peer.addr) {
                    tx.unbounded_send(msg.to_owned()).ok();
                }
            }
        }
    }

    fn broadcast_users(&self, peer: &Peer) {
        let list_users = ListUsers {
            global_count: self.rooms().values().map(|r| r.peer_count() as u32).sum(),
            room_count: peer.room.clone().map(|r| r.peer_count() as u32),
        };

        self.broadcast_to_room(&peer, ResponseContent::ListUsers(list_users));
    }

    fn respond_and_broadcast(&self, peer: &Peer, id: u32, content: Res) {
        self.respond(peer, id, content.clone());

        if let Ok(content) = content {
            match content {
                ResponseContent::CreateMap(_) => (),
                ResponseContent::JoinMap(_) => {
                    peer.room.clone().unwrap().send_map(&peer).unwrap();
                    self.broadcast_users(peer);
                }
                ResponseContent::SaveMap(_) => (),
                ResponseContent::DeleteMap(_) => (),
                ResponseContent::CreateGroup(_) => self.broadcast_to_others(peer, content),
                ResponseContent::EditGroup(_) => self.broadcast_to_others(peer, content),
                ResponseContent::ReorderGroup(_) => self.broadcast_to_others(peer, content),
                ResponseContent::DeleteGroup(_) => self.broadcast_to_others(peer, content),
                ResponseContent::CreateLayer(_) => self.broadcast_to_others(peer, content),
                ResponseContent::EditLayer(_) => self.broadcast_to_others(peer, content),
                ResponseContent::ReorderLayer(_) => self.broadcast_to_others(peer, content),
                ResponseContent::DeleteLayer(_) => self.broadcast_to_others(peer, content),
                ResponseContent::EditTile(_) => self.broadcast_to_others(peer, content),
                ResponseContent::SendMap(_) => (),
                ResponseContent::ListUsers(_) => (),
                ResponseContent::ListMaps(_) => (),
                ResponseContent::UploadComplete => (),
            }
        }
    }

    fn handle_create_map(&self, peer: &Peer, create_map: CreateMap) -> Res {
        if create_map.name == "" {
            return Err("empty name");
        }
        if self.room(&create_map.name).is_some() {
            return Err("name already taken");
        }

        match create_map.params {
            CreateParams::Blank(ref params) => {
                let mut rooms = self.rooms.lock().unwrap();
                let mut map = TwMap::empty(params.version.unwrap_or(twmap::Version::DDNet06));
                let mut group = twmap::Group::physics();
                let layer = twmap::GameLayer {
                    tiles: twmap::CompressedData::Loaded(ndarray::Array2::default((
                        params.width as usize,
                        params.height as usize,
                    ))),
                };
                group.layers.push(twmap::Layer::Game(layer));
                map.groups.push(group);
                debug_assert!(map.check().is_ok());
                let path: PathBuf = format!("maps/{}.map", create_map.name).into();
                map.save_file(&path).unwrap();
                rooms.insert(create_map.name.to_owned(), Arc::new(Room::new(path)));
            }
            CreateParams::Clone(ref params) => {
                let room = self
                    .room(&params.clone)
                    .ok_or("cannot clone non-existing map")?;
                let path: PathBuf = format!("maps/{}.map", create_map.name).into();
                room.save_copy(&path).unwrap();
                let mut rooms = self.rooms.lock().unwrap();
                rooms.insert(create_map.name.to_owned(), Arc::new(Room::new(path)));
            }
            CreateParams::Upload {} => {
                let mut rooms = self.rooms.lock().unwrap();
                let upload_path: PathBuf = format!("uploads/{}.map", peer.addr).into();
                let path: PathBuf = format!("maps/{}.map", create_map.name).into();
                std::fs::rename(&upload_path, &path).map_err(|_| "upload a map first")?;
                rooms.insert(create_map.name.to_owned(), Arc::new(Room::new(path)));
            }
        }

        Ok(ResponseContent::CreateMap(create_map))
    }

    fn handle_join_map(&self, peer: &mut Peer, join_map: JoinMap) -> Res {
        if let Some(room) = &peer.room {
            room.remove_peer(peer);
        }

        let room = self.room(&join_map.name).ok_or("map does not exist")?;

        room.add_peer(peer);
        peer.room = Some(room);

        Ok(ResponseContent::JoinMap(join_map))
    }

    fn handle_save_map(&self, _peer: &mut Peer, save_map: SaveMap) -> Res {
        let room = self.room(&save_map.name).ok_or("map does not exist")?;
        room.save_map()?;
        Ok(ResponseContent::SaveMap(save_map))
    }

    fn handle_delete_map(&self, _peer: &Peer, delete_map: DeleteMap) -> Res {
        match self.room(&delete_map.name) {
            Some(room) => {
                if room.peers().len() != 0 {
                    Err("map contains users")
                } else {
                    self.rooms().remove(&delete_map.name);
                    std::fs::remove_file(room.map.path.to_owned()).map_err(server_error)?;
                    Ok(ResponseContent::DeleteMap(delete_map))
                }
            }
            None => Err("no map found with the given name"),
        }
    }

    fn handle_create_group(&self, peer: &mut Peer, create_group: CreateGroup) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.create_group(&create_group);
        Ok(ResponseContent::CreateGroup(create_group))
    }

    fn handle_edit_group(&self, peer: &mut Peer, edit_group: EditGroup) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.edit_group(&edit_group)?;
        Ok(ResponseContent::EditGroup(edit_group))
    }

    fn handle_reorder_group(&self, peer: &mut Peer, reorder_group: ReorderGroup) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.reorder_group(&reorder_group)?;
        Ok(ResponseContent::ReorderGroup(reorder_group))
    }

    fn handle_delete_group(&self, peer: &mut Peer, delete_group: DeleteGroup) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.delete_group(&delete_group)?;
        Ok(ResponseContent::DeleteGroup(delete_group))
    }

    fn handle_create_layer(&self, peer: &mut Peer, create_layer: CreateLayer) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.create_layer(&create_layer)?;
        Ok(ResponseContent::CreateLayer(create_layer))
    }

    fn handle_edit_layer(&self, peer: &mut Peer, edit_layer: EditLayer) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.edit_layer(&edit_layer)?;
        Ok(ResponseContent::EditLayer(edit_layer))
    }

    fn handle_reorder_layer(&self, peer: &mut Peer, reorder_layer: ReorderLayer) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.reorder_layer(&reorder_layer)?;
        Ok(ResponseContent::ReorderLayer(reorder_layer))
    }

    fn handle_delete_layer(&self, peer: &mut Peer, delete_layer: DeleteLayer) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.delete_layer(&delete_layer)?;
        Ok(ResponseContent::DeleteLayer(delete_layer))
    }

    fn handle_edit_tile(&self, peer: &mut Peer, edit_tile: EditTile) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.set_tile(&edit_tile)?;
        Ok(ResponseContent::EditTile(edit_tile))
    }

    fn handle_send_map(&self, peer: &Peer, send_map: SendMap) -> Res {
        let room = self
            .room(&send_map.name)
            .ok_or("user is not connected to a map")?;
        room.send_map(peer)?;
        Ok(ResponseContent::SendMap(send_map))
    }

    fn handle_list_maps(&self) -> Res {
        let maps: Vec<MapInfo> = self
            .rooms()
            .iter()
            .map(|(name, map)| MapInfo {
                name: name.to_owned(),
                users: map.peers().len() as u32,
            })
            .collect();
        Ok(ResponseContent::ListMaps(ListMaps { maps }))
    }

    fn handle_list_users(&self, peer: &Peer) -> Res {
        Ok(ResponseContent::ListUsers(ListUsers {
            global_count: self.rooms().values().map(|r| r.peer_count() as u32).sum(),
            room_count: peer.room.clone().map(|r| r.peer_count() as u32),
        }))
    }

    fn handle_request(&self, peer: &mut Peer, req: Request) {
        let res = match req.content {
            RequestContent::CreateMap(content) => self.handle_create_map(peer, content),
            RequestContent::JoinMap(content) => self.handle_join_map(peer, content),
            RequestContent::SaveMap(content) => self.handle_save_map(peer, content),
            RequestContent::DeleteMap(content) => self.handle_delete_map(peer, content),
            RequestContent::CreateGroup(content) => self.handle_create_group(peer, content),
            RequestContent::EditGroup(content) => self.handle_edit_group(peer, content),
            RequestContent::ReorderGroup(content) => self.handle_reorder_group(peer, content),
            RequestContent::DeleteGroup(content) => self.handle_delete_group(peer, content),
            RequestContent::CreateLayer(content) => self.handle_create_layer(peer, content),
            RequestContent::EditLayer(content) => self.handle_edit_layer(peer, content),
            RequestContent::ReorderLayer(content) => self.handle_reorder_layer(peer, content),
            RequestContent::DeleteLayer(content) => self.handle_delete_layer(peer, content),
            RequestContent::EditTile(content) => self.handle_edit_tile(peer, content),
            RequestContent::SendMap(content) => self.handle_send_map(peer, content),
            RequestContent::ListUsers => self.handle_list_users(peer),
            RequestContent::ListMaps => self.handle_list_maps(),
        };
        self.respond_and_broadcast(peer, req.id, res);
    }

    fn handle_upload_map(&self, peer: &Peer, map: &mut TwMap) -> Res {
        let path: PathBuf = format!("uploads/{}.map", peer.addr).into();
        map.save_file(&path).map_err(server_error)?;
        Ok(ResponseContent::UploadComplete)
    }

    async fn handle_connection(&self, raw_stream: TcpStream, addr: SocketAddr) {
        log::debug!("Incoming TCP connection from: {}", addr);

        // accept
        let ws_stream = tokio_tungstenite::accept_async(raw_stream)
            .await
            .expect("Error during the websocket handshake occurred");
        log::info!("WebSocket connection established: {}", addr);

        // insert peer in peers
        let (tx, ws_recv) = ws_stream.split();
        let (ws_send, rx) = unbounded();
        let fut_send = rx.map(Ok).forward(tx);

        let mut peer = Peer::new(addr, ws_send);

        let fut_recv = ws_recv.try_for_each(|msg| {
            match msg {
                Message::Text(text) => {
                    log::debug!("text message received from {}: {}", addr, text);

                    match serde_json::from_str(&text) {
                        Ok(req) => {
                            self.handle_request(&mut peer, req);
                        }
                        Err(e) => {
                            log::error!("failed to parse message: {}", e);
                        }
                    };
                }
                Message::Binary(data) => {
                    log::debug!("binary message received from {}", addr);

                    match TwMap::parse(&data) {
                        Ok(mut map) => {
                            let res = self.handle_upload_map(&peer, &mut map);
                            self.respond(&peer, 0, res);
                        }
                        Err(e) => {
                            log::error!("failed to parse uploaded map: {}", e);
                            self.respond(&peer, 0, Err("not a valid map file"))
                        }
                    }
                }
                _ => {
                    log::warn!("unhandled message type from {}", addr);
                }
            }

            future::ok(())
        });

        future::select(fut_send, fut_recv).await;

        if let Some(room) = &peer.room {
            room.remove_peer(&peer);
        }

        self.broadcast_users(&peer);

        // if the peer uploaded a map but did not use it, we want to delete it now.
        let upload_path: PathBuf = format!("uploads/{}.map", peer.addr).into();
        std::fs::remove_file(&upload_path).ok();

        println!("{} disconnected", &addr);
    }
}

fn create_server() -> Server {
    let server = Server::new();
    {
        let mut server_rooms = server.rooms();
        let rooms = glob("maps/*.map")
            .expect("no map found in maps directory")
            .into_iter()
            .filter_map(|e| e.ok())
            .map(|e| Arc::new(Room::new(e)));
        for r in rooms {
            let name = r
                .map
                .path
                .file_stem()
                .unwrap()
                .to_string_lossy()
                .into_owned();
            server_rooms.insert(name, r);
        }
    }
    log::info!("found {} maps.", server.rooms().len());
    server
}

#[tokio::main]
async fn main() -> Result<(), io::Error> {
    std::fs::remove_dir_all("uploads").ok();
    std::fs::create_dir("uploads").ok();

    pretty_env_logger::init();
    let addr = env::args()
        .nth(1)
        .unwrap_or_else(|| "127.0.0.1:16800".to_string());

    let state = Arc::new(create_server());

    // Create the event loop and TCP listener we'll accept connections on.
    let try_socket = TcpListener::bind(&addr).await;
    let listener = try_socket.expect("Failed to bind");
    log::info!("Listening on: {}", addr);

    // Let's spawn the handling of each connection in a separate task.
    while let Ok((stream, addr)) = listener.accept().await {
        let state = state.clone();
        tokio::spawn(async move { state.handle_connection(stream, addr).await });
    }

    Ok(())
}
