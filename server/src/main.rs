use std::{
    collections::HashMap,
    fs::{self, File},
    io,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard},
    time::SystemTime,
};

use std::io::prelude::*;

use clap::Parser;
use glob::glob;
use regex::Regex;

use futures::{
    channel::mpsc::{unbounded, UnboundedSender},
    future,
    stream::FuturesUnordered,
    StreamExt, TryStreamExt,
};
use tokio::{
    io::{AsyncRead, AsyncWrite},
    net::TcpListener,
};

mod room;
use room::Room;

mod protocol;
use protocol::*;

mod twmap_map_edit;

use tokio_rustls::{rustls, TlsAcceptor};
use tokio_tungstenite::tungstenite::Message;
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
    room: Option<Arc<Room>>,
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
        log::debug!("text message sent to {}: {}", peer.addr, str);
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

    fn broadcast_to_room(&self, room: &Room, content: ResponseContent) {
        let msg = Broadcast {
            timestamp: SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            content,
        };

        let str = serde_json::to_string(&msg).unwrap(); // this must not fail
        let msg = Message::Text(str);

        for tx in room.peers().values() {
            tx.unbounded_send(msg.to_owned()).ok();
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
        if let Some(room) = peer.room.clone() {
            self.broadcast_to_room(&room, ResponseContent::ListUsers(list_users));
        }
    }

    fn respond_and_broadcast(&self, peer: &Peer, id: u32, content: Res) {
        match content {
            // don't send ack for editLayer or editQuad
            Ok(ResponseContent::EditTile(_)) | Ok(ResponseContent::EditQuad(_)) => (),
            _ => self.respond(peer, id, content.clone()),
        }

        if let Ok(content) = content {
            match content {
                ResponseContent::CreateMap(_) => (),
                ResponseContent::JoinMap(_) => {
                    peer.room.clone().unwrap().send_map(&peer).unwrap();
                    self.broadcast_users(peer);
                }
                ResponseContent::SaveMap(_) => (),
                ResponseContent::EditMap(_) => self.broadcast_to_others(peer, content),
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
                ResponseContent::CreateQuad(_) => self.broadcast_to_others(peer, content),
                ResponseContent::EditQuad(_) => self.broadcast_to_others(peer, content),
                ResponseContent::DeleteQuad(_) => self.broadcast_to_others(peer, content),
                ResponseContent::SendMap(_) => (),
                ResponseContent::ListUsers(_) => (),
                ResponseContent::ListMaps(_) => (),
                ResponseContent::UploadComplete => (),
                ResponseContent::CreateImage(_) => self.broadcast_to_others(peer, content),
                ResponseContent::SendImage(_) => (),
                ResponseContent::DeleteImage(_) => self.broadcast_to_others(peer, content),
                ResponseContent::Error(_) => (),
            }
        }
    }

    fn check_map_path(&self, fname: &str) -> bool {
        // COMBAK: this is too restrictive, but proper sanitization is hard.
        // TODO: add tests
        let c1 = r"[:alnum:]\(\)\[\]_,\-"; // safe 1st char in word
        let cn = r"[:alnum:]\(\)\[\]_,\-\s\."; // safe non-first char in word
        let max_len = 40; // max file name or dir name
        let word = format!(r"[{}][{}]{{0,{}}}", c1, cn, max_len - 1);
        let re = Regex::new(&format!(r"^({}/)*({})$", word, word)).unwrap();
        re.is_match(fname)
    }

    fn handle_create_map(&self, peer: &Peer, create_map: CreateMap) -> Res {
        if !self.check_map_path(&create_map.name) {
            return Err("invalid map name");
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
                map.check().map_err(server_error)?;
                let path: PathBuf = format!("maps/{}.map", create_map.name).into();
                path.parent().map(fs::create_dir_all);
                map.save_file(&path).map_err(server_error)?;
                rooms.insert(create_map.name.to_owned(), Arc::new(Room::new(path)));
            }
            CreateParams::Clone(ref params) => {
                let room = self
                    .room(&params.clone)
                    .ok_or("cannot clone non-existing map")?;
                let path: PathBuf = format!("maps/{}.map", create_map.name).into();
                room.save_copy(&path)?;
                let mut rooms = self.rooms.lock().unwrap();
                rooms.insert(create_map.name.to_owned(), Arc::new(Room::new(path)));
            }
            CreateParams::Upload {} => {
                let mut rooms = self.rooms.lock().unwrap();
                let upload_path: PathBuf = format!("uploads/{}", peer.addr).into();
                let path: PathBuf = format!("maps/{}.map", create_map.name).into();
                std::fs::rename(&upload_path, &path).map_err(|_| "upload a map first")?;
                TwMap::parse_file(&path).map_err(|_| {
                    std::fs::remove_file(&path).unwrap();
                    "not a valid map file"
                })?;
                rooms.insert(create_map.name.to_owned(), Arc::new(Room::new(path)));
            }
        }

        Ok(ResponseContent::CreateMap(create_map))
    }

    fn handle_edit_map(&self, peer: &Peer, edit_map: EditMap) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.set_map_info(edit_map.info.clone())?;
        Ok(ResponseContent::EditMap(edit_map))
    }

    fn handle_join_map(&self, peer: &mut Peer, join_map: JoinMap) -> Res {
        if let Some(room) = &peer.room {
            room.remove_peer(peer);
            self.broadcast_users(peer);
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
        room.create_group(&create_group)?;
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

    fn handle_create_quad(&self, peer: &mut Peer, create_quad: CreateQuad) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.create_quad(&create_quad)?;
        Ok(ResponseContent::CreateQuad(create_quad))
    }

    fn handle_edit_quad(&self, peer: &mut Peer, edit_quad: EditQuad) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.set_quad(&edit_quad)?;
        Ok(ResponseContent::EditQuad(edit_quad))
    }

    fn handle_delete_quad(&self, peer: &mut Peer, delete_quad: DeleteQuad) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.delete_quad(&delete_quad)?;
        Ok(ResponseContent::DeleteQuad(delete_quad))
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

    fn handle_create_image(&self, peer: &Peer, create_image: CreateImage) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;

        if create_image.external {
            room.add_external_image(create_image.name.to_owned(), create_image.index)?;
        } else {
            let upload_path: PathBuf = format!("uploads/{}", peer.addr).into();
            room.add_embedded_image(
                &upload_path,
                create_image.name.to_owned(),
                create_image.index,
            )?;
        }

        Ok(ResponseContent::CreateImage(create_image))
    }

    fn handle_send_image(&self, peer: &Peer, send_image: SendImage) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        // room.send_image(&send_image)?;
        let image_info = room.image_info(send_image.index)?;
        room.send_image(peer, send_image.index)?;
        Ok(ResponseContent::SendImage(image_info))
    }

    fn handle_delete_image(&self, peer: &Peer, delete_image: DeleteImage) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;

        room.remove_image(delete_image.index)?;
        Ok(ResponseContent::DeleteImage(delete_image))
    }

    fn handle_upload_file(&self, peer: &Peer, data: &[u8]) -> Res {
        let path: PathBuf = format!("uploads/{}", peer.addr).into();
        let mut file = File::create(path).map_err(server_error)?;
        file.write_all(data).map_err(server_error)?;
        Ok(ResponseContent::UploadComplete)
    }

    fn handle_request(&self, peer: &mut Peer, req: Request) {
        let res = match req.content {
            RequestContent::CreateMap(content) => self.handle_create_map(peer, content),
            RequestContent::EditMap(content) => self.handle_edit_map(peer, content),
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
            RequestContent::CreateQuad(content) => self.handle_create_quad(peer, content),
            RequestContent::EditQuad(content) => self.handle_edit_quad(peer, content),
            RequestContent::DeleteQuad(content) => self.handle_delete_quad(peer, content),
            RequestContent::SendMap(content) => self.handle_send_map(peer, content),
            RequestContent::ListUsers => self.handle_list_users(peer),
            RequestContent::ListMaps => self.handle_list_maps(),
            RequestContent::CreateImage(content) => self.handle_create_image(peer, content),
            RequestContent::SendImage(content) => self.handle_send_image(peer, content),
            RequestContent::DeleteImage(content) => self.handle_delete_image(peer, content),
        };
        self.respond_and_broadcast(peer, req.id, res);
    }

    async fn handle_connection<S>(&self, raw_stream: S, addr: SocketAddr)
    where
        S: AsyncRead + AsyncWrite + Unpin,
    {
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
                    let res = self.handle_upload_file(&peer, &data);
                    self.respond(&peer, 1, res);
                }
                _ => (),
            }

            future::ok(())
        });

        future::select(fut_send, fut_recv).await;

        if let Some(room) = &peer.room {
            room.remove_peer(&peer);
        }

        self.broadcast_users(&peer);

        // if the peer uploaded a map but did not use it, we want to delete it now.
        let upload_path: PathBuf = format!("uploads/{}", peer.addr).into();
        std::fs::remove_file(&upload_path).ok();

        log::info!("disconnected {}", &addr);
    }

    fn recover_after_panic(&self, addr: SocketAddr) {
        let rooms = self.rooms();
        let room = rooms
            .iter()
            .find(|(_, room)| room.peers().contains_key(&addr));
        match room {
            Some((_, room)) => {
                room.remove_closed_peers();
                let map = room.map.get_opt();
                if let Some(map) = &*map {
                    let response = if let Err(e) = map.check() {
                        log::error!("map error is: {}", e);
                        Error::MapError(e.to_string())
                    } else {
                        Error::ServerError
                    };
                    self.broadcast_to_room(room, ResponseContent::Error(response));
                }
            }
            None => {
                log::error!("could not find a room containing the peer that caused the panic");
            }
        }
    }
}

