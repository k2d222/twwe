use std::{
    collections::HashMap,
    fs, io,
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard},
    time::SystemTime,
};

use image::ImageFormat;

use axum::{
    extract::{
        multipart::MultipartError,
        ws::{Message, WebSocket},
        ConnectInfo, DefaultBodyLimit, Multipart, Path, State, WebSocketUpgrade,
    },
    headers,
    http::{header, Method, StatusCode},
    response::{ErrorResponse, IntoResponse},
    routing::get,
    Json, Router, TypedHeader,
};
use axum_server::tls_rustls::RustlsConfig;
use clap::Parser;
use glob::glob;
use map_cfg::MapAccess;
use regex::Regex;
use tower_http::services::ServeDir;
use tower_http::{cors, services::ServeFile};

use futures::{
    channel::mpsc::{unbounded, UnboundedSender},
    future, StreamExt, TryStreamExt,
};

use twmap::{automapper::Automapper, EmbeddedImage, Image, TwMap};

mod room;
use room::Room;

mod map_cfg;
mod protocol;
use protocol::*;
use twmap_map_checks::CheckData;

mod twmap_map_checks;
mod twmap_map_edit;

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
        peer.tx.unbounded_send(Message::Text(str)).ok(); // this is ok to fail (peer logout)

        // log::debug!("text message sent to {}: {}", peer.addr, str);
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

        for p in room.peers().values() {
            p.tx.unbounded_send(msg.to_owned()).ok();
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
            for (addr, p) in room.peers().iter() {
                if !addr.eq(&peer.addr) {
                    p.tx.unbounded_send(msg.to_owned()).ok();
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
            use ResponseContent::*;
            match content {
                CreateMap(_) => (),
                CloneMap(_) => (),
                JoinMap(_) => self.broadcast_users(peer),
                LeaveMap => self.broadcast_users(peer),
                SaveMap(_) => (),
                EditMap(_) => self.broadcast_to_others(peer, content),
                DeleteMap(_) => (),
                RenameMap(content) => {
                    self.room(&content.new_name).map(|room| {
                        self.broadcast_to_room(&room, ResponseContent::RenameMap(content))
                    });
                }
                CreateGroup(_) => self.broadcast_to_others(peer, content),
                EditGroup(_) => self.broadcast_to_others(peer, content),
                ReorderGroup(_) => self.broadcast_to_others(peer, content),
                DeleteGroup(_) => self.broadcast_to_others(peer, content),
                CreateLayer(_) => self.broadcast_to_others(peer, content),
                EditLayer(_) => self.broadcast_to_others(peer, content),
                ReorderLayer(_) => self.broadcast_to_others(peer, content),
                DeleteLayer(_) => self.broadcast_to_others(peer, content),
                EditTile(_) => self.broadcast_to_others(peer, content),
                EditTiles(_) => self.broadcast_to_others(peer, content),
                SendLayer(_) => (),
                CreateQuad(_) => self.broadcast_to_others(peer, content),
                EditQuad(_) => self.broadcast_to_others(peer, content),
                DeleteQuad(_) => self.broadcast_to_others(peer, content),
                CreateEnvelope(_) => self.broadcast_to_others(peer, content),
                EditEnvelope(_) => self.broadcast_to_others(peer, content),
                DeleteEnvelope(_) => self.broadcast_to_others(peer, content),
                ListUsers(_) => (),
                ListMaps(_) => (),
                CreateImage(_) => self.broadcast_to_others(peer, content),
                ImageInfo(_) => (),
                DeleteImage(_) => self.broadcast_to_others(peer, content),
                Error(_) => (),
                ListAutomappers(_) => (),
                SendAutomapper(_) => (),
                DeleteAutomapper(_) => self.broadcast_to_others(peer, content),
                UploadAutomapper(_) => self.broadcast_to_others(peer, content),
                ApplyAutomapper(_) => self.broadcast_to_others(peer, content),
                Cursors(_) => (),
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

    fn handle_clone_map(&self, clone_map: CreateMapClone) -> Res {
        if !self.check_map_path(&clone_map.config.name) {
            return Err("invalid map name");
        }
        if self.room(&clone_map.config.name).is_some() {
            return Err("name already taken");
        }

        let path = PathBuf::from(format!("maps/{}", clone_map.config.name));
        let map_path = PathBuf::from(format!("maps/{}/map.map", clone_map.config.name));

        let room = self
            .room(&clone_map.clone)
            .ok_or("cannot clone non-existing map")?;

        fs::create_dir_all(&path).map_err(server_error)?;

        // clone the map to release the lock as soon as possible
        room.map
            .get()
            .clone()
            .save_file(&map_path)
            .map_err(server_error)?;

        log::debug!(
            "cloned map '{}' to '{}'",
            room.map.path.display(),
            path.display()
        );

        let mut new_room = Room::new(path).ok_or("map creation failed")?;
        new_room.config.access = clone_map.config.access.clone();
        new_room.save_config()?;

        let mut rooms = self.rooms.lock().unwrap();
        rooms.insert(clone_map.config.name.to_owned(), Arc::new(new_room));

        Ok(ResponseContent::CloneMap(clone_map))
    }

    fn handle_create_map(&self, create_map: CreateMapBlank) -> Res {
        if !self.check_map_path(&create_map.config.name) {
            return Err("invalid map name");
        }
        if self.room(&create_map.config.name).is_some() {
            return Err("name already taken");
        }

        let path = PathBuf::from(format!("maps/{}", create_map.config.name));
        let map_path = PathBuf::from(format!("maps/{}/map.map", create_map.config.name));

        let mut map = TwMap::empty(create_map.version.unwrap_or(twmap::Version::DDNet06));
        let mut group = twmap::Group::physics();
        let layer = twmap::GameLayer {
            tiles: twmap::CompressedData::Loaded(ndarray::Array2::default((
                create_map.width as usize,
                create_map.height as usize,
            ))),
        };
        group.layers.push(twmap::Layer::Game(layer));
        map.groups.push(group);
        map.check().map_err(server_error)?;

        fs::create_dir_all(&path).map_err(server_error)?;
        map.save_file(&map_path).map_err(server_error)?;

        log::debug!("created map '{}'", path.display());

        let mut new_room = Room::new(path).ok_or("map creation failed")?;

        new_room.config.access = create_map.config.access.clone();
        new_room.save_config()?;
        let mut rooms = self.rooms.lock().unwrap();
        rooms.insert(create_map.config.name.to_owned(), Arc::new(new_room));

        Ok(ResponseContent::CreateMap(create_map))
    }

    fn handle_upload_map(
        &self,
        upload_map: CreateMapUpload,
        file: &[u8],
    ) -> Result<(), &'static str> {
        if !self.check_map_path(&upload_map.config.name) {
            return Err("invalid map name");
        }
        if self.room(&upload_map.config.name).is_some() {
            return Err("name already taken");
        }

        let path = PathBuf::from(format!("maps/{}", upload_map.config.name));
        let map_path = PathBuf::from(format!("maps/{}/map.map", upload_map.config.name));

        fs::create_dir_all(&path).map_err(server_error)?;
        std::fs::write(&map_path, file).map_err(|_| "failed to write file")?;

        TwMap::parse_file(&map_path).map_err(|_| {
            std::fs::remove_file(&map_path).ok();
            "not a valid map file"
        })?;

        log::debug!("uploaded map '{}'", path.display());

        let mut new_room = Room::new(path).ok_or("map creation failed")?;
        new_room.config.access = upload_map.config.access.clone();
        new_room.save_config()?;
        {
            let mut rooms = self.rooms.lock().unwrap();
            rooms.insert(upload_map.config.name.to_owned(), Arc::new(new_room));
        }

        Ok(())
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

    fn handle_leave_map(&self, peer: &Peer) -> Res {
        if let Some(room) = &peer.room {
            room.remove_peer(peer);
            self.broadcast_users(peer);
            Ok(ResponseContent::LeaveMap)
        } else {
            Err("user is not connected to a map")
        }
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
                    let map_path: PathBuf = room.map.path.to_owned().into();
                    let config_path: PathBuf = map_path.with_extension("json");
                    std::fs::remove_file(&config_path).ok();
                    std::fs::remove_file(&map_path).map_err(server_error)?;
                    Ok(ResponseContent::DeleteMap(delete_map))
                }
            }
            None => Err("no map found with the given name"),
        }
    }

    fn handle_rename_map(&self, _rename_map: RenameMap) -> Res {
        Err("TODO: renaming map is not yet implemented")
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

    fn handle_edit_tiles(&self, peer: &mut Peer, edit_tiles: EditTiles) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.set_tiles(&edit_tiles)?;
        Ok(ResponseContent::EditTiles(edit_tiles))
    }

    fn handle_send_layer(&self, peer: &mut Peer, send_layer: SendLayer) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        let layer = room.layer_data(send_layer.group as usize, send_layer.layer as usize)?;
        Ok(ResponseContent::SendLayer(layer))
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

    fn handle_create_envelope(&self, peer: &mut Peer, create_envelope: CreateEnvelope) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.create_envelope(&create_envelope)?;
        Ok(ResponseContent::CreateEnvelope(create_envelope))
    }

    fn handle_edit_envelope(&self, peer: &mut Peer, edit_envelope: EditEnvelope) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.edit_envelope(&edit_envelope)?;
        Ok(ResponseContent::EditEnvelope(edit_envelope))
    }

    fn handle_delete_envelope(&self, peer: &mut Peer, delete_envelope: DeleteEnvelope) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.remove_envelope(delete_envelope.index)?;
        Ok(ResponseContent::DeleteEnvelope(delete_envelope))
    }

    fn handle_list_maps(&self) -> Res {
        let maps: Vec<MapInfo> = self
            .rooms()
            .iter()
            .filter(|(_, map)| map.config.access == MapAccess::Public)
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

    fn handle_image_info(&self, peer: &Peer, image_index: u16) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;

        let image_info = room.image_info(image_index)?;

        Ok(ResponseContent::ImageInfo(image_info))
    }

    fn handle_delete_image(&self, peer: &Peer, delete_image: DeleteImage) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;

        room.remove_image(delete_image.index)?;
        Ok(ResponseContent::DeleteImage(delete_image))
    }

    fn handle_cursor(&self, peer: &Peer, cursor: Cursor) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;

        room.peers()
            .get_mut(&peer.addr)
            .ok_or("server error")?
            .cursor = Some(cursor);

        let cursors = room
            .peers()
            .iter()
            .filter_map(|(k, v)| {
                if k != &peer.addr {
                    if let Some(ref cursor) = v.cursor {
                        return Some((v.id.to_string(), cursor.clone()));
                    }
                }
                None
            })
            .collect();

        Ok(ResponseContent::Cursors(cursors))
    }

    // TODO: refactor this shit i'm too tired rn
    fn handle_list_automappers(&self, peer: &Peer) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;

        let path = room.path().to_str().ok_or("internal server error")?;

        let mut automappers = HashMap::new();

        let rule_files: Vec<_> = glob(&format!("{}/*.rules", path))
            .map(|paths| paths.into_iter().filter_map(|p| p.ok()).collect())
            .unwrap_or_default();

        automappers.extend(rule_files.into_iter().filter_map(
            |path| -> Option<(String, AutomapperDetail)> {
                let file = path.file_name()?.to_string_lossy().into_owned();
                let image = path.file_stem()?.to_string_lossy().into_owned();
                let file_contents = fs::read_to_string(path).ok()?;
                let automapper = Automapper::parse(image.clone(), &file_contents);
                Some((
                    file.to_owned(),
                    AutomapperDetail {
                        file,
                        kind: AutomapperKind::DDNet,
                        image,
                        configs: match automapper {
                            Ok(am) => am.configs.into_iter().map(|c| c.name).collect(),
                            Err(_) => vec![],
                        },
                    },
                ))
            },
        ));

        let rule_files: Vec<_> = glob(&format!("{}/*.rpp", path))
            .map(|paths| paths.into_iter().filter_map(|p| p.ok()).collect())
            .unwrap_or_default();

        automappers.extend(rule_files.into_iter().filter_map(
            |path| -> Option<(String, AutomapperDetail)> {
                let file = path.file_name()?.to_string_lossy().into_owned();
                let image = path.file_stem()?.to_string_lossy().into_owned();
                Some((
                    file.to_owned(),
                    AutomapperDetail {
                        file,
                        kind: AutomapperKind::Rpp,
                        image,
                        configs: vec![],
                    },
                ))
            },
        ));

        let rule_files: Vec<_> = glob(&format!("{}/*.json", path))
            .map(|paths| paths.into_iter().filter_map(|p| p.ok()).collect())
            .unwrap_or_default();

        automappers.extend(rule_files.into_iter().filter_map(
            |path| -> Option<(String, AutomapperDetail)> {
                let file = path.file_name()?.to_string_lossy().into_owned();
                let image = path.file_stem()?.to_string_lossy().into_owned();
                Some((
                    file.to_owned(),
                    AutomapperDetail {
                        file,
                        kind: AutomapperKind::Teeworlds,
                        image,
                        configs: vec![],
                    },
                ))
            },
        ));

        Ok(ResponseContent::ListAutomappers(automappers))
    }

    fn check_image_name(&self, name: &str) -> bool {
        // this is a very primitive sanitization to prevent path traversal attacks.
        !(name.chars().any(std::path::is_separator) || name.starts_with(".") || name.is_empty())
    }

    fn handle_send_automapper(&self, peer: &Peer, send_automapper: String) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;

        if !self.check_image_name(&send_automapper) {
            return Err("invalid automapper name");
        }

        let mut path = room.path().to_owned();
        path.push(send_automapper);

        let rule_file = fs::read_to_string(path).map_err(|_| "automapper file not found")?;

        Ok(ResponseContent::SendAutomapper(rule_file))
    }

    fn handle_delete_automapper(&self, peer: &Peer, delete_automapper: String) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;

        if !self.check_image_name(&delete_automapper) {
            return Err("invalid image name");
        }

        let mut path = room.path().to_owned();
        path.push(&delete_automapper);

        fs::remove_file(path).map_err(|_| "automapper file not found")?;

        Ok(ResponseContent::DeleteAutomapper(delete_automapper))
    }

    fn handle_upload_automapper(
        &self,
        peer: &mut Peer,
        upload_automapper: UploadAutomapper,
    ) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;

        if !self.check_image_name(&upload_automapper.image) {
            return Err("invalid image name");
        }

        let ext = match upload_automapper.kind {
            AutomapperKind::DDNet => "rules",
            AutomapperKind::Rpp => "rpp",
            AutomapperKind::Teeworlds => "json",
        };

        let file = format!("{}.{ext}", upload_automapper.image);
        let mut path = room.path().to_owned();
        path.push(&file);

        let configs = if upload_automapper.kind == AutomapperKind::DDNet {
            Automapper::parse(upload_automapper.image.clone(), &upload_automapper.content)
                .map(|am| am.configs.iter().map(|c| c.name.to_owned()).collect())
                .unwrap_or_default()
        } else {
            vec![]
        };

        fs::write(path, upload_automapper.content).map_err(server_error)?;

        Ok(ResponseContent::UploadAutomapper(AutomapperDetail {
            image: upload_automapper.image.to_owned(),
            configs,
            kind: upload_automapper.kind,
            file,
        }))
    }

    fn handle_apply_automapper(&self, peer: &mut Peer, apply_automapper: ApplyAutomapper) -> Res {
        let room = peer.room.clone().ok_or("user is not connected to a map")?;
        room.apply_automapper(&apply_automapper)?;
        Ok(ResponseContent::ApplyAutomapper(apply_automapper))
    }

    fn handle_request(&self, peer: &mut Peer, req: Request) {
        use RequestContent::*;
        let res = match req.content {
            CreateMap(content) => self.handle_create_map(content),
            CloneMap(content) => self.handle_clone_map(content),
            EditMap(content) => self.handle_edit_map(peer, content),
            JoinMap(content) => self.handle_join_map(peer, content),
            LeaveMap => self.handle_leave_map(peer),
            SaveMap(content) => self.handle_save_map(peer, content),
            DeleteMap(content) => self.handle_delete_map(peer, content),
            RenameMap(content) => self.handle_rename_map(content),
            CreateGroup(content) => self.handle_create_group(peer, content),
            EditGroup(content) => self.handle_edit_group(peer, content),
            ReorderGroup(content) => self.handle_reorder_group(peer, content),
            DeleteGroup(content) => self.handle_delete_group(peer, content),
            CreateLayer(content) => self.handle_create_layer(peer, content),
            EditLayer(content) => self.handle_edit_layer(peer, content),
            ReorderLayer(content) => self.handle_reorder_layer(peer, content),
            DeleteLayer(content) => self.handle_delete_layer(peer, content),
            EditTile(content) => self.handle_edit_tile(peer, content),
            EditTiles(content) => self.handle_edit_tiles(peer, content),
            SendLayer(content) => self.handle_send_layer(peer, content),
            CreateQuad(content) => self.handle_create_quad(peer, content),
            EditQuad(content) => self.handle_edit_quad(peer, content),
            DeleteQuad(content) => self.handle_delete_quad(peer, content),
            CreateEnvelope(content) => self.handle_create_envelope(peer, content),
            EditEnvelope(content) => self.handle_edit_envelope(peer, content),
            DeleteEnvelope(content) => self.handle_delete_envelope(peer, content),
            ListUsers => self.handle_list_users(peer),
            ListMaps => self.handle_list_maps(),
            CreateImage(content) => self.handle_create_image(peer, content),
            ImageInfo(content) => self.handle_image_info(peer, content),
            DeleteImage(content) => self.handle_delete_image(peer, content),
            Cursors(content) => self.handle_cursor(peer, content),
            ListAutomappers => self.handle_list_automappers(peer),
            SendAutomapper(content) => self.handle_send_automapper(peer, content),
            DeleteAutomapper(content) => self.handle_delete_automapper(peer, content),
            UploadAutomapper(content) => self.handle_upload_automapper(peer, content),
            ApplyAutomapper(content) => self.handle_apply_automapper(peer, content),
        };
        self.respond_and_broadcast(peer, req.id, res);
    }

    async fn handle_websocket(&self, socket: WebSocket, addr: SocketAddr) {
        // insert peer in peers
        let (tx, ws_recv) = socket.split();
        let (ws_send, rx) = unbounded();
        let fut_send = rx.map(Ok).forward(tx);

        let mut peer = Peer::new(addr, ws_send);

        let fut_recv = ws_recv.try_for_each(|msg| {
            match msg {
                Message::Text(text) => {
                    // log::debug!("text message received from {}: {}", addr, text);

                    match serde_json::from_str(&text) {
                        Ok(req) => {
                            self.handle_request(&mut peer, req);
                        }
                        Err(e) => {
                            log::error!("failed to parse message: {}", e);
                        }
                    };
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

    // TODO: see if we need this
    // fn recover_after_panic(&self, addr: SocketAddr) {
    //     let rooms = self.rooms();
    //     let room = rooms
    //         .iter()
    //         .find(|(_, room)| room.peers().contains_key(&addr));
    //     match room {
    //         Some((_, room)) => {
    //             room.remove_closed_peers();
    //             let map = room.map.get_opt();
    //             if let Some(map) = &*map {
    //                 let response = if let Err(e) = map.check() {
    //                     log::error!("map error is: {}", e);
    //                     Error::MapError(e.to_string())
    //                 } else {
    //                     Error::ServerError
    //                 };
    //                 self.broadcast_to_room(room, ResponseContent::Error(response));
    //             }
    //         }
    //         None => {
    //             log::error!("could not find a room containing the peer that caused the panic");
    //         }
    //     }
    // }
}

fn create_server() -> Server {
    let server = Server::new();
    {
        let mut server_rooms = server.rooms();
        let rooms = glob("maps/*/map.map")
            .expect("no map found in maps directory")
            .into_iter()
            .filter_map(|e| e.ok())
            .map(|e| {
                let dir = e.parent().unwrap().to_owned(); // map must be in a sub-directory
                Arc::new(Room::new(dir).expect("failed to load one of the map dirs"))
            });
        for r in rooms {
            server_rooms.insert(r.name().to_owned(), r);
        }
    }
    log::info!("found {} maps.", server.rooms().len());
    server
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

    /// Directory of static files to serve
    #[clap(name = "static", value_parser, short, long)]
    static_dir: Option<PathBuf>,
}

async fn route_websocket(
    State(server): State<Arc<Server>>,
    ws: WebSocketUpgrade,
    user_agent: Option<TypedHeader<headers::UserAgent>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> impl IntoResponse {
    let user_agent = if let Some(TypedHeader(user_agent)) = user_agent {
        user_agent.to_string()
    } else {
        String::from("Unknown browser")
    };
    log::info!("`{user_agent}` at {addr} connected.");

    ws.on_upgrade(move |socket| async move { server.handle_websocket(socket, addr).await })
}

async fn route_list_maps(State(server): State<Arc<Server>>) -> impl IntoResponse {
    let maps: Vec<MapInfo> = server
        .rooms()
        .iter()
        .filter(|(_, map)| map.config.access == MapAccess::Public)
        .map(|(name, map)| MapInfo {
            name: name.to_owned(),
            users: map.peers().len() as u32,
        })
        .collect();

    Json(maps)
}

async fn route_download_map(
    State(server): State<Arc<Server>>,
    Path(map_name): Path<String>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let room = server
        .room(&map_name)
        .ok_or((StatusCode::NOT_FOUND, "map not found"))?;

    let headers = [(header::CONTENT_TYPE, "application/octet-stream")];

    let buf = {
        let mut buf = Vec::new();
        // TODO: this is blocking for the server
        room.map
            .get()
            .save(&mut buf)
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "failed to save map"))?;
        buf
    };
    Ok((headers, buf))
}

async fn route_delete_map(
    State(server): State<Arc<Server>>,
    Path(map_name): Path<String>,
) -> impl IntoResponse {
    match server.room(&map_name) {
        Some(room) => {
            if room.peers().len() != 0 {
                Err((StatusCode::BAD_REQUEST, "map contains users"))
            } else {
                server.rooms().remove(&map_name);
                let map_path: PathBuf = room.map.path.to_owned().into();
                let config_path: PathBuf = map_path.with_extension("json");
                std::fs::remove_file(&config_path).ok();
                std::fs::remove_file(&map_path)
                    .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "internal server error"))?;
                Ok(())
            }
        }
        None => Err((StatusCode::BAD_REQUEST, "no map found with the given name")),
    }
}

async fn route_get_image(
    State(server): State<Arc<Server>>,
    Path((map_name, image_index)): Path<(String, u16)>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let room = server
        .room(&map_name)
        .ok_or((StatusCode::NOT_FOUND, "map not found"))?;

    let buf = {
        let mut buf = Vec::new();
        let map = room.map.get();

        let image = map
            .images
            .get(image_index as usize)
            .ok_or((StatusCode::NOT_FOUND, "invalid image index"))?;

        match image {
            twmap::Image::External(_) => Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "cannot send external images",
            ))?,
            twmap::Image::Embedded(image) => image
                .image
                .unwrap_ref()
                .write_to(&mut io::Cursor::new(&mut buf), ImageFormat::Png)
                .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "internal server error"))?,
        };

        buf
    };

    let headers = [(header::CONTENT_TYPE, "application/octet-stream")];

    Ok((headers, buf))
}

