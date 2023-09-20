use std::collections::HashMap;

use fixed::types::{I17F15, I22F10, I27F5};
use serde::{Deserialize, Serialize};
use twmap::{AutomapperConfig, EnvPoint, Info, InvalidLayerKind, LayerKind, Position, Volume};
use vek::{Rect, Rgba, Uv, Vec2};

use crate::{base64::Base64, error::Error, map_cfg::MapAccess, twmap_map_checks};

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
//clone
// Other requests, like editing layers / groups can lead to desync between the
// clients, hence cannot be handled that way. They require a forward-and-back
// communication with the server to see if it agrees with the transaction.
//
// For those requests, the client has to wait for the server which leads to poor ux.
// This could be fixed in the future by implementing a history and versionning
// system similar to how databases handle concurrent modifications.

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MapConfig {
    pub name: String,
    pub access: MapAccess,
    pub version: Option<twmap::Version>,
}

// TILES

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tile {
    pub id: u8,
    pub flags: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tele {
    pub number: u8,
    pub id: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Speedup {
    pub force: u8,
    pub max_speed: u8,
    pub id: u8,
    pub angle: i16,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Switch {
    pub number: u8,
    pub id: u8,
    pub flags: u8,
    pub delay: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tune {
    pub number: u8,
    pub id: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Cursor {
    #[serde(flatten)]
    pub point: Vec2<f32>,
    #[serde(rename = "g")]
    pub group: i32,
    #[serde(rename = "l")]
    pub layer: i32,
}

// #[derive(Clone, Debug, Deserialize)]
// #[serde(tag = "type", content = "content", rename_all = "lowercase")]
// pub enum RequestContent {
//     CreateMap(CreateMapBlank),
//     CloneMap(CreateMapClone),
//     JoinMap(JoinMap),
//     LeaveMap,
//     EditMap(EditMap),
//     SaveMap(SaveMap),
//     DeleteMap(DeleteMap),
//     RenameMap(RenameMap),

//     CreateGroup(CreateGroup),
//     EditGroup(EditGroup),
//     ReorderGroup(ReorderGroup),
//     DeleteGroup(DeleteGroup),

//     CreateLayer(CreateLayer),
//     EditLayer(EditLayer),
//     ReorderLayer(ReorderLayer),
//     DeleteLayer(DeleteLayer),

//     EditTile(EditTile),
//     EditTiles(EditTiles),
//     SendLayer(SendLayer),

//     CreateQuad(CreateQuad),
//     EditQuad(EditQuad),
//     DeleteQuad(DeleteQuad),

//     CreateEnvelope(CreateEnvelope),
//     EditEnvelope(EditEnvelope),
//     DeleteEnvelope(DeleteEnvelope),

//     ListUsers,
//     ListMaps,

//     ListAutomappers,
//     SendAutomapper(String),
//     DeleteAutomapper(String),
//     UploadAutomapper(UploadAutomapper),
//     ApplyAutomapper(ApplyAutomapper),

//     CreateImage(CreateImage),
//     ImageInfo(u16),
//     DeleteImage(DeleteImage),

//     Cursors(Cursor),
// }

// #[derive(Clone, Debug, Serialize)]
// #[serde(tag = "type", content = "content", rename_all = "lowercase")]
// pub enum ResponseContent {
//     CreateMap(CreateMapBlank),
//     CloneMap(CreateMapClone),
//     JoinMap(JoinMap),
//     LeaveMap,
//     EditMap(EditMap),
//     SaveMap(SaveMap),
//     DeleteMap(DeleteMap),
//     RenameMap(RenameMap),

//     CreateGroup(CreateGroup),
//     EditGroup(EditGroup),
//     ReorderGroup(ReorderGroup),
//     DeleteGroup(DeleteGroup),

//     CreateLayer(CreateLayer),
//     EditLayer(EditLayer),
//     ReorderLayer(ReorderLayer),
//     DeleteLayer(DeleteLayer),

//     EditTile(EditTile),
//     EditTiles(EditTiles),
//     SendLayer(String),

//     CreateQuad(CreateQuad),
//     EditQuad(EditQuad),
//     DeleteQuad(DeleteQuad),

//     CreateEnvelope(CreateEnvelope),
//     EditEnvelope(EditEnvelope),
//     DeleteEnvelope(DeleteEnvelope),

//     ListUsers(ListUsers),
//     ListMaps(ListMaps),

//     ListAutomappers(ListAutomappers),
//     SendAutomapper(String),
//     DeleteAutomapper(String),
//     UploadAutomapper(AutomapperDetail),
//     ApplyAutomapper(ApplyAutomapper),

//     CreateImage(CreateImage),
//     ImageInfo(ImageInfo),
//     DeleteImage(DeleteImage),

//     Cursors(HashMap<String, Cursor>),

//     Error(String),
// }

#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PartialConfig {
    pub name: Option<String>,
    pub access: Option<MapAccess>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CreationMethod {
    Clone(String),
    Blank { w: u32, h: u32 },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MapCreation {
    #[serde(default)]
    pub version: Option<twmap::Version>,
    #[serde(default)]
    pub access: Option<MapAccess>,
    #[serde(flatten)]
    pub method: CreationMethod,
}

#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PartialInfo {
    pub author: Option<String>,
    pub version: Option<String>,
    pub credits: Option<String>,
    pub license: Option<String>,
    pub settings: Option<Vec<String>>,
}

#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PartialEnv<T: Copy> {
    pub name: Option<String>,
    pub synchronized: Option<bool>,
    pub points: Option<Vec<EnvPoint<T>>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum PartialEnvelope {
    Position(PartialEnv<Position>),
    Color(PartialEnv<Rgba<I22F10>>),
    /// Not available in Teeworlds07 maps.
    Sound(PartialEnv<Volume>),
}

#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PartialGroup {
    pub name: Option<String>,
    pub offset: Option<Vec2<I27F5>>,
    pub parallax: Option<Vec2<i32>>,
    pub clipping: Option<bool>,
    pub clip: Option<Rect<I27F5, I27F5>>,
}

#[derive(Default, Clone, Debug, Serialize, Deserialize)]
pub struct PartialPhysicsLayer {
    pub width: Option<usize>,
    pub height: Option<usize>,
}

#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PartialTilesLayer {
    pub width: Option<usize>,
    pub height: Option<usize>,
    pub name: Option<String>,
    pub detail: Option<bool>,
    pub color: Option<Rgba<u8>>,
    pub color_env: Option<Option<u16>>,
    pub color_env_offset: Option<i32>,
    pub image: Option<Option<u16>>,
    pub automapper_config: Option<AutomapperConfig>,
}

#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PartialQuadsLayer {
    pub name: Option<String>,
    pub detail: Option<bool>,
    pub image: Option<Option<u16>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tiles {
    #[serde(flatten)]
    pub rect: vek::Rect<u32, u32>,
    pub tiles: Base64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum PartialLayer {
    Game(PartialPhysicsLayer),
    Tiles(PartialTilesLayer),
    Quads(PartialQuadsLayer),
    Front(PartialPhysicsLayer),
    Tele(PartialPhysicsLayer),
    Speedup(PartialPhysicsLayer),
    Switch(PartialPhysicsLayer),
    Tune(PartialPhysicsLayer),
    // Sounds(SoundsLayer), // TODO
}

#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PartialAutomapper {}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MapGetReq {
    #[serde(rename = "map/get/users")]
    Users,
    #[serde(rename = "map/get/map")]
    Map,
    #[serde(rename = "map/get/images")]
    Images,
    #[serde(rename = "map/get/image")]
    Image(u16),
    #[serde(rename = "map/get/envelopes")]
    Envelopes,
    #[serde(rename = "map/get/envelope")]
    Envelope(u16),
    #[serde(rename = "map/get/groups")]
    Groups,
    // #[serde(rename = "map/get/group")]
    // Group(u16),
    #[serde(rename = "map/get/layers")]
    Layers(u16),
    // #[serde(rename = "map/get/layer")]
    // Layer(u16, u16),
    #[serde(rename = "map/get/automappers")]
    Automappers,
    #[serde(rename = "map/get/automapper")]
    Automapper(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MapPutReq {
    #[serde(rename = "map/put/envelope")]
    Envelope(Box<PartialEnvelope>),
    #[serde(rename = "map/put/group")]
    Group(Box<PartialGroup>),
    #[serde(rename = "map/put/layer")]
    Layer(u16, Box<PartialLayer>),
    #[serde(rename = "map/put/automapper")]
    Automapper(String, String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MapPostReq {
    #[serde(rename = "map/post/config")]
    Config(Box<PartialConfig>),
    #[serde(rename = "map/post/info")]
    Info(Box<PartialInfo>),
    #[serde(rename = "map/post/envelope")]
    Envelope(u16, Box<PartialEnvelope>),
    #[serde(rename = "map/post/group")]
    Group(u16, Box<PartialGroup>),
    #[serde(rename = "map/post/layer")]
    Layer(u16, u16, Box<PartialLayer>),
    #[serde(rename = "map/post/tiles")]
    Tiles(u16, u16, Box<Tiles>),
    #[serde(rename = "map/post/automap")]
    Automap(u16, u16),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MapPatchReq {
    #[serde(rename = "map/patch/envelope")]
    Envelope(u16, u16),
    #[serde(rename = "map/patch/group")]
    Group(u16, u16),
    #[serde(rename = "map/patch/layer")]
    Layer((u16, u16), (u16, u16)),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MapDelReq {
    #[serde(rename = "map/delete/envelope")]
    Envelope(u16),
    #[serde(rename = "map/delete/group")]
    Group(u16),
    #[serde(rename = "map/delete/layer")]
    Layer(u16, u16),
    #[serde(rename = "map/delete/automapper")]
    Automapper(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MapReq {
    #[serde(rename = "cursor")]
    Cursor(Box<Cursor>),
    #[serde(rename = "map/save")]
    Save,
    #[serde(untagged)]
    Get(MapGetReq),
    #[serde(untagged)]
    Put(MapPutReq),
    #[serde(untagged)]
    Post(MapPostReq),
    #[serde(untagged)]
    Patch(MapPatchReq),
    #[serde(untagged)]
    Delete(MapDelReq),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum GetReq {
    #[serde(rename = "get/map")]
    Map(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PutReq {
    #[serde(rename = "put/map")]
    Map(String, Base64),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PostReq {
    #[serde(rename = "post/map")]
    Map(String, Box<MapCreation>),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DeleteReq {
    #[serde(rename = "delete/map")]
    Map(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Request {
    #[serde(rename = "join")]
    Join(String),
    #[serde(rename = "leave")]
    Leave(String),
    #[serde(untagged)]
    Map(MapReq),
    #[serde(untagged)]
    Get(GetReq),
    #[serde(untagged)]
    Put(PutReq),
    #[serde(untagged)]
    Post(PostReq),
    #[serde(untagged)]
    Delete(DeleteReq),
}

#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub enum Response {
    Ok,
    Map(Base64),
    Images(Vec<String>),
    Image(Base64),
    Envelopes(Vec<String>),
    Envelope(Box<twmap::Envelope>),
    Groups(Vec<String>),
    // Group(Box<twmap::Group>),
    Layers(Vec<String>),
    // Layer(Box<twmap::Layer>),
    Automappers(Vec<String>),
    Automapper(String),
    Users(usize),
    Cursors(HashMap<String, Cursor>),
}

// Messages that are sent unrequested from the client.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Broadcast {
    MapCreated(String),
    MapDeleted(String),
    Users(usize),
    Saved,
}

#[derive(Serialize, Deserialize)]
#[serde(remote = "Result", rename_all = "lowercase")]
enum SerdeResult<T, E> {
    Ok(T),
    Err(E),
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum Message {
    Request(Request),
    Response(#[serde(with = "SerdeResult")] Result<Response, Error>),
    Broadcast(Broadcast),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Packet<T> {
    pub timestamp: u64, // UNIX timestamp set by sender
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<u32>, // same ID will be set by client request
    pub content: T,
}

pub type SendPacket = Packet<Message>;
pub type RecvPacket = Packet<Request>;
