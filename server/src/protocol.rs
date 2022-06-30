use serde::{Deserialize, Serialize};
use twmap::{Color, InvalidLayerKind, LayerKind};

// Some documentation about the communication between clients and the server:
// ----------
// a request is a message from a client to the server
// a response is a message from a server to the client
// a query is a pair of corresponding request and response
// ----------
// Some client requests (e.g. tile change) are sent to the server and the server
// will always broadcast that message to all clients, including the sender.
// This guarantees synchronization between clients, because the server sends
// message to clients in the order it received it. (and websocket preserves packet order)
// Downside is, the server can never refuse a request from a client. We assume the client
// always makes valid requests.
//
// Other requests, like editing layers / groups can lead to desync between the
// clients, hence cannot be handled that way. They require a forward-and-back
// communication with the server to see if it agrees with the transaction.
//
// For those requests, the client has to wait for the server which leads to poor ux.
// This could be fixed in the future by implementing a history and versionning
// system similar to how databases handle concurrent modifications.

// MAPS

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBlankParams {
    pub version: Option<twmap::Version>,
    pub width: u32,
    pub height: u32,
    pub default_layers: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCloneParams {
    pub clone: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CreateParams {
    Blank(CreateBlankParams),
    Clone(CreateCloneParams),
    Upload {},
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateMap {
    pub name: String,
    #[serde(flatten)]
    pub params: CreateParams,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct JoinMap {
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SaveMap {
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeleteMap {
    pub name: String,
}

// GROUPS

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateGroup {
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OneGroupChange {
    OffX(i32),
    OffY(i32),
    ParaX(i32),
    ParaY(i32),
    Name(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EditGroup {
    pub group: u32,
    #[serde(flatten)]
    pub change: OneGroupChange,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderGroup {
    pub group: u32,
    pub new_group: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeleteGroup {
    pub group: u32,
}

// LAYERS

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OneLayerChange {
    Name(String),
    Color(Color),
    Width(u32),
    Height(u32),
}

// see https://serde.rs/remote-derive.html
#[derive(Serialize, Deserialize)]
#[serde(remote = "InvalidLayerKind", rename_all = "lowercase")]
enum SerdeInvalidLayerKind {
    Unknown(i32),        // unknown value of 'LAYERTYPE' identifier
    UnknownTileMap(i32), // 'LAYERTYPE' identified a tile layer, unknown value of 'TILESLAYERFLAG' identifier
    NoType,              // layer item too short to get 'LAYERTYPE' identifier
    NoTypeTileMap, // 'LAYERTYPE' identified a tile layer, layer item too short to get 'TILESLAYERFLAG' identifier
}

#[derive(Serialize, Deserialize)]
#[serde(remote = "LayerKind", rename_all = "lowercase")]
enum SerdeLayerKind {
    Game,
    Tiles,
    Quads,
    Front,
    Tele,
    Speedup,
    Switch,
    Tune,
    Sounds,
    Invalid(#[serde(with = "SerdeInvalidLayerKind")] InvalidLayerKind),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateLayer {
    #[serde(with = "SerdeLayerKind")]
    pub kind: LayerKind,
    pub group: u32,
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EditLayer {
    pub group: u32,
    pub layer: u32,
    #[serde(flatten)]
    pub change: OneLayerChange,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderLayer {
    pub group: u32,
    pub layer: u32,
    pub new_group: u32,
    pub new_layer: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeleteLayer {
    pub group: u32,
    pub layer: u32,
}

// TILES

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EditTile {
    pub group: u32,
    pub layer: u32,
    pub x: u32,
    pub y: u32,
    pub id: u8,
}

// MISC

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SendMap {
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListUsers {
    pub global_count: u32,
    pub room_count: Option<u32>, // available if peer is in a room
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MapInfo {
    pub name: String,
    pub users: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ListMaps {
    pub maps: Vec<MapInfo>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", content = "content", rename_all = "lowercase")]
pub enum RequestContent {
    CreateMap(CreateMap),
    JoinMap(JoinMap),
    // EditMap(EditMap),
    SaveMap(SaveMap),
    DeleteMap(DeleteMap),

    CreateGroup(CreateGroup),
    EditGroup(EditGroup),
    ReorderGroup(ReorderGroup),
    DeleteGroup(DeleteGroup),

    CreateLayer(CreateLayer),
    EditLayer(EditLayer),
    ReorderLayer(ReorderLayer),
    DeleteLayer(DeleteLayer),

    EditTile(EditTile),
    // CreateQuad(CreateQuad),
    // EditQuad(EditQuad),
    // DeleteQuad(DeleteQuad),
    SendMap(SendMap),
    ListUsers,
    ListMaps,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", content = "content", rename_all = "lowercase")]
pub enum ResponseContent {
    CreateMap(CreateMap),
    JoinMap(JoinMap),
    // EditMap(EditMap),
    SaveMap(SaveMap),
    DeleteMap(DeleteMap),

    CreateGroup(CreateGroup),
    EditGroup(EditGroup),
    ReorderGroup(ReorderGroup),
    DeleteGroup(DeleteGroup),

    CreateLayer(CreateLayer),
    EditLayer(EditLayer),
    ReorderLayer(ReorderLayer),
    DeleteLayer(DeleteLayer),

    EditTile(EditTile),
    // CreateQuad(CreateQuad),
    // EditQuad(EditQuad),
    // DeleteQuad(DeleteQuad),
    SendMap(SendMap),
    ListUsers(ListUsers),
    ListMaps(ListMaps),
    UploadComplete,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Request {
    pub timestamp: u64, // UNIX timestamp set by sender
    pub id: u32,        // same ID will be set by server reply
    #[serde(flatten)]
    pub content: RequestContent,
}

#[derive(Serialize, Deserialize)]
#[serde(remote = "Result", rename_all = "lowercase")]
enum SerdeResult<T, E> {
    Ok(T),
    Err(E),
}

#[derive(Clone, Debug, Serialize)]
pub struct Response {
    pub timestamp: u64, // UNIX timestamp set by sender
    pub id: u32,        // same ID will be set by client request
    #[serde(with = "SerdeResult")]
    #[serde(flatten)]
    pub content: Result<ResponseContent, &'static str>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Broadcast {
    pub timestamp: u64, // UNIX timestamp set by sender
    #[serde(flatten)]
    pub content: ResponseContent,
}
