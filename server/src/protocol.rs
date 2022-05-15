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
#[serde(tag = "type", content = "content", rename_all = "lowercase")]
pub enum RoomRequest {
    Change(Change),
    Map,
    Save(String),
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
}

#[derive(Deserialize)]
#[serde(tag = "type", content = "content", rename_all = "lowercase")]
pub enum GlobalResponse {
    // Join(String), // join a room
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum Request {
    Global(GlobalRequest),
    Room(RoomRequest),
}
