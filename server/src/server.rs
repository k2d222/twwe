use std::{
    collections::HashMap,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard, OnceLock},
};

use axum::extract::ws::{self, WebSocket};
use futures::{channel::mpsc::unbounded, StreamExt, TryStreamExt};
use image::ImageFormat;
use regex::Regex;

use crate::{
    base64::Base64,
    cli::Cli,
    error::Error,
    protocol::*,
    room::{Peer, Room},
    twmap_map_checks::InternalMapChecking,
    twmap_map_edit::{extend_layer, shrink_layer},
};

pub struct Server {
    rooms: Mutex<HashMap<String, Arc<Room>>>,
    rpp_path: PathBuf,
}

macro_rules! apply_partial {
    ($src:expr => $tgt:expr, $($field:ident),*) => {{
        $(
            if let Some($field) = $src.$field {
                $tgt.$field = $field;
            }
        )*
    }};
}

impl Server {
    pub fn new(cli: &Cli) -> Self {
        Server {
            rooms: Mutex::new(HashMap::new()),
            rpp_path: cli.rpp_path.clone().unwrap_or(PathBuf::from("rpp")),
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
    fn send(&self, peer: &Peer, id: Option<u32>, msg: Message) {
        let packet = SendPacket {
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            id,
            content: msg,
        };
        let str = serde_json::to_string(&packet).unwrap(); // this must not fail
        peer.tx.unbounded_send(ws::Message::Text(str)).ok(); // this is ok to fail (peer logout)
    }

    fn broadcast_to_lobby(&self, msg: Message) {
        let packet = SendPacket {
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            id: None,
            content: msg,
        };

        let str = serde_json::to_string(&packet).unwrap(); // this must not fail
        let msg = ws::Message::Text(str);

        log::warn!("TODO: broadcast_to_lobby");
    }

    fn broadcast_to_room(&self, room: &Room, content: Message) {
        let packet = SendPacket {
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            id: None,
            content,
        };

        let str = serde_json::to_string(&packet).unwrap(); // this must not fail
        let msg = ws::Message::Text(str);

        for p in room.peers().values() {
            p.tx.unbounded_send(msg.to_owned()).ok();
        }
    }

    fn broadcast_to_others(&self, peer: &Peer, content: Message) {
        let packet = SendPacket {
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            id: None,
            content,
        };

        let str = serde_json::to_string(&packet).unwrap(); // this must not fail
        let msg = ws::Message::Text(str);

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
        match req {
            Request::Map(req) => {
                let room = peer.room.clone().ok_or(Error::MapNotFound)?;
                let map_name = room.name();
                match req {
                    MapReq::Get(req) => match req {
                        MapGetReq::Users => self.get_users(map_name).map(|r| Response::Users(r)),
                        MapGetReq::Cursors => {
                            self.get_cursors(map_name).map(|r| Response::Cursors(r))
                        }
                        MapGetReq::Map => self.get_map(map_name).map(|r| Response::Map(Base64(r))),
                        MapGetReq::Images => self.get_images(map_name).map(|r| Response::Images(r)),
                        MapGetReq::Image(i) => self
                            .get_image(map_name, i)
                            .map(|r| Response::Image(Base64(r))),
                        MapGetReq::Envelopes => {
                            self.get_envelopes(map_name).map(|r| Response::Envelopes(r))
                        }
                        MapGetReq::Envelope(e) => self
                            .get_envelope(map_name, e)
                            .map(|r| Response::Envelope(Box::new(r))),
                        MapGetReq::Groups => self.get_groups(map_name).map(|r| Response::Groups(r)),
                        MapGetReq::Layers(g) => {
                            self.get_layers(map_name, g).map(|r| Response::Layers(r))
                        }
                        MapGetReq::Automappers => self
                            .get_automappers(map_name)
                            .map(|r| Response::Automappers(r)),
                        MapGetReq::Automapper(am) => self
                            .get_automapper(map_name, &am)
                            .map(|r| Response::Automapper(r)),
                    },
                    MapReq::Put(req) => match req {
                        MapPutReq::Envelope(req) => self.put_envelope(map_name, *req),
                        MapPutReq::Group(req) => self.put_group(map_name, *req),
                        MapPutReq::Layer(g, req) => self.put_layer(map_name, g, *req),
                        MapPutReq::Automapper(am, file) => {
                            self.put_automapper(map_name, &am, &file)
                        }
                    }
                    .map(|()| Response::Ok),
                    MapReq::Post(req) => match req {
                        MapPostReq::Config(req) => self.post_config(map_name, *req),
                        MapPostReq::Info(req) => self.post_info(map_name, *req),
                        MapPostReq::Envelope(e, req) => self.post_envelope(map_name, e, *req),
                        MapPostReq::Group(g, req) => self.post_group(map_name, g, *req),
                        MapPostReq::Layer(g, l, req) => self.post_layer(map_name, g, l, *req),
                        MapPostReq::Tiles(g, l, req) => self.post_tiles(map_name, g, l, *req),
                        MapPostReq::Automap(g, l) => self.apply_automapper(map_name, g, l),
                    }
                    .map(|()| Response::Ok),
                    MapReq::Patch(req) => match req {
                        MapPatchReq::Envelope(src, tgt) => self.patch_envelope(map_name, src, tgt),
                        MapPatchReq::Group(src, tgt) => self.patch_group(map_name, src, tgt),
                        MapPatchReq::Layer(src, tgt) => self.patch_layer(map_name, src, tgt),
                    }
                    .map(|()| Response::Ok),
                    MapReq::Delete(req) => match req {
                        MapDelReq::Envelope(e) => self.delete_envelope(map_name, e),
                        MapDelReq::Group(g) => self.delete_group(map_name, g),
                        MapDelReq::Layer(g, l) => self.delete_layer(map_name, g, l),
                        MapDelReq::Automapper(am) => self.delete_automapper(map_name, &am),
                    }
                    .map(|()| Response::Ok),
                    MapReq::Cursor(req) => self.set_cursor(peer, *req).map(|()| Response::Ok),
                    MapReq::Save => self.save_map(map_name).map(|()| Response::Ok),
                }
            }
            Request::Get(req) => match req {
                GetReq::Map(map_name) => self.get_map(&map_name).map(|r| Response::Map(Base64(r))),
            },
            Request::Put(req) => match req {
                PutReq::Map(map_name, content) => {
                    self.put_map(&map_name, &content.0).map(|()| Response::Ok)
                }
            },
            Request::Post(req) => match req {
                PostReq::Map(map_name, req) => {
                    self.post_map(&map_name, *req).map(|()| Response::Ok)
                }
            },
            Request::Delete(req) => match req {
                DeleteReq::Map(map_name) => self.delete_map(&map_name).map(|()| Response::Ok),
            },
            Request::Join(map_name) => self.peer_join(peer, &map_name).map(|()| Response::Ok),
            Request::Leave(map_name) => self.peer_leave(peer, &map_name).map(|()| Response::Ok),
        }
    }

    fn do_respond(&self, peer: &Peer, packet: &RecvPacket, resp: Result<Response, Error>) {
        self.send(peer, packet.id, Message::Response(resp.clone()));
        if resp.is_ok() {
            match &packet.content {
                Request::Map(req) => {
                    let room = peer.room.clone().unwrap(); // safety: map requests require the peer to be in the map to succeed
                    match req {
                        MapReq::Get(_) | MapReq::Cursor(_) => (),
                        MapReq::Put(_) | MapReq::Post(_) | MapReq::Patch(_) | MapReq::Delete(_) => {
                            self.broadcast_to_others(peer, Message::Request(packet.content.clone()))
                        }
                        MapReq::Save => {
                            self.broadcast_to_others(peer, Message::Broadcast(Broadcast::Saved))
                        }
                    }
                }
                Request::Get(_) => (),
                Request::Put(req) => match req {
                    PutReq::Map(map_name, _) => self.broadcast_to_lobby(Message::Broadcast(
                        Broadcast::MapCreated(map_name.clone()),
                    )),
                },
                Request::Post(req) => match req {
                    PostReq::Map(map_name, _) => self.broadcast_to_lobby(Message::Broadcast(
                        Broadcast::MapCreated(map_name.clone()),
                    )),
                },
                Request::Delete(req) => match req {
                    DeleteReq::Map(map_name) => self.broadcast_to_lobby(Message::Broadcast(
                        Broadcast::MapDeleted(map_name.clone()),
                    )),
                },
                Request::Leave(map_name) | Request::Join(map_name) => self.broadcast_to_others(
                    peer,
                    Message::Broadcast(Broadcast::Users(self.get_users(&map_name).unwrap_or(0))),
                ),
            }
        }
    }

    pub fn handle_request(&self, peer: &mut Peer, packet: RecvPacket) {
        let resp = self.do_request(peer, packet.content.clone());
        self.do_respond(peer, &packet, resp);
    }

    pub async fn handle_websocket(&self, socket: WebSocket, addr: SocketAddr) {
        // insert peer in peers
        let (tx, ws_recv) = socket.split();
        let (ws_send, rx) = unbounded();
        let fut_send = rx.map(Ok).forward(tx);

        let mut peer = Peer::new(addr, ws_send);

        let fut_recv = ws_recv.try_for_each(|msg| {
            match msg {
                ws::Message::Text(text) => {
                    // log::debug!("text message received from {}: {}", addr, text);

                    match serde_json::from_str(&text) {
                        Ok(req) => {
                            self.handle_request(&mut peer, req);
                        }
                        Err(e) => {
                            log::error!("failed to parse message: {} in {}", e, &text);
                        }
                    };
                }
                _ => (),
            }

            futures::future::ok(())
        });

        futures::future::select(fut_send, fut_recv).await;

        if let Some(room) = &peer.room {
            room.remove_peer(&peer);
        }

        self.broadcast_users(&peer);

        // if the peer uploaded a map but did not use it, we want to delete it now.
        let upload_path: PathBuf = format!("uploads/{}", peer.addr).into();
        std::fs::remove_file(&upload_path).ok();

        log::info!("disconnected {}", &addr);
    }
}

fn check_map_path(fname: &str) -> bool {
    // COMBAK: this is too restrictive, but proper sanitization is hard.
    // TODO: add tests
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        let c1 = r"[:alnum:]\(\)\[\]_,\-"; // safe 1st char in word
        let cn = r"[:alnum:]\(\)\[\]_,\-\s\."; // safe non-first char in word
        let max_len = 40; // max file name or dir name
        let word = format!(r"[{}][{}]{{0,{}}}", c1, cn, max_len - 1);
        Regex::new(&format!(r"^({}/)*({})$", word, word)).unwrap()
    });
    re.is_match(fname)
}

