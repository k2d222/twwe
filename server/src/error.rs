use std::{borrow::Cow, convert::Infallible, fmt::Display, str::FromStr};

use axum::{http::StatusCode, response::IntoResponse};

#[derive(Clone, Debug)]
pub enum Error {
    // 404 not found
    MapNotFound,
    ImageNotFound,
    EnvelopeNotFound,
    GroupNotFound,
    LayerNotFound,
    QuadNotFound,
    AutomapperNotFound,
    #[allow(unused)]
    NotFound(&'static str),

    MaxEnvelopes,
    MaxEnvPoints,
    MaxImages,
    MaxGroups,
    MaxLayers,
    MaxQuads,

    InvalidImage,
    InvalidTiles,
    InvalidMapName,
    InvalidFileName,
    InvalidLayerDimensions,
    InvalidClip,
    Invalid(&'static str),

    FieldTooLong(&'static str),

    WrongEnvelopeType,
    WrongLayerType,
    WrongTilesImage,

    ImageInUse,
    EnvelopeInUse,

    MapNameTaken,
    MapTooBig,
    MaxMaps,
    MaxPeers,
    UnsupportedMapType,
    RoomNotEmpty,
    TilesOutOfBounds,
    LayerHasNoImage,

    BridgeNotFound,
    BridgeFailure,
    BridgeClosed,

    AlreadyJoined,
    NotJoined,
    Password,

    Map(String),
    Automapper(String),
    BadRequest(String),

    // 403 forbidden
    DeletePhysicsGroup,
    DeleteGameLayer,
    CreateGameLayer,
    CreatePhysicsLayerOutOfPhysicsGroup,
    CreateDuplicatePhysicsLayer,
    PhysicsLayerChangeGroup,
    EditPhysicsGroup,

    // 500 internal server error
    Internal(Cow<'static, str>),
    #[allow(unused)]
    ToDo,
}

impl Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::MapNotFound => write!(f, "map not found"),
            Error::ImageNotFound => write!(f, "image not found"),
            Error::EnvelopeNotFound => write!(f, "envelope not found"),
            Error::GroupNotFound => write!(f, "group not found"),
            Error::LayerNotFound => write!(f, "layer not found"),
            Error::QuadNotFound => write!(f, "quad not found"),
            Error::AutomapperNotFound => write!(f, "automapper not found"),
            Error::NotFound(x) => write!(f, "{x} not found"),
            Error::MaxEnvelopes => write!(f, "maximum number of envelopes reached"),
            Error::MaxEnvPoints => write!(f, "maximum number of envelope points reached"),
            Error::MaxImages => write!(f, "maximum number of images reached"),
            Error::MaxGroups => write!(f, "maximum number of groups reached"),
            Error::MaxLayers => write!(f, "maximum number of layers reached"),
            Error::MaxQuads => write!(f, "maximum number of quads reached"),
            Error::InvalidImage => write!(f, "invalid image"),
            Error::InvalidTiles => write!(f, "invalid tiles"),
            Error::InvalidMapName => write!(f, "invalid map name"),
            Error::InvalidFileName => write!(f, "invalid file name"),
            Error::InvalidLayerDimensions => write!(f, "invalid layer dimensions"),
            Error::InvalidClip => write!(f, "invalid clip value"),
            Error::Invalid(x) => write!(f, "invalid {x}"),
            Error::FieldTooLong(x) => write!(f, "field '{x}' is too long"),
            Error::WrongEnvelopeType => write!(f, "wrong envelope type"),
            Error::WrongLayerType => write!(f, "wrong layer type"),
            Error::WrongTilesImage => write!(f, "wrong tiles type"),
            Error::ImageInUse => write!(f, "image in use"),
            Error::EnvelopeInUse => write!(f, "envelope in use"),
            Error::MapNameTaken => write!(f, "map name already taken"),
            Error::MapTooBig => write!(f, "map size exceeds limit"),
            Error::MaxMaps => write!(f, "maximum number of maps reached"),
            Error::MaxPeers => write!(f, "maximum number of simultaneous connections reached"),
            Error::UnsupportedMapType => write!(f, "unsupported map type"),
            Error::RoomNotEmpty => write!(f, "room is not empty"),
            Error::TilesOutOfBounds => write!(f, "tiles out of layer bounds"),
            Error::LayerHasNoImage => write!(f, "layer has no image"),
            Error::BridgeNotFound => write!(f, "failed to connect to the remote server"),
            Error::BridgeFailure => write!(f, "error with the remote server"),
            Error::BridgeClosed => write!(f, "connection with the remote server closed"),
            Error::AlreadyJoined => write!(f, "already joined"),
            Error::NotJoined => write!(f, "not joined"),
            Error::Password => write!(f, "incorrect password"),
            Error::Map(x) => write!(f, "twmap error: {x}"),
            Error::Automapper(x) => write!(f, "automapper error: {x}"),
            Error::BadRequest(x) => write!(f, "bad request: {x}"),
            Error::DeletePhysicsGroup => write!(f, "cannot delete the physics group"),
            Error::DeleteGameLayer => write!(f, "cannot delete the game layer"),
            Error::CreateGameLayer => write!(f, "cannot create a second game layer"),
            Error::CreatePhysicsLayerOutOfPhysicsGroup => write!(
                f,
                "cannot create a physics layer outside of the physics group"
            ),
            Error::CreateDuplicatePhysicsLayer => {
                write!(f, "cannot create a second physics layer of same type")
            }
            Error::PhysicsLayerChangeGroup => {
                write!(f, "cannot move a physics layer out of the physics group")
            }
            Error::EditPhysicsGroup => write!(f, "cannot edit properties of the physics group"),
            Error::Internal(x) => write!(f, "internal server error: {x}"),
            Error::ToDo => write!(f, "this functionality is not implemented yet"),
        }
    }
}

impl FromStr for Error {
    type Err = Infallible;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(Error::Internal(s.to_owned().into()))
    }
}

