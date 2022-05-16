use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Change {
    pub group: u32,
    pub layer: u32,
    pub x: u32,
    pub y: u32,
    pub id: u8,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Users {
    pub count: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InfoRequest {
    // Room(String), // info on a specific room // TODO
    Maps, // list of all available maps
}

#[derive(Serialize)]
pub struct MapInfo {
    pub name: String,
    pub users: u32,
}

#[derive(Deserialize)]
#[serde(tag = "type", content = "content", rename_all = "lowercase")]
pub enum RoomRequest {
    Change(Change),
    Map,
    Save,
}

#[derive(Serialize)]
#[serde(tag = "type", content = "content", rename_all = "lowercase")]
pub enum RoomResponse {
    Change(Change),
    Users(Users),
    // ... Plus Map, which is not json but binary
}

#[derive(Deserialize)]
#[serde(tag = "type", content = "content", rename_all = "lowercase")]
pub enum GlobalRequest {
    Join(String), // join a room
    Maps,
}

#[derive(Serialize)]
#[serde(tag = "type", content = "content", rename_all = "lowercase")]
pub enum GlobalResponse {
    Maps(Vec<MapInfo>),
    Join(bool),
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum Request {
    Global(GlobalRequest),
    Room(RoomRequest),
}