fn check_file_name(name: &str) -> bool {
    // this is a very primitive sanitization to prevent path traversal attacks.
    !(name.chars().any(std::path::is_separator) || name.starts_with(".") || name.is_empty())
}

pub fn set_layer_width<T: twmap::TilemapLayer>(
    layer: &mut T,
    width: usize,
) -> Result<(), &'static str> {
    let old_width = layer.tiles().shape().w as isize;
    let diff = width as isize - old_width;

    if width < 2 || width > 10000 {
        return Err("invalid layer dimensions");
    }

    if diff > 0 {
        extend_layer(layer, 0, 0, 0, diff as usize);
    } else if diff < 0 {
        shrink_layer(layer, 0, 0, 0, -diff as usize);
    }

    Ok(())
}

pub fn set_layer_height<T: twmap::TilemapLayer>(
    layer: &mut T,
    height: usize,
) -> Result<(), &'static str> {
    let old_height = layer.tiles().shape().h as isize;
    let diff = height as isize - old_height;

    if height < 2 || height > 10000 {
        return Err("invalid layer dimensions");
    }

    if diff > 0 {
        extend_layer(layer, 0, diff as usize, 0, 0);
    } else if diff < 0 {
        shrink_layer(layer, 0, -diff as usize, 0, 0);
    }

    Ok(())
}