fn multipart_error(e: MultipartError) -> ErrorResponse {
    (StatusCode::BAD_REQUEST, e.to_string()).into()
}

fn json_error(e: serde_json::Error) -> ErrorResponse {
    (StatusCode::BAD_REQUEST, e.to_string()).into()
}

async fn route_create_map(
    State(server): State<Arc<Server>>,
    mut form: Multipart,
) -> Result<impl IntoResponse, ErrorResponse> {
    // extract the required fields from the multipart/formdata request.
    // first field must be json, second is the actual file.
    let f1 = form
        .next_field()
        .await
        .map_err(multipart_error)?
        .ok_or((StatusCode::BAD_REQUEST, "missing first field"))?
        .text()
        .await
        .map_err(|_| (StatusCode::BAD_REQUEST, "first field must be text"))?;

    let create_map = serde_json::from_str::<CreateMap>(&f1).map_err(json_error)?;

    match create_map {
        CreateMap::Blank(blank) => server
            .handle_create_map(blank)
            .map(|_| ())
            .map_err(|str| (StatusCode::BAD_REQUEST, str).into()),
        CreateMap::Clone(clone) => server
            .handle_clone_map(clone)
            .map(|_| ())
            .map_err(|str| (StatusCode::BAD_REQUEST, str).into()),
        CreateMap::Upload(upload) => {
            let file = form
                .next_field()
                .await
                .map_err(multipart_error)?
                .ok_or((StatusCode::BAD_REQUEST, "missing second field"))?
                .bytes()
                .await
                .map_err(multipart_error)?;
            server
                .handle_upload_map(upload, &file)
                .map_err(|str| (StatusCode::BAD_REQUEST, str).into())
        }
    }
}

