use std::{
    collections::HashMap,
    env,
    error::Error,
    io,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard},
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
type Res<T> = Result<T, Box<dyn Error>>;

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

    fn handle_join_room(&self, peer: &mut Peer, room_name: String) -> Res<()> {
        if let Some(room) = &peer.room {
            room.remove_peer(peer);
        }

        let room = self
            .room(&room_name)
            .ok_or("peer wants to join non-existing room")?;

        room.add_peer(peer);
        peer.room = Some(room);

        // send acknowledgement
        let str = serde_json::to_string(&GlobalResponse::Join(true))?;
        peer.tx.unbounded_send(Message::Text(str))?;
        Ok(())
    }

    fn handle_query_maps(&self, peer: &Peer) -> Res<()> {
        let maps: Vec<MapInfo> = self
            .rooms()
            .iter()
            .map(|(name, map)| MapInfo {
                name: name.to_owned(),
                users: map.peers().len() as u32,
            })
            .collect();
        let str = serde_json::to_string(&GlobalResponse::Maps(maps))?;
        peer.tx.unbounded_send(Message::Text(str))?;
        Ok(())
    }

    fn handle_create_map(&self, peer: &Peer, create_map: CreateMap) -> Result<(), &'static str> {
        if create_map.name == "" {
            return Err("empty name".into());
        }
        if self.room(&create_map.name).is_some() {
            return Err("name already taken".into());
        }

        match create_map.params {
            CreateParams::Blank(params) => {
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
                rooms.insert(create_map.name, Arc::new(Room::new(path)));
            }
            CreateParams::Clone(params) => {
                let room = self
                    .room(&params.clone)
                    .ok_or("cannot clone non-existing map")?;
                let path: PathBuf = format!("maps/{}.map", create_map.name).into();
                room.save_copy(&path).unwrap();
                let mut rooms = self.rooms.lock().unwrap();
                rooms.insert(create_map.name, Arc::new(Room::new(path)));
            }
            CreateParams::Upload => {
                let mut rooms = self.rooms.lock().unwrap();
                let upload_path: PathBuf = format!("uploads/{}.map", peer.addr).into();
                let path: PathBuf = format!("maps/{}.map", create_map.name).into();
                std::fs::rename(&upload_path, &path).map_err(|_| "upload a map first")?;
                rooms.insert(create_map.name, Arc::new(Room::new(path)));
            }
        }

        let str = serde_json::to_string(&GlobalResponse::CreateMap(true)).unwrap();
        peer.tx.unbounded_send(Message::Text(str)).ok();
        Ok(())
    }

    fn handle_upload_map(&self, peer: &Peer, map: &mut TwMap) -> Res<()> {
        let path: PathBuf = format!("uploads/{}.map", peer.addr).into();
        map.save_file(&path)?;
        let str = serde_json::to_string(&GlobalResponse::UploadComplete)?;
        peer.tx.unbounded_send(Message::Text(str))?;
        Ok(())
    }

    fn handle_request(&self, peer: &mut Peer, req: Request) -> Res<()> {
        match req {
            Request::Global(req) => match req {
                GlobalRequest::Join(room) => self.handle_join_room(peer, room),
                GlobalRequest::Maps => self.handle_query_maps(peer),
                GlobalRequest::CreateMap(create_map) => {
                    self.handle_create_map(peer, create_map).map_err(|e| {
                        let str =
                            serde_json::to_string(&GlobalResponse::Refused(e.to_owned())).unwrap();
                        peer.tx.unbounded_send(Message::Text(str)).ok();
                        e.into()
                    })
                }
            },
            Request::Room(req) => {
                let room = { peer.room.clone().ok_or("peer is not in a room")? };
                room.handle_request(peer, req)
            }
        }
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
                            self.handle_request(&mut peer, req).unwrap_or_else(|e| {
                                log::error!("error occured while handling request: {}", e);
                            });
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
                            self.handle_upload_map(&peer, &mut map).unwrap_or_else(|e| {
                                log::error!("failed to upload map: {}", e);
                            });
                        }
                        Err(e) => {
                            log::error!("failed to parse uploaded map: {}", e);
                            let str = serde_json::to_string(&GlobalResponse::Refused(
                                "not a valid map file".into(),
                            ))
                            .unwrap();
                            peer.tx.unbounded_send(Message::Text(str)).ok();
                        }
                    }
                }
                _ => {
                    log::debug!("unhandled message type from {}", addr);
                }
            }

            future::ok(())
        });

        future::select(fut_send, fut_recv).await;

        if let Some(room) = &peer.room {
            room.remove_peer(&peer);
        }

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
