use std::{collections::HashMap, fmt::Display, str::FromStr};

use fixed::types::{I17F15, I22F10, I27F5};
use serde::{Deserialize, Serialize};
use serde_with::{
    rust::double_option, serde_as, skip_serializing_none, DeserializeAs, DisplayFromStr,
    SerializeAs,
};
use twmap::{AutomapperConfig, EnvPoint, Position, Volume};
use vek::{Extent2, Rect, Rgba, Uv, Vec2};

use crate::{base64::Base64, error::Error, util::timestamp_now};

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
pub struct Config {
    pub name: String,
    pub public: bool,
    pub password: bool,
    pub version: twmap::Version,
}

#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PartialConfig {
    pub name: Option<String>,
    pub public: Option<bool>,
    pub password: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MapDetail {
    pub name: String,
    pub users: usize,
}

// AUTOMAPPERS

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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Span {
    pub line_start: u32,
    pub col_start: u32,
    pub line_end: u32,
    pub col_end: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AutomapperDiagnostic {
    pub span: Span,
    pub msg: String,
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CreationMethod {
    Upload(Base64),
    Clone(String),
    Blank { w: u32, h: u32 },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Version {
    DDNet06,
    Teeworlds07,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MapCreation {
    #[serde(default)]
    pub version: Option<Version>,
    #[serde(default)]
    pub public: Option<bool>,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(flatten)]
    pub method: CreationMethod,
}

#[skip_serializing_none]
#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PartialInfo {
    pub author: Option<String>,
    pub version: Option<String>,
    pub credits: Option<String>,
    pub license: Option<String>,
    pub settings: Option<Vec<String>>,
}

#[skip_serializing_none]
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
    Sound(PartialEnv<Volume>),
}

#[skip_serializing_none]
#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PartialGroup {
    pub name: Option<String>,
    pub offset: Option<Vec2<I27F5>>,
    pub parallax: Option<Vec2<i32>>,
    pub clipping: Option<bool>,
    pub clip: Option<Rect<I27F5, I27F5>>,
}

#[skip_serializing_none]
#[derive(Default, Clone, Debug, Serialize, Deserialize)]
pub struct PartialPhysicsLayer {
    pub width: Option<usize>,
    pub height: Option<usize>,
}

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

#[skip_serializing_none]
#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct PartialQuadsLayer {
    pub name: Option<String>,
    pub detail: Option<bool>,
    #[serde(with = "double_option")]
    pub image: Option<Option<u16>>,
}

// the sole purpose of this remote struct is to serialize color_env and
// position_env as numbers instead of strings (like twmap does), because twmap
// deserialization panics.
#[derive(Default, Clone, Debug, Serialize, Deserialize)]
#[serde(remote = "twmap::Quad")]
pub struct SerdeQuad {
    pub corners: [Vec2<I17F15>; 4],
    pub position: Vec2<I17F15>,
    pub colors: [Rgba<u8>; 4],
    pub texture_coords: [Uv<I22F10>; 4],
    pub position_env: Option<u16>,
    pub position_env_offset: i32,
    pub color_env: Option<u16>,
    pub color_env_offset: i32,
}

impl SerializeAs<twmap::Quad> for SerdeQuad {
    fn serialize_as<S>(value: &twmap::Quad, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        SerdeQuad::serialize(value, serializer)
    }
}

impl<'de> DeserializeAs<'de, twmap::Quad> for SerdeQuad {
    fn deserialize_as<D>(deserializer: D) -> Result<twmap::Quad, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        SerdeQuad::deserialize(deserializer)
    }
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
pub struct HttpReq {
    pub method: String,
    pub path: String,
    pub body: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct JoinReq {
    pub name: String,
    pub password: Option<String>,
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
    #[serde(rename = "get/config")]
    Config,
    #[serde(rename = "get/info")]
    Info,
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

#[serde_as]
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
    Quad(
        u16,
        u16,
        #[serde_as(as = "Box<SerdeQuad>")] Box<twmap::Quad>,
    ),
    #[serde(rename = "create/automapper")]
    Automapper(String, String),
}

#[serde_as]
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
    Quad(
        u16,
        u16,
        u16,
        #[serde_as(as = "Box<SerdeQuad>")] Box<twmap::Quad>,
    ),
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
    #[serde(rename = "list")]
    ListMaps,
    #[serde(rename = "config")]
    Config(String),
    #[serde(rename = "join")]
    JoinMap(JoinReq),
    #[serde(rename = "leave")]
    LeaveMap(String),
    #[serde(rename = "get")]
    GetMap(String),
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

#[serde_as]
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Response {
    Ok,
    Token(String),
    Maps(Vec<MapDetail>),
    Map(Base64),
    Users(usize),
    Cursors(HashMap<String, Cursor>),
    Config(Box<Config>),
    Info(Box<twmap::Info>),
    Images(Vec<String>),
    Image(Base64),
    Envelopes(Vec<String>),
    Envelope(Box<twmap::Envelope>),
    Groups(Vec<String>),
    Group(Box<twmap::Group>),
    Layers(Vec<String>),
    Layer(Box<twmap::Layer>),
    Tiles(Base64),
    Quad(#[serde_as(as = "Box<SerdeQuad>")] Box<twmap::Quad>),
    Automappers(Vec<AutomapperDetail>),
    AutomapperDiagnostics(Vec<AutomapperDiagnostic>),
    Automapper(String),
}

// Messages that are sent unrequested from the client.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "content", rename_all = "snake_case")]
pub enum Broadcast {
    MapCreated(String),
    MapDeleted(String),
    Users(usize),
    Saved,
}

#[serde_as]
#[derive(Serialize, Deserialize)]
#[serde(remote = "Result", rename_all = "lowercase")]
enum SerdeResult<T, E>
where
    E: Display + FromStr,
    E::Err: Display,
{
    Ok(T),
    Err(#[serde_as(as = "DisplayFromStr")] E),
}

#[serde_as]
#[derive(Debug, Serialize, Deserialize)]
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

impl<T> Packet<T> {
    pub fn new(id: Option<u32>, content: T) -> Self {
        Self {
            timestamp: timestamp_now(),
            id,
            content,
        }
    }
}

pub type SendPacket = Packet<Message>;
pub type RecvPacket = Packet<Request>;