fn create_server() -> Server {
    let server = Server::new();
    {
        let mut server_rooms = server.rooms();
        let rooms = glob("maps/**/*.map")
            .expect("no map found in maps directory")
            .into_iter()
            .filter_map(|e| e.ok())
            .map(|e| Arc::new(Room::new(e)));
        for r in rooms {
            let name = r.map.path.with_extension("").to_string_lossy().into_owned();
            server_rooms.insert(name[5..].to_string(), r);
        }
    }
    log::info!("found {} maps.", server.rooms().len());
    server
}

fn load_certs(path: &Path) -> io::Result<Vec<rustls::Certificate>> {
    rustls_pemfile::certs(&mut io::BufReader::new(File::open(path)?))
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "invalid cert"))
        .map(|mut certs| certs.drain(..).map(rustls::Certificate).collect())
}

fn load_keys(path: &Path) -> io::Result<Vec<rustls::PrivateKey>> {
    rustls_pemfile::pkcs8_private_keys(&mut io::BufReader::new(File::open(path)?))
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "invalid key"))
        .map(|mut keys| keys.drain(..).map(rustls::PrivateKey).collect())
}

#[derive(Parser)]
#[clap(name = "TWWE Server")]
#[clap(author = "Mathis Brossier <mathis.brossier@gmail.com>")]
#[clap(version = "0.1")]
#[clap(about = "TeeWorlds Web Editor server", long_about = None)]
struct Cli {
    /// Address and port to listen to (addr:port)
    #[clap(value_parser, default_value = "127.0.0.1:16800")]
    addr: String,

