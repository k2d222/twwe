use std::collections::HashMap;

use fixed::types::{I17F15, I22F10, I27F5};
use serde::{Deserialize, Serialize};
use twmap::{
    AutomapperConfig, Color, EnvPoint, I32Color, Info, InvalidLayerKind, LayerKind, Point,
    Position, Volume,
};

use crate::map_cfg::MapAccess;

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

// MAPS

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MapConfig {
    pub name: String,
    pub access: MapAccess,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMapBlank {
    #[serde(flatten)]
    pub config: MapConfig,
    pub version: Option<twmap::Version>,
    pub width: u32,
    pub height: u32,
    pub default_layers: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateMapClone {
    #[serde(flatten)]
    pub config: MapConfig,
    pub clone: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateMapUpload {
    #[serde(flatten)]
    pub config: MapConfig,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CreateMap {
    Blank(CreateMapBlank),
    Clone(CreateMapClone),
    Upload(CreateMapUpload),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct JoinMap {
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EditMap {
    // pub name: String, // TODO
    pub info: Info,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SaveMap {
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeleteMap {
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameMap {
    pub name: String,
    pub new_name: String,
}

// GROUPS

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateGroup {
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OneGroupChange {
    OffX(I27F5),
    OffY(I27F5),
    ParaX(i32),
    ParaY(i32),
    Clipping(bool),
    ClipX(I27F5),
    ClipY(I27F5),
    ClipW(I27F5),
    ClipH(I27F5),
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
    Flags(i32),
    Color(Color),
    Width(u32),
    Height(u32),
    Image(Option<u16>),
    ColorEnv(Option<u16>),
    ColorEnvOffset(i32),
    Automapper(AutomapperConfig),
}

// see https://serde.rs/remote-derive.html
#[derive(Serialize, Deserialize)]
#[serde(remote = "InvalidLayerKind", rename_all = "lowercase")]
enum SerdeInvalidLayerKind {
    Unknown(i32),        // unknown value of 'LAYERTYPE' identifier
    UnknownTilemap(i32), // 'LAYERTYPE' identified a tile layer, unknown value of 'TILESLAYERFLAG' identifier
    NoType,              // layer item too short to get 'LAYERTYPE' identifier
    NoTypeTilemap, // 'LAYERTYPE' identified a tile layer, layer item too short to get 'TILESLAYERFLAG' identifier
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
    pub name: String, // this is ignored for physics layers
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
#[serde(rename_all = "camelCase")]
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
#[serde(tag = "type", rename_all = "lowercase")]
pub enum EditTileContent {
    Tiles(Tile),
    Tele(Tele),
    Speedup(Speedup),
    Switch(Switch),
    Tune(Tune),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EditTile {
    pub group: u32,
    pub layer: u32,
    pub x: u32,
    pub y: u32,
    #[serde(flatten)]
    pub content: EditTileContent,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditTiles {
    pub group: u32,
    pub layer: u32,
    pub x: u32,
    pub y: u32,
    #[serde(with = "SerdeLayerKind")]
    pub kind: LayerKind,
    pub width: u32,
    pub height: u32,
    pub data: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SendLayer {
    pub group: u32,
    pub layer: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Quad {
    pub points: [Point<I17F15>; 5],
    pub colors: [Color; 4],
    pub tex_coords: [Point<I22F10>; 4],
    pub pos_env: Option<u16>,
    pub pos_env_offset: i32,
    pub color_env: Option<u16>,
    pub color_env_offset: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateQuad {
    pub group: u32,
    pub layer: u32,
    #[serde(flatten)]
    pub content: Quad,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EditQuad {
    pub group: u32,
    pub layer: u32,
    pub quad: u32,
    #[serde(flatten)]
    pub content: Quad,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeleteQuad {
    pub group: u32,
    pub layer: u32,
    pub quad: u32,
}

// ENVELOPES

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase", tag = "type", content = "content")]
pub enum EnvPoints {
    Color(Vec<EnvPoint<I32Color>>),
    Position(Vec<EnvPoint<Position>>),
    Sound(Vec<EnvPoint<Volume>>),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EnvelopeKind {
    Color,
    Position,
    Sound,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateEnvelope {
    pub name: String,
    pub kind: EnvelopeKind,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OneEnvelopeChange {
    Name(String),
    Synchronized(bool),
    Points(EnvPoints),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EditEnvelope {
    pub index: u16,
    #[serde(flatten)]
    pub change: OneEnvelopeChange,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeleteEnvelope {
    pub index: u16,
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

// IMAGES

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImageConfig {
    pub name: String,
    pub index: u16,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ListAutomappers {
    pub configs: HashMap<String, Vec<String>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SendAutomapper {
    pub image: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UploadAutomapper {
    pub image: String,
    pub content: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ApplyAutomapper {
    pub group: u32,
    pub layer: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateImage {
    pub name: String,
    pub index: u16,
    pub external: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeleteImage {
    pub index: u16,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImageInfo {
    pub index: u16,
    pub name: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Cursor {
    pub point: Point<f32>,
    pub group: i32,
    pub layer: i32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Error {
    ServerError,      // server panicked
    MapError(String), // map is corrupted
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", content = "content", rename_all = "lowercase")]
pub enum RequestContent {
    CreateMap(CreateMapBlank),
    CloneMap(CreateMapClone),
    JoinMap(JoinMap),
    LeaveMap,
    EditMap(EditMap),
    SaveMap(SaveMap),
    DeleteMap(DeleteMap),
    RenameMap(RenameMap),

    CreateGroup(CreateGroup),
    EditGroup(EditGroup),
    ReorderGroup(ReorderGroup),
    DeleteGroup(DeleteGroup),

    CreateLayer(CreateLayer),
    EditLayer(EditLayer),
    ReorderLayer(ReorderLayer),
    DeleteLayer(DeleteLayer),

    EditTile(EditTile),
    EditTiles(EditTiles),
    SendLayer(SendLayer),

    CreateQuad(CreateQuad),
    EditQuad(EditQuad),
    DeleteQuad(DeleteQuad),

    CreateEnvelope(CreateEnvelope),
    EditEnvelope(EditEnvelope),
    DeleteEnvelope(DeleteEnvelope),

    ListUsers,
    ListMaps,

    ListAutomappers,
    SendAutomapper(SendAutomapper),
    UploadAutomapper(UploadAutomapper),
    ApplyAutomapper(ApplyAutomapper),

    CreateImage(CreateImage),
    ImageInfo(u16),
    DeleteImage(DeleteImage),

    Cursors(Cursor),
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", content = "content", rename_all = "lowercase")]
pub enum ResponseContent {
    CreateMap(CreateMapBlank),
    CloneMap(CreateMapClone),
    JoinMap(JoinMap),
    LeaveMap,
    EditMap(EditMap),
    SaveMap(SaveMap),
    DeleteMap(DeleteMap),
    RenameMap(RenameMap),

    CreateGroup(CreateGroup),
    EditGroup(EditGroup),
    ReorderGroup(ReorderGroup),
    DeleteGroup(DeleteGroup),

    CreateLayer(CreateLayer),
    EditLayer(EditLayer),
    ReorderLayer(ReorderLayer),
    DeleteLayer(DeleteLayer),

    EditTile(EditTile),
    EditTiles(EditTiles),
    SendLayer(String),

    CreateQuad(CreateQuad),
    EditQuad(EditQuad),
    DeleteQuad(DeleteQuad),

    CreateEnvelope(CreateEnvelope),
    EditEnvelope(EditEnvelope),
    DeleteEnvelope(DeleteEnvelope),

    ListUsers(ListUsers),
    ListMaps(ListMaps),

    ListAutomappers(ListAutomappers),
    SendAutomapper(String),
    UploadAutomapper,
    ApplyAutomapper(ApplyAutomapper),

    CreateImage(CreateImage),
    ImageInfo(ImageInfo),
    DeleteImage(DeleteImage),

    Cursors(HashMap<String, Cursor>),

    Error(Error),
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
