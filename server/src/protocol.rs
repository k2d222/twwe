use std::{collections::HashMap, fmt::Display};

use fixed::types::{I22F10, I27F5};
use serde::{Deserialize, Serialize};
use serde_with::{rust::double_option, serde_as, skip_serializing_none};
use twmap::{AutomapperConfig, EnvPoint, Position, Volume};
use vek::{Extent2, Rect, Rgba, Vec2};

use crate::{base64::Base64, error::Error, map_cfg::MapAccess, util::serialize_display};

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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MapDetail {
    pub name: String,
    pub users: usize,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum AutomapperKind {
    #[serde(rename = "rules")]
    DDNet,
    #[serde(rename = "json")]
    Teeworlds,
    #[serde(rename = "rpp")]
    RulesPP,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AutomapperDetail {
    pub name: String,
    pub image: String,
    pub kind: AutomapperKind,
    pub configs: Option<Vec<String>>,
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

#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PartialConfig {
    pub name: Option<String>,
    pub access: Option<MapAccess>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CreationMethod {
    Upload(Base64),
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credits: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settings: Option<Vec<String>>,
}

#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PartialEnv<T: Copy> {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub synchronized: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub points: Option<Vec<EnvPoint<T>>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum PartialEnvelope {
    Position(PartialEnv<Position>),
    Color(PartialEnv<Rgba<I22F10>>),
    Sound(PartialEnv<Volume>),
}

#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PartialGroup {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<Vec2<I27F5>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parallax: Option<Vec2<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clipping: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clip: Option<Rect<I27F5, I27F5>>,
}

#[derive(Default, Clone, Debug, Serialize, Deserialize)]
pub struct PartialPhysicsLayer {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<usize>,
}

#[serde_as]
#[skip_serializing_none]
#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PartialTilesLayer {
    pub width: Option<usize>,
    pub height: Option<usize>,
    pub name: Option<String>,
    pub detail: Option<bool>,
    pub color: Option<Rgba<u8>>,
    #[serde(with = "double_option")]
    pub color_env: Option<Option<u16>>,
    pub color_env_offset: Option<i32>,
    #[serde(with = "double_option")]
    pub image: Option<Option<u16>>,
    pub automapper_config: Option<AutomapperConfig>,
}

#[serde_as]
#[skip_serializing_none]
#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PartialQuadsLayer {
    pub name: Option<String>,
    pub detail: Option<bool>,
    #[serde(with = "double_option")]
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
#[serde(untagged)]
pub enum Image {
    External { size: Extent2<u32> },
    Embedded(Base64),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "content")]
pub enum GetReq {
    #[serde(rename = "get/map")]
    Map,
    #[serde(rename = "get/users")]
    Users,
    #[serde(rename = "get/cursors")]
    Cursors,
    #[serde(rename = "get/images")]
    Images,
    #[serde(rename = "get/image")]
    Image(u16),
    #[serde(rename = "get/envelopes")]
    Envelopes,
    #[serde(rename = "get/envelope")]
    Envelope(u16),
    #[serde(rename = "get/groups")]
    Groups,
    #[serde(rename = "get/group")]
    Group(u16),
    #[serde(rename = "get/layers")]
    Layers(u16),
    #[serde(rename = "get/layer")]
    Layer(u16, u16),
    #[serde(rename = "get/tiles")]
    Tiles(u16, u16),
    #[serde(rename = "get/quad")]
    Quad(u16, u16, u16),
    #[serde(rename = "get/automappers")]
    Automappers,
    #[serde(rename = "get/automapper")]
    Automapper(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "content")]
pub enum CreateReq {
    #[serde(rename = "create/image")]
    Image(String, Image),
    #[serde(rename = "create/envelope")]
    Envelope(Box<PartialEnvelope>),
    #[serde(rename = "create/group")]
    Group(Box<PartialGroup>),
    #[serde(rename = "create/layer")]
    Layer(u16, Box<PartialLayer>),
    #[serde(rename = "create/quad")]
    Quad(u16, u16, Box<twmap::Quad>),
    #[serde(rename = "create/automapper")]
    Automapper(String, String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "content")]
pub enum EditReq {
    #[serde(rename = "edit/config")]
    Config(Box<PartialConfig>),
    #[serde(rename = "edit/info")]
    Info(Box<PartialInfo>),
    #[serde(rename = "edit/envelope")]
    Envelope(u16, Box<PartialEnvelope>),
    #[serde(rename = "edit/group")]
    Group(u16, Box<PartialGroup>),
    #[serde(rename = "edit/layer")]
    Layer(u16, u16, Box<PartialLayer>),
    #[serde(rename = "edit/tiles")]
    Tiles(u16, u16, Box<Tiles>),
    #[serde(rename = "edit/quad")]
    Quad(u16, u16, u16, Box<twmap::Quad>),
    #[serde(rename = "edit/automap")]
    Automap(u16, u16),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "content")]
pub enum DeleteReq {
    #[serde(rename = "delete/image")]
    Image(u16),
    #[serde(rename = "delete/envelope")]
    Envelope(u16),
    #[serde(rename = "delete/group")]
    Group(u16),
    #[serde(rename = "delete/layer")]
    Layer(u16, u16),
    #[serde(rename = "delete/quad")]
    Quad(u16, u16, u16),
    #[serde(rename = "delete/automapper")]
    Automapper(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "content")]
pub enum MoveReq {
    #[serde(rename = "move/image")]
    Image(u16, u16),
    #[serde(rename = "move/envelope")]
    Envelope(u16, u16),
    #[serde(rename = "move/group")]
    Group(u16, u16),
    #[serde(rename = "move/layer")]
    Layer((u16, u16), (u16, u16)),
    #[serde(rename = "move/quad")]
    Quad((u16, u16, u16), u16),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "content")]
pub enum Request {
    #[serde(rename = "join")]
    JoinMap(String),
    #[serde(rename = "leave")]
    LeaveMap(String),
    #[serde(rename = "create")]
    CreateMap(String, Box<MapCreation>),
    #[serde(rename = "delete")]
    DeleteMap(String),
    #[serde(rename = "save")]
    Save,
    #[serde(rename = "cursor")]
    Cursor(Box<Cursor>),
    #[serde(untagged)]
    Get(GetReq),
    #[serde(untagged)]
    Create(CreateReq),
    #[serde(untagged)]
    Edit(EditReq),
    #[serde(untagged)]
    Delete(DeleteReq),
    #[serde(untagged)]
    Move(MoveReq),
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
    Group(Box<twmap::Group>),
    Layers(Vec<String>),
    Layer(Box<twmap::Layer>),
    Tiles(Base64),
    Quad(Box<twmap::Quad>),
    Automappers(Vec<AutomapperDetail>),
    Automapper(String),
    Users(usize),
    Cursors(HashMap<String, Cursor>),
}

// Messages that are sent unrequested from the client.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", content = "content", rename_all = "snake_case")]
pub enum Broadcast {
    MapCreated(String),
    MapDeleted(String),
    Users(usize),
    Saved,
}

#[derive(Serialize)]
#[serde(remote = "Result", rename_all = "lowercase")]
enum SerdeResult<T, E: Display> {
    Ok(T),
    #[serde(serialize_with = "serialize_display")]
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
    #[serde(flatten)]
    pub content: T,
}

pub type SendPacket = Packet<Message>;
pub type RecvPacket = Packet<Request>;
