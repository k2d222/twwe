use std::{borrow::Cow, fmt::Display};

use axum::{http::StatusCode, response::IntoResponse};
use serde::{Serialize, Serializer};

#[derive(Clone, Debug, Serialize)]
pub enum Error {
    MapNotFound,
    ImageNotFound,
    EnvelopeNotFound,
    GroupNotFound,
    LayerNotFound,
    QuadNotFound,
    AutomapperNotFound,
    NotFound(&'static str),

    MaxEnvelopesReached,
    MaxImagesReached,
    MaxGroupsReached,
    MaxLayersReached,
    MaxQuadsReached,
    TooMany(&'static str),

    InvalidImage,
    InvalidTiles,
    InvalidMapName,
    InvalidFileName,
    InvalidImageDimensions,
    InvalidLayerDimensions,
    InvalidClip,
    Invalid(&'static str),

    FieldTooLong(&'static str),

    WrongEnvelopeType,
    WrongLayerType,
    WrongTilesImage,

    MapNameTaken,
    UnsupportedMapType,
    RoomNotEmpty,
    TilesOutOfBounds,
    LayerHasNoImage,

    #[serde(serialize_with = "serialize_display")]
    MapError(String),
    AutomapperError(String),

    // 403 forbidden
    DeletePhysicsGroup,
    DeleteGameLayer,
    CreateGameLayer,
    CreatePhysicsLayerOutOfPhysicsGroup,
    CreateDuplicatePhysicsLayer,
    ChangePhysicsLayerGroup,
    EditPhysicsGroup,
    AlreadyJoined,
    NotJoined,
    ImageInUse,
    EnvelopeInUse,

    // 500 internal server error
    ServerError(Cow<'static, str>),
    #[allow(unused)]
    ToDo,
}

impl IntoResponse for Error {
    fn into_response(self) -> axum::response::Response {
        let resp: (StatusCode, String) = match self {
            Error::MapNotFound => (StatusCode::NOT_FOUND, "map not found".to_owned()),
            Error::ImageNotFound => (StatusCode::NOT_FOUND, "image not found".to_owned()),
            Error::EnvelopeNotFound => (StatusCode::NOT_FOUND, "envelope not found".to_owned()),
            Error::GroupNotFound => (StatusCode::NOT_FOUND, "group not found".to_owned()),
            Error::LayerNotFound => (StatusCode::NOT_FOUND, "layer not found".to_owned()),
            Error::QuadNotFound => (StatusCode::NOT_FOUND, "quad not found".to_owned()),
            Error::AutomapperNotFound => (StatusCode::NOT_FOUND, "automapper not found".to_owned()),
            Error::NotFound(e) => (StatusCode::NOT_FOUND, format!("{} not found", e)),

            Error::InvalidMapName => (StatusCode::BAD_REQUEST, "invalid map name".to_owned()),
            Error::InvalidFileName => (StatusCode::BAD_REQUEST, "invalid file name".to_owned()),
            Error::MapError(e) => (StatusCode::BAD_REQUEST, format!("map error: {}", e)),
            Error::MapNameTaken => (StatusCode::BAD_REQUEST, "map name is taken".to_owned()),
            Error::UnsupportedMapType => (
                StatusCode::BAD_REQUEST,
                "teeworlds map types are not supported".to_owned(),
            ),
            Error::RoomNotEmpty => (StatusCode::BAD_REQUEST, "room must be empty".to_owned()),
            Error::WrongEnvelopeType => (StatusCode::BAD_REQUEST, "wrong envelope type".to_owned()),
            Error::WrongLayerType => (StatusCode::BAD_REQUEST, "wrong layer type".to_owned()),
            Error::MaxGroupsReached => (
                StatusCode::BAD_REQUEST,
                "maximum number of groups reached".to_owned(),
            ),
            Error::MaxLayersReached => (
                StatusCode::BAD_REQUEST,
                "maximum number of layers reached".to_owned(),
            ),
            Error::MaxImagesReached => (
                StatusCode::BAD_REQUEST,
                "maximum number of images reached".to_owned(),
            ),
            Error::MaxEnvelopesReached => (
                StatusCode::BAD_REQUEST,
                "maximum number of envelopes reached".to_owned(),
            ),
            Error::MaxQuadsReached => (
                StatusCode::BAD_REQUEST,
                "maximum number of quads reached".to_owned(),
            ),
            Error::TooMany(e) => (StatusCode::BAD_REQUEST, format!("too many {}", e)),
            Error::InvalidImageDimensions => (
                StatusCode::BAD_REQUEST,
                "invalid image dimensions".to_owned(),
            ),
            Error::InvalidLayerDimensions => (
                StatusCode::BAD_REQUEST,
                "invalid layer dimensions".to_owned(),
            ),
            Error::TilesOutOfBounds => (StatusCode::BAD_REQUEST, "tiles out of bounds".to_owned()),
            Error::InvalidTiles => (StatusCode::BAD_REQUEST, "invalid tiles".to_owned()),
            Error::InvalidImage => (StatusCode::BAD_REQUEST, "invalid image".to_owned()),
            Error::LayerHasNoImage => (StatusCode::BAD_REQUEST, "layer has no image".to_owned()),
            Error::FieldTooLong(f) => (StatusCode::BAD_REQUEST, format!("field too long: '{f}'")),

            Error::AutomapperError(e) => {
                (StatusCode::BAD_REQUEST, format!("automapper error: {e}"))
            }
            Error::InvalidClip => (StatusCode::BAD_REQUEST, "invalid clip value".to_owned()),
            Error::Invalid(e) => (StatusCode::BAD_REQUEST, format!("invalid {}", e)),
            Error::WrongTilesImage => (
                StatusCode::BAD_REQUEST,
                "image not suitable for tiles layer".to_owned(),
            ),
            Error::EditPhysicsGroup => (
                StatusCode::BAD_REQUEST,
                "cannot edit physics group parameters".to_owned(),
            ),

            Error::DeletePhysicsGroup => (
                StatusCode::FORBIDDEN,
                "cannot delete the physics group".to_owned(),
            ),
            Error::DeleteGameLayer => (
                StatusCode::FORBIDDEN,
                "cannot delete the game layer".to_owned(),
            ),
            Error::CreateGameLayer => (
                StatusCode::FORBIDDEN,
                "maps can only have one game layer".to_owned(),
            ),
            Error::CreatePhysicsLayerOutOfPhysicsGroup => (
                StatusCode::FORBIDDEN,
                "physics layers must be created in the physics group".to_owned(),
            ),
            Error::CreateDuplicatePhysicsLayer => (
                StatusCode::FORBIDDEN,
                "physics layers must be unique".to_owned(),
            ),
            Error::ChangePhysicsLayerGroup => (
                StatusCode::FORBIDDEN,
                "cannot move a physics layer out of the physics group".to_owned(),
            ),
            Error::AlreadyJoined => (
                StatusCode::FORBIDDEN,
                "already joined another map".to_owned(),
            ),
            Error::NotJoined => (StatusCode::FORBIDDEN, "not joined any map".to_owned()),
            Error::ImageInUse => (StatusCode::FORBIDDEN, "image in use".to_owned()),
            Error::EnvelopeInUse => (StatusCode::FORBIDDEN, "envelope in use".to_owned()),

            Error::ServerError(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.into_owned()),
            Error::ToDo => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "not implemented".to_owned(),
            ),
        };
        resp.into_response()
    }
}

fn serialize_display<T, S>(value: &T, serializer: S) -> Result<S::Ok, S::Error>
where
    T: Display,
    S: Serializer,
{
    serializer.collect_str(value)
}