async fn route_list_images(
    State(server): State<Arc<Server>>,
    Path(map_name): Path<String>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let room = server
        .room(&map_name)
        .ok_or((StatusCode::NOT_FOUND, "map not found"))?;

    let images: Vec<String> = room
        .map
        .get()
        .images
        .iter()
        .map(|img| img.name().to_owned())
        .collect();

    Ok(Json(images))
}

async fn route_create_image(
    State(server): State<Arc<Server>>,
    Path(map_name): Path<String>,
    mut form: Multipart,
) -> Result<impl IntoResponse, ErrorResponse> {
    // extract the required fields from the multipart/formdata request.
    // first field must be json, second is the actual file.
    let f1 = form
        .next_field()
        .await
        .map_err(multipart_error)?
        .ok_or((StatusCode::BAD_REQUEST, "missing first field"))?
        .text()
        .await
        .map_err(multipart_error)?;
    let f2 = form
        .next_field()
        .await
        .map_err(multipart_error)?
        .ok_or((StatusCode::BAD_REQUEST, "missing second field"))?;

    let config = serde_json::from_str::<ImageConfig>(&f1).map_err(json_error)?;
    let file = f2.bytes().await.map_err(multipart_error)?;

    let room = server
        .room(&map_name)
        .ok_or((StatusCode::NOT_FOUND, "map not found"))?;

    let mut map = room.map.get();

    if config.index as usize != map.images.len() {
        return Err((StatusCode::BAD_REQUEST, "invalid image index").into());
    }

    if map.images.len() == u16::MAX as usize {
        return Err((StatusCode::BAD_REQUEST, "max number of images reached").into());
    }

    let image = EmbeddedImage::from_reader(&config.name, io::Cursor::new(file))
        .map_err(|_| "failed to load image")?;

    // TODO: is this necessary, or does twmap handle this?
    image
        .image
        .check_data()
        .map_err(|_| (StatusCode::BAD_REQUEST, "invalid image data"))?;

    map.images.push(Image::Embedded(image));

    server.broadcast_to_room(
        &room,
        ResponseContent::CreateImage(CreateImage {
            name: config.name,
            index: config.index,
            external: false,
        }),
    );

    Ok(())
}