fn is_automapper(path: &Path) -> bool {
    let extensions = &["rules", "rpp", "json"];

    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        if extensions.contains(&ext) {
            true
        } else {
            false
        }
    } else {
        false
    }
}

impl Server {
    pub fn get_maps(&self) -> Vec<String> {
        self.rooms().keys().cloned().collect()
    }

    pub fn get_map(&self, map_name: &str) -> Result<Vec<u8>, Error> {
        let room = self.room(map_name)?;

        let mut buf = Vec::new();
        let mut map = room.map().clone(); // cloned to avoid blocking
        map.save(&mut buf)
            .map_err(|e| Error::ServerError(e.to_string().into()))?;

        Ok(buf)
    }

    pub fn put_map(&self, map_name: &str, file: &[u8]) -> Result<(), Error> {
        if !check_map_path(&map_name) {
            return Err(Error::InvalidMapName);
        }
        if self.room(&map_name).is_ok() {
            return Err(Error::MapNameTaken);
        }

        let path = PathBuf::from(format!("maps/{}", map_name));
        let map_path = PathBuf::from(format!("maps/{}/map.map", map_name));

        std::fs::create_dir_all(&path).map_err(|e| Error::ServerError(e.to_string().into()))?;
        std::fs::write(&map_path, file).map_err(|e| Error::ServerError(e.to_string().into()))?;

        twmap::TwMap::parse_file(&map_path).map_err(|e| {
            std::fs::remove_file(&map_path).ok();
            Error::MapError(e.to_string())
        })?;

        log::debug!("uploaded map '{}'", path.display());

        let new_room = Room::new(path).ok_or(Error::ServerError("map creation failed".into()))?;
        new_room
            .save_config()
            .map_err(|s| Error::ServerError(s.into()))?;
        self.rooms().insert(map_name.to_owned(), Arc::new(new_room));

        Ok(())
    }