impl IntoResponse for Error {
    fn into_response(self) -> axum::response::Response {
        let status_code = match self {
            Error::MapNotFound => StatusCode::NOT_FOUND,
            Error::ImageNotFound => StatusCode::NOT_FOUND,
            Error::EnvelopeNotFound => StatusCode::NOT_FOUND,
            Error::GroupNotFound => StatusCode::NOT_FOUND,
            Error::LayerNotFound => StatusCode::NOT_FOUND,
            Error::QuadNotFound => StatusCode::NOT_FOUND,
            Error::AutomapperNotFound => StatusCode::NOT_FOUND,
            Error::NotFound(_) => StatusCode::NOT_FOUND,
            Error::MaxEnvelopes => StatusCode::BAD_REQUEST,
            Error::MaxEnvPoints => StatusCode::BAD_REQUEST,
            Error::MaxImages => StatusCode::BAD_REQUEST,
            Error::MaxGroups => StatusCode::BAD_REQUEST,
            Error::MaxLayers => StatusCode::BAD_REQUEST,
            Error::MaxQuads => StatusCode::BAD_REQUEST,
            Error::InvalidImage => StatusCode::BAD_REQUEST,
            Error::InvalidTiles => StatusCode::BAD_REQUEST,
            Error::InvalidMapName => StatusCode::BAD_REQUEST,
            Error::InvalidFileName => StatusCode::BAD_REQUEST,
            Error::InvalidLayerDimensions => StatusCode::BAD_REQUEST,
            Error::InvalidClip => StatusCode::BAD_REQUEST,
            Error::Invalid(_) => StatusCode::BAD_REQUEST,
            Error::FieldTooLong(_) => StatusCode::BAD_REQUEST,
            Error::WrongEnvelopeType => StatusCode::BAD_REQUEST,
            Error::WrongLayerType => StatusCode::BAD_REQUEST,
            Error::WrongTilesImage => StatusCode::BAD_REQUEST,
            Error::ImageInUse => StatusCode::BAD_REQUEST,
            Error::EnvelopeInUse => StatusCode::BAD_REQUEST,
            Error::MapNameTaken => StatusCode::BAD_REQUEST,
            Error::MapTooBig => StatusCode::BAD_REQUEST,
            Error::MaxMaps => StatusCode::BAD_REQUEST,
            Error::MaxPeers => StatusCode::BAD_REQUEST,
            Error::UnsupportedMapType => StatusCode::BAD_REQUEST,
            Error::RoomNotEmpty => StatusCode::BAD_REQUEST,
            Error::TilesOutOfBounds => StatusCode::BAD_REQUEST,
            Error::LayerHasNoImage => StatusCode::BAD_REQUEST,
            Error::BridgeNotFound => StatusCode::BAD_GATEWAY,
            Error::BridgeFailure => StatusCode::BAD_GATEWAY,
            Error::BridgeClosed => StatusCode::BAD_GATEWAY,
            Error::AlreadyJoined => StatusCode::BAD_REQUEST,
            Error::NotJoined => StatusCode::BAD_REQUEST,
            Error::Password => StatusCode::BAD_REQUEST,
            Error::Map(_) => StatusCode::BAD_REQUEST,
            Error::Automapper(_) => StatusCode::BAD_REQUEST,
            Error::BadRequest(_) => StatusCode::BAD_REQUEST,
            Error::DeletePhysicsGroup => StatusCode::FORBIDDEN,
            Error::DeleteGameLayer => StatusCode::FORBIDDEN,
            Error::CreateGameLayer => StatusCode::FORBIDDEN,
            Error::CreatePhysicsLayerOutOfPhysicsGroup => StatusCode::FORBIDDEN,
            Error::CreateDuplicatePhysicsLayer => StatusCode::FORBIDDEN,
            Error::PhysicsLayerChangeGroup => StatusCode::FORBIDDEN,
            Error::EditPhysicsGroup => StatusCode::FORBIDDEN,
            Error::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            Error::ToDo => StatusCode::INTERNAL_SERVER_ERROR,
        };

        let resp = (status_code, self.to_string());
        resp.into_response()
    }
}