#[tokio::main]
async fn run_server(args: Cli) {
    let state = Arc::new(create_server());

    let addr: SocketAddr = args.addr.parse().expect("not a valid server address");
    log::info!("Listening on: {}", addr);

    let cors = cors::CorsLayer::new()
        .allow_methods(vec![Method::GET, Method::POST, Method::DELETE])
        .allow_origin(cors::Any)
        .allow_credentials(false)
        .allow_headers(cors::Any);

    // build the application with routes
    let mut app: Router<()> = Router::new()
        .route("/ws", get(route_websocket))
        .route("/maps", get(route_list_maps).post(route_create_map))
        .route(
            "/maps/:map_name",
            get(route_download_map).delete(route_delete_map),
        )
        .route(
            "/maps/:map_name/images",
            get(route_list_images).post(route_create_image),
        )
        .route("/maps/:map_name/images/:image_index", get(route_get_image))
        .layer(DefaultBodyLimit::max(2 * 1024 * 1024)) // 2 MiB
        .layer(cors)
        .with_state(state);

    // optional endpoint to serve static files
    if let Some(dir) = args.static_dir {
        let mut index = dir.clone();
        index.push("index.html");
        app = app
            .nest_service("/", ServeDir::new(dir))
            .route_service("/edit/*_", ServeFile::new(index)); // index.html handles edit routes with svelte-router.
    }

    // run the server (tls or unencrypted)
    match (args.cert, args.key) {
        (Some(cert), Some(key)) => {
            let tls_config = RustlsConfig::from_pem_file(cert, key).await.unwrap();

            axum_server::bind_rustls(addr, tls_config)
                .serve(app.into_make_service_with_connect_info::<SocketAddr>())
                .await
                .unwrap();
        }
        _ => {
            axum_server::bind(addr)
                .serve(app.into_make_service_with_connect_info::<SocketAddr>())
                .await
                .unwrap();
        }
    }
}

fn main() {
    std::fs::remove_dir_all("uploads").ok();
    std::fs::create_dir("uploads").ok();

    pretty_env_logger::init_timed();

    let args = Cli::parse();

    run_server(args);
}