    pub fn post_map(&self, map_name: &str, creation: MapCreation) -> Result<(), Error> {
        if !check_map_path(map_name) {
            return Err(Error::InvalidMapName);
        }

        if self.room(map_name).is_ok() {
            return Err(Error::MapNameTaken);
        }

        let path = PathBuf::from(format!("maps/{}", map_name));
        let map_path = PathBuf::from(format!("maps/{}/map.map", map_name));

        let mut map = match creation.method {
            CreationMethod::Clone(clone_name) => {
                let room = self.room(&clone_name)?;
                let map = room.map().clone();
                map
            }
            CreationMethod::Blank { w, h } => {
                let mut map =
                    twmap::TwMap::empty(creation.version.unwrap_or(twmap::Version::DDNet06));
                let mut group = twmap::Group::physics();
                let layer = twmap::GameLayer {
                    tiles: twmap::CompressedData::Loaded(ndarray::Array2::default((
                        w as usize, h as usize,
                    ))),
                };
                group.layers.push(twmap::Layer::Game(layer));
                map.groups.push(group);
                map.check().map_err(|e| Error::MapError(e.to_string()))?;
                map
            }
        };

        std::fs::create_dir_all(&path).map_err(|e| Error::ServerError(e.to_string().into()))?;
        map.save_file(&map_path)
            .map_err(|e| Error::MapError(e.to_string()))?;

        log::debug!("created map '{}'", path.display());

        let mut new_room =
            Room::new(path).ok_or(Error::ServerError("map creation failed".into()))?;

        new_room.config.access = creation.access.unwrap_or(crate::map_cfg::MapAccess::Public);
        new_room
            .save_config()
            .map_err(|e| Error::ServerError(e.into()))?;
        self.rooms().insert(map_name.to_owned(), Arc::new(new_room));

        Ok(())
    }

