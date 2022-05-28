use serde::{Deserialize, Serialize};
use twmap::Color;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OneGroupChange {
    Order(u32),
    OffX(i32),
    OffY(i32),
    ParaX(i32),
    ParaY(i32),
    Name(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GroupChange {
    pub group: u32,
    pub order: Option<u32>,
    #[serde(flatten)]
    pub change: OneGroupChange,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum LayerOrderChange {
    Group(u32),
    Layer(u32),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OneLayerChange {
    Order(LayerOrderChange),
    Name(String),
    Color(Color),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LayerChange {
    pub group: u32,
    pub layer: u32,
    #[serde(flatten)]
    pub change: OneLayerChange,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TileChange {
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
    GroupChange(GroupChange),
    LayerChange(LayerChange),
    TileChange(TileChange),
    Map,
    Save,
}

#[derive(Serialize)]
#[serde(tag = "type", content = "content", rename_all = "lowercase")]
pub enum RoomResponse {
    GroupChange(GroupChange),
    LayerChange(LayerChange),
    TileChange(TileChange),
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