    // Path to the TLS certificate
    #[clap(value_parser, short, long, requires = "key")]
    cert: Option<PathBuf>,

    /// Path to the TLS certificate private key
    #[clap(value_parser, short, long, requires = "cert")]
    key: Option<PathBuf>,
}

#[tokio::main]
async fn main() {
    let args = Cli::parse();

    std::fs::remove_dir_all("uploads").ok();
    std::fs::create_dir("uploads").ok();

    pretty_env_logger::init();

    let state = Arc::new(create_server());

    // Setup TLS
    let tls_acceptor = match (&args.cert, &args.key) {
        (Some(cert), Some(key)) => {
            let certs = load_certs(cert).expect("certificate file not found");
            let mut keys = load_keys(key).expect("private key file not found");
            let config = rustls::ServerConfig::builder()
                .with_safe_defaults()
                .with_no_client_auth()
                .with_single_cert(certs, keys.remove(0))
                .map_err(|err| io::Error::new(io::ErrorKind::InvalidInput, err))
                .unwrap();
            Some(TlsAcceptor::from(Arc::new(config)))
        }
        _ => None,
    };

    // Create the event loop and TCP listener we'll accept connections on.
    let try_socket = TcpListener::bind(&args.addr).await;
    let listener = try_socket.expect("Failed to bind");
    log::info!("Listening on: {}", args.addr);

    let mut connections = FuturesUnordered::new();

    loop {
        tokio::select! {
            _ = connections.next(), if connections.len() != 0 => (),
            Ok((stream, addr)) = listener.accept() => {
                let tls_acceptor = tls_acceptor.clone();
                let (state1, state2) = (state.clone(), state.clone());
                let handle = async move {
                    // TLS Case
                    if let Some(acceptor) = tls_acceptor {
                        match acceptor.accept(stream).await {
                            Ok(stream) => {
                                let res = tokio::spawn(async move { state1.handle_connection(stream, addr).await }).await;
                                if let Err(e) = res {
                                    log::error!("task for peer {} panicked: {}", addr, e);
                                    state2.recover_after_panic(addr);
                                }
                            }
                            Err(e) => {
                                log::error!("tcp connection with peer {} failed: {}", addr, e);
                            }
                        }
                    }

                    // no TLS case
                    else {
                        let res = tokio::spawn(async move { state1.handle_connection(stream, addr).await }).await;
                        if let Err(e) = res {
                            log::error!("task for peer {} panicked: {}", addr, e);
                            state2.recover_after_panic(addr);
                        }
                    }
                };
                connections.push(handle);
            },
            else => log::error!("accept() failed")
        }
    }
}