    pub fn delete_map(&self, map_name: &str) -> Result<(), Error> {
        let room = self.room(map_name)?;

        if room.peers().len() != 0 {
            return Err(Error::RoomNotEmpty);
        }

        self.rooms().remove(map_name);

        let map_path: PathBuf = room.map_path().to_owned().into();
        let config_path: PathBuf = map_path.with_extension("json");

        std::fs::remove_file(&config_path).ok();
        std::fs::remove_file(&map_path).map_err(|e| Error::ServerError(e.to_string().into()))?;

        log::debug!("deleted map '{}'", map_path.display());

        Ok(())
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

    pub fn get_info(&self, map_name: &str) -> Result<twmap::Info, Error> {
        Ok(self.room(map_name)?.map().info.clone())
    }

    pub fn post_info(&self, map_name: &str, part_info: PartialInfo) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();
        apply_partial!(part_info => map.info, author, version, credits, license, settings);
        Ok(())
    }

    pub fn post_config(&self, map_name: &str, part_conf: PartialConfig) -> Result<(), Error> {
        // let room = self.room(map_name)?.clone();
        // apply_partial!(part_conf => room.config, name, access);
        // Ok(())
        Err(Error::ToDo)
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
        let mut map = room.map();

        if map.envelopes.len() == u16::MAX as usize {
            return Err(Error::MaxEnvelopesReached);
        }

        let env = match part_env {
            PartialEnvelope::Position(_) => twmap::Envelope::Position(twmap::Env::default()),
            PartialEnvelope::Color(_) => twmap::Envelope::Color(twmap::Env::default()),
            PartialEnvelope::Sound(_) => twmap::Envelope::Sound(twmap::Env::default()),
        };
        map.envelopes.push(env);

        self.post_envelope(map_name, map.envelopes.len() as u16 - 1, part_env)
    }

    pub fn post_envelope(
        &self,
        map_name: &str,
        env_index: u16,
        part_env: PartialEnvelope,
    ) -> Result<(), Error> {
        let room = self.room(map_name)?;

        // checks
        {
            let map = room.map();

            match &part_env {
                PartialEnvelope::Position(part_env) => {
                    if let Some(points) = &part_env.points {
                        twmap::EnvPoint::check_all(points, &map)
                            .map_err(|e| Error::MapError(e.to_string()))?;
                    }
                }
                PartialEnvelope::Color(part_env) => {
                    if let Some(points) = &part_env.points {
                        twmap::EnvPoint::check_all(points, &map)
                            .map_err(|e| Error::MapError(e.to_string()))?;
                    }
                }
                PartialEnvelope::Sound(part_env) => {
                    if let Some(points) = &part_env.points {
                        twmap::EnvPoint::check_all(points, &map)
                            .map_err(|e| Error::MapError(e.to_string()))?;
                    }
                }
            }
        }

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

    pub fn put_group(&self, map_name: &str, part_group: PartialGroup) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();

        if map.groups.len() == u16::MAX as usize {
            return Err(Error::MaxGroupsReached);
        }

        let mut group = twmap::Group::default();
        apply_partial!(part_group => group, name, offset, parallax, clipping, clip);

        map.groups.push(group);
        Ok(())
    }

    pub fn post_group(
        &self,
        map_name: &str,
        group_index: u16,
        part_group: PartialGroup,
    ) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();
        let group = map
            .groups
            .get_mut(group_index as usize)
            .ok_or(Error::GroupNotFound)?;

        apply_partial!(part_group => group, name, offset, parallax, clipping, clip);

        Ok(())
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

    pub fn put_layer(
        &self,
        map_name: &str,
        group_index: u16,
        part_layer: PartialLayer,
    ) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();

        let layers_count = map.groups.iter().flat_map(|g| g.layers.iter()).count();

        let game_layer_shape = map
            .find_physics_layer::<twmap::GameLayer>()
            .unwrap()
            .tiles
            .shape();
        let game_layer_shape = (game_layer_shape.w, game_layer_shape.h);

        let group = map
            .groups
            .get_mut(group_index as usize)
            .ok_or(Error::GroupNotFound)?;

        if layers_count == u16::MAX as usize {
            return Err(Error::MaxLayersReached);
        }

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
            PartialLayer::Tiles(_) => {
                let layer = twmap::TilesLayer::new(game_layer_shape);
                twmap::Layer::Tiles(layer)
            }
            PartialLayer::Quads(_) => {
                let layer = twmap::QuadsLayer::default();
                twmap::Layer::Quads(layer)
            }
            PartialLayer::Front(_) => create_physics_layer!(Front, FrontLayer),
            PartialLayer::Tele(_) => create_physics_layer!(Tele, TeleLayer),
            PartialLayer::Speedup(_) => create_physics_layer!(Speedup, SpeedupLayer),
            PartialLayer::Switch(_) => create_physics_layer!(Switch, SwitchLayer),
            PartialLayer::Tune(_) => create_physics_layer!(Tune, TuneLayer),
        };

        group.layers.push(layer);

        self.post_layer(
            map_name,
            group_index,
            group.layers.len() as u16 - 1,
            part_layer,
        )
    }

    pub fn post_layer(
        &self,
        map_name: &str,
        group_index: u16,
        layer_index: u16,
        part_layer: PartialLayer,
    ) -> Result<(), Error> {
        let room = self.room(map_name)?;

        // checks
        {
            let map = room.map();
            let layer = map
                .groups
                .get(group_index as usize)
                .ok_or(Error::GroupNotFound)?
                .layers
                .get(layer_index as usize)
                .ok_or(Error::LayerNotFound)?;

            match (layer, &part_layer) {
                (
                    twmap::Layer::Tiles(_),
                    PartialLayer::Tiles(PartialTilesLayer {
                        image: Some(Some(i)),
                        ..
                    }),
                ) => {
                    let image = map.images.get(*i as usize).ok_or(Error::ImageNotFound)?;
                    let tile_dims_ok = image.size().w % 16 == 0 && image.size().h % 16 == 0;
                    if !tile_dims_ok {
                        return Err(Error::InvalidImageDimensions);
                    }
                }
                (
                    twmap::Layer::Tiles(_),
                    PartialLayer::Tiles(PartialTilesLayer {
                        color_env: Some(Some(i)),
                        ..
                    }),
                ) => {
                    let env = map
                        .envelopes
                        .get(*i as usize)
                        .ok_or(Error::EnvelopeNotFound)?;
                    if !matches!(env, twmap::Envelope::Color(_)) {
                        return Err(Error::WrongEnvelopeType);
                    }
                }
                _ => {}
            };
        }

        // edit
        {
            let mut map = room.map();
            let layer = map
                .groups
                .get_mut(group_index as usize)
                .ok_or(Error::GroupNotFound)?
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

            match (layer, part_layer) {
                (twmap::Layer::Game(layer), PartialLayer::Game(part_layer)) => {
                    apply_dimensions!(part_layer => layer);
                }
                (twmap::Layer::Tiles(layer), PartialLayer::Tiles(part_layer)) => {
                    apply_dimensions!(part_layer => layer);
                    apply_partial!(part_layer => layer, name, detail, color, color_env, color_env_offset, image, automapper_config);
                }
                (twmap::Layer::Quads(layer), PartialLayer::Quads(part_layer)) => {
                    apply_partial!(part_layer => layer, name, detail, image);
                }
                (twmap::Layer::Front(layer), PartialLayer::Front(part_layer)) => {
                    apply_dimensions!(part_layer => layer);
                }
                (twmap::Layer::Tele(layer), PartialLayer::Tele(part_layer)) => {
                    apply_dimensions!(part_layer => layer);
                }
                (twmap::Layer::Speedup(layer), PartialLayer::Speedup(part_layer)) => {
                    apply_dimensions!(part_layer => layer);
                }
                (twmap::Layer::Switch(layer), PartialLayer::Switch(part_layer)) => {
                    apply_dimensions!(part_layer => layer);
                }
                (twmap::Layer::Tune(layer), PartialLayer::Tune(part_layer)) => {
                    apply_dimensions!(part_layer => layer);
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

        map.groups.remove(group_index as usize);

        Ok(())
    }

    pub fn get_automappers(&self, map_name: &str) -> Result<Vec<String>, Error> {
        let path = self.room(map_name)?.path().to_owned();

        Ok(std::fs::read_dir(path)
            .map_err(|e| Error::ServerError(e.to_string().into()))?
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                let path = e.path();
                if is_automapper(&path) {
                    Some(e.file_name().to_string_lossy().into_owned())
                } else {
                    None
                }
            })
            .collect())
    }

    pub fn get_automapper(&self, map_name: &str, am: &str) -> Result<String, Error> {
        if !check_file_name(am) {
            return Err(Error::InvalidFileName);
        }

        let mut path = self.room(map_name)?.path().to_owned();
        path.push(am);

        if !is_automapper(&path) {
            return Err(Error::AutomapperNotFound);
        }

        let file = std::fs::read_to_string(&path).map_err(|_| Error::AutomapperNotFound)?;

        Ok(file)
    }

    pub fn put_automapper(&self, map_name: &str, am: &str, file: &str) -> Result<(), Error> {
        if !check_file_name(am) {
            return Err(Error::InvalidFileName);
        }

        let mut path = self.room(map_name)?.path().to_owned();
        path.push(am);

        if !is_automapper(&path) {
            return Err(Error::InvalidFileName);
        }

        std::fs::write(path, file).map_err(|e| Error::ServerError(e.to_string().into()))?;

        Ok(())
    }

    pub fn delete_automapper(&self, map_name: &str, am: &str) -> Result<(), Error> {
        if !check_file_name(am) {
            return Err(Error::InvalidFileName);
        }

        let mut path = self.room(map_name)?.path().to_owned();
        path.push(am);

        if !is_automapper(&path) {
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
            let mut path = room.path().to_owned();
            path.push(format!("{image_name}.rules"));
            let file = std::fs::read_to_string(path)
                .map_err(|e| Error::ServerError(e.to_string().into()))?;
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

    pub fn post_tiles(
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

    pub fn patch_envelope(&self, map_name: &str, src: u16, tgt: u16) -> Result<(), Error> {
        let room = self.room(map_name)?;
        let mut map = room.map();

        if src as usize > map.envelopes.len() {
            return Err(Error::EnvelopeNotFound);
        }

        if tgt as usize > map.envelopes.len() {
            return Err(Error::EnvelopeNotFound);
        }

        let env = map.envelopes.remove(src as usize);
        map.envelopes.insert(tgt as usize, env);

        Ok(())
    }

    pub fn patch_group(&self, map_name: &str, src: u16, tgt: u16) -> Result<(), Error> {
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

    pub fn patch_layer(
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
                return Err(Error::ChangePhysicsLayerGroup);
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

    pub fn get_users(&self, map_name: &str) -> Result<usize, Error> {
        let room = self.room(map_name)?;
        Ok(room.peer_count())
    }

    pub fn get_cursors(&self, map_name: &str) -> Result<HashMap<String, Cursor>, Error> {
        let room = self.room(map_name)?;

        let cursors = room
            .peers()
            .iter()
            .filter_map(|(_, v)| {
                if let Some(cursor) = &v.cursor {
                    Some((v.id.to_string(), cursor.clone()))
                } else {
                    None
                }
            })
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
