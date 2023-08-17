use image::RgbaImage;
use ndarray::Array2;
use thiserror::Error;
use twmap::*;
use vek::az::{OverflowingAs, OverflowingCast, UnwrappedAs, WrappingCast};
use vek::num_traits::Signed;
use vek::Extent2;

use std::fmt;
use std::mem;

#[derive(Debug)]
pub(crate) enum MapItem {
    Info,
    Image,
    Envelope,
    // Group,
    // Layer,
    // Sound,
    // Quad,
    // SoundSource,
    EnvPoint,
}

#[derive(Error, Debug)]
#[error(transparent)]
pub struct MapError(#[from] pub(crate) MapErr);

#[derive(Error, Debug)]
pub(crate) enum MapErr {
    #[error("In {item:?}{}{sub}", index.map(|i| format!(" at index {} -> ", i)).unwrap_or_default())]
    Recursive {
        item: MapItem,
        index: Option<usize>,
        sub: Box<MapErr>,
    },
    #[error(transparent)]
    Head(MapErrorKind),
}

impl From<MapErrorKind> for MapErr {
    fn from(err: MapErrorKind) -> Self {
        Self::Head(err)
    }
}

impl MapErr {
    pub(crate) fn with_index(mut self, i: usize) -> Self {
        if let Self::Recursive { index, .. } = &mut self {
            *index = Some(i);
        }
        self
    }

    pub(crate) fn with_type(self, item: MapItem) -> Self {
        Self::Recursive {
            item,
            index: None,
            sub: Box::new(self),
        }
    }
}

#[derive(Error, Debug)]
#[error(transparent)]
pub(crate) enum MapErrorKind {
    Teeworlds(#[from] TeeworldsError),
    DDNet(#[from] DDNetError),
    // Decompression(#[from] ZlibDecompressionError),
    // #[error("{amount} items of this type is too many, the maximum is {max}")]
    // Amount {
    //     amount: usize,
    //     max: usize,
    // },
    // #[error("Invalid image index {index} for a map with {len} images")]
    // ImageIndex {
    //     index: u16,
    //     len: usize,
    // },
    // #[error("Invalid sound index {index} for a map with {len} sounds")]
    // SoundIndex {
    //     index: u16,
    //     len: usize,
    // },
    // #[error("Invalid envelope index {index} for a map with {len} envelopes")]
    // EnvelopeIndex {
    //     index: u16,
    //     len: usize,
    // },
    // #[error("Envelope at index {index} referenced as a {expected:?} envelope is instead a {actual:?} envelope")]
    // EnvelopeKind {
    //     index: u16,
    //     expected: EnvelopeKind,
    //     actual: EnvelopeKind,
    // },
    String(#[from] StringError),
    I32Fit(#[from] ValueMaxError),
    Negative(#[from] NegativeError),
    Image(#[from] ImageError),
    Info(#[from] InfoError),
    // Sound(#[from] opus_headers::ParseError),
    Group(#[from] GroupError),
    Layer(#[from] LayerError),
    Tile(#[from] TileError),
    EnvPoint(#[from] EnvPointError),
}

#[derive(Error, Debug)]
pub enum DDNetError {
    #[error("DDNet does not support bezier curves")]
    Bezier,
}

#[derive(Error, Debug)]
pub enum TeeworldsError {
    #[error("Teeworlds does not support settings in the map info")]
    InfoSettings,
    // #[error("Teeworlds does not support {0:?} layers")]
    // DDNetLayer(LayerKind),
    // #[error("Teeworlds does not support automapper configs")]
    // TilesAutomapper,
    // #[error("Teeworlds does not support sounds")]
    // Sounds,
    #[error("Teeworlds does not support sound envelopes")]
    SoundEnv,
}

#[derive(Error, Debug)]
pub(crate) enum StringError {
    #[error("String is {len} bytes long while its maximum length is {max}")]
    Length { len: usize, max: usize },
    #[error("Name '{0}' should be sanitized, for example: {}", sanitize_filename::sanitize_with_options(.0, SANITIZE_OPTIONS))]
    Sanitization(String),
}

const SANITIZE_OPTIONS: sanitize_filename::Options = sanitize_filename::Options {
    windows: true,
    truncate: true,
    replacement: "",
};

const SANITIZE_CHECK_OPTIONS: sanitize_filename::OptionsForCheck =
    sanitize_filename::OptionsForCheck {
        windows: true,
        truncate: true,
    };

#[derive(Error, Debug)]
#[error("Value '{ident}' ({value}) is higher than its maximum value {max}")]
pub(crate) struct ValueMaxError {
    ident: &'static str,
    value: u64,
    max: i32,
}

fn check_max<T>(value: T, max: i32, ident: &'static str) -> Result<(), ValueMaxError>
where
    T: PartialOrd + WrappingCast<i64>,
    i32: OverflowingCast<T>,
{
    let (max, of) = max.overflowing_as::<T>();
    if of {
        return Ok(());
    }
    if value > max {
        Err(ValueMaxError {
            ident,
            value: 0,
            max: i32::MAX,
        })
    } else {
        Ok(())
    }
}

fn check_i32_fit<T>(value: T, ident: &'static str) -> Result<(), ValueMaxError>
where
    T: PartialOrd + WrappingCast<i64>,
    i32: OverflowingCast<T>,
{
    check_max(value, i32::MAX, ident)
}

#[derive(Error, Debug)]
#[error("Value '{ident}' ({value}) must not be negative")]
pub(crate) struct NegativeError {
    ident: &'static str,
    value: String,
}

fn check_non_negative<T>(value: T, ident: &'static str) -> Result<(), NegativeError>
where
    T: Signed + fmt::Display,
{
    if value.is_negative() {
        Err(NegativeError {
            ident,
            value: value.to_string(),
        })
    } else {
        Ok(())
    }
}

/// Passing a file extension triggers sanitization checks
fn check_string(s: &str, max: usize, file_extension: Option<&str>) -> Result<(), StringError> {
    if s.len() > max {
        return Err(StringError::Length { len: s.len(), max });
    }
    if let Some(ext) = file_extension {
        let mut filename = s.to_owned();
        filename.push('.');
        filename.push_str(ext);
        if !sanitize_filename::is_sanitized_with_options(&filename, SANITIZE_CHECK_OPTIONS) {
            return Err(StringError::Sanitization(filename));
        }
    }
    Ok(())
}

pub(crate) trait InternalMapChecking: Sized {
    const TYPE: MapItem;
    type State: Default;

    fn check_impl(&self, map: &TwMap) -> Result<(), MapErrorKind>;

    fn check_state_impl(&self, _: &TwMap, _state: &mut Self::State) -> Result<(), MapErrorKind> {
        Ok(())
    }

    fn check_recursive_impl(&self, _: &TwMap) -> Result<(), MapErr> {
        Ok(())
    }

    fn check(&self, map: &TwMap, state: &mut Self::State) -> Result<(), MapErr> {
        self.check_impl(map)
            .map_err(|err| MapErr::from(err).with_type(Self::TYPE))?;
        self.check_recursive_impl(map)
            .map_err(|err| err.with_type(Self::TYPE))?;
        self.check_state_impl(map, state)
            .map_err(|err| MapErr::from(err).with_type(Self::TYPE))?;
        Ok(())
    }

    fn check_state(_: Self::State) -> Result<(), MapErrorKind> {
        Ok(())
    }

    fn check_all(items: &[Self], map: &TwMap) -> Result<(), MapErr> {
        let mut state = Self::State::default();
        for (i, item) in items.iter().enumerate() {
            item.check(map, &mut state)
                .map_err(|err| err.with_index(i))?;
        }
        Self::check_state(state).map_err(|err| MapErr::from(err).with_type(Self::TYPE))?;
        Ok(())
    }
}

pub(crate) trait CheckData {
    fn check_data(&self) -> Result<(), MapErrorKind>;
}

#[derive(Error, Debug)]
#[error("Field {field}{} - {err}", .index.map(|i| format!(" with index {i}")).unwrap_or_default())]
pub(crate) struct InfoError {
    field: &'static str,
    index: Option<usize>,
    err: StringError,
}

impl InternalMapChecking for Info {
    const TYPE: MapItem = MapItem::Info;
    type State = ();

    fn check_impl(&self, map: &TwMap) -> Result<(), MapErrorKind> {
        let items = [
            (&self.author, Info::MAX_AUTHOR_LENGTH, "author", None),
            (&self.version, Info::MAX_VERSION_LENGTH, "version", None),
            (&self.credits, Info::MAX_CREDITS_LENGTH, "credits", None),
            (&self.license, Info::MAX_LICENSE_LENGTH, "license", None),
        ];
        for (s, max, field, index) in IntoIterator::into_iter(items).chain(
            self.settings
                .iter()
                .enumerate()
                .map(|(i, s)| (s, Info::MAX_SETTING_LENGTH, "setting", Some(i))),
        ) {
            check_string(s, max, None).map_err(|err| InfoError { field, index, err })?;
        }
        if map.version == Version::Teeworlds07 && !self.settings.is_empty() {
            return Err(TeeworldsError::InfoSettings.into());
        }
        Ok(())
    }
}

#[derive(Error, Debug)]
pub(crate) enum ImageError {
    #[error("Image '{name}' is not a valid external image for {version:?}")]
    InvalidExternal { name: String, version: Version },
    #[error("The length ({len}) of the data of this RGBA8 image with size {size} is invalid")]
    DataSize { size: Extent2<u32>, len: usize },
    #[error("Zero sized ({0})")]
    ZeroSized(Extent2<u32>),
}

impl InternalMapChecking for Image {
    const TYPE: MapItem = MapItem::Image;
    type State = ();

    fn check_impl(&self, map: &TwMap) -> Result<(), MapErrorKind> {
        check_string(self.name(), Image::MAX_NAME_LENGTH, Some("png"))?;
        if let Image::External(ex) = self {
            if !constants::is_external_name(&ex.name, map.version) {
                return Err(MapErrorKind::Image(ImageError::InvalidExternal {
                    name: ex.name.clone(),
                    version: map.version,
                }));
            }
        }
        if let Some(emb) = self.image() {
            emb.check_data()?;
        }
        Ok(())
    }
}

impl CheckData for CompressedData<RgbaImage, ImageLoadInfo> {
    fn check_data(&self) -> Result<(), MapErrorKind> {
        let size = match self {
            CompressedData::Compressed(_, _, info) => info.size,
            CompressedData::Loaded(image) => Extent2::new(image.width(), image.height()),
        };
        check_i32_fit(size.w, "width")?;
        check_i32_fit(size.h, "height")?;
        if size.w == 0 || size.h == 0 {
            return Err(ImageError::ZeroSized(size).into());
        }
        let pixel_count = u64::from(size.w) * u64::from(size.h);
        check_i32_fit(pixel_count, "pixel count")?;
        let data_size = pixel_count * 4; // RGBA8 image
        check_i32_fit(data_size, "image data size")?;
        match self {
            CompressedData::Compressed(_, len, ImageLoadInfo { size }) => {
                if *len != data_size.unwrapped_as::<usize>() {
                    return Err(ImageError::DataSize {
                        size: *size,
                        len: *len,
                    }
                    .into());
                }
            }
            CompressedData::Loaded(_) => {}
        }
        Ok(())
    }
}

impl InternalMapChecking for Envelope {
    const TYPE: MapItem = MapItem::Envelope;
    type State = ();

    fn check_impl(&self, map: &TwMap) -> Result<(), MapErrorKind> {
        check_string(self.name(), Envelope::MAX_NAME_LENGTH, None)?;
        let envelope_amount = match self {
            Envelope::Position(env) => env.points.len(),
            Envelope::Color(env) => env.points.len(),
            Envelope::Sound(env) => env.points.len(),
        };
        check_i32_fit(envelope_amount, "env point amount")?;
        if map.version == Version::Teeworlds07 && matches!(self, Envelope::Sound(_)) {
            return Err(TeeworldsError::SoundEnv.into());
        }
        Ok(())
    }

    fn check_recursive_impl(&self, map: &TwMap) -> Result<(), MapErr> {
        match self {
            Envelope::Position(env) => EnvPoint::check_all(&env.points, map),
            Envelope::Color(env) => EnvPoint::check_all(&env.points, map),
            Envelope::Sound(env) => EnvPoint::check_all(&env.points, map),
        }
    }
}

#[derive(Error, Debug)]
pub(crate) enum EnvPointError {
    #[error("Invalid curve kind ({0})")]
    InvalidCurve(i32),
    #[error("Wrong order, the last point was at {last} ms, this on is at {this} ms")]
    Order { this: i32, last: i32 },
}

impl<T> InternalMapChecking for EnvPoint<T> {
    const TYPE: MapItem = MapItem::EnvPoint;
    type State = i32;

    fn check_impl(&self, map: &TwMap) -> Result<(), MapErrorKind> {
        check_non_negative(self.time, "time stamp")?;
        if let CurveKind::Unknown(n) = self.curve {
            return Err(EnvPointError::InvalidCurve(n).into());
        }
        if map.version == Version::DDNet06 && matches!(self.curve, CurveKind::Bezier(_)) {
            return Err(DDNetError::Bezier.into());
        }
        Ok(())
    }

    fn check_state_impl(&self, _: &TwMap, last_time: &mut i32) -> Result<(), MapErrorKind> {
        if self.time < *last_time {
            return Err(EnvPointError::Order {
                this: self.time,
                last: *last_time,
            }
            .into());
        }
        *last_time = self.time;
        Ok(())
    }
}

#[derive(Error, Debug)]
pub(crate) enum GroupError {
    // #[error("No physics group")]
    // NoPhysicsGroup,
    // #[error("There must be only one physics group")]
    // SecondPhysicsGroup,
    // #[error("No game layer in physics group")]
    // NoGameLayer,
    // #[error("The physics group '{0}' should be called 'Game' instead")]
    // PhysicsName(String),
    // #[error("The clipping values of the physics group are changed")]
    // PhysicsClip,
    // #[error("The parallax values of the physics group are changed")]
    // PhysicsParallax,
    // #[error("The offset values of the physics group are changed")]
    // PhysicsOffset,
}

#[derive(Error, Debug)]
pub(crate) enum LayerError {
    // #[error("Invalid layer kind: {0:?}")]
    // InvalidKind(InvalidLayerKind),
    #[error("Width and height must be at least 2")]
    TooSmall,
    // #[error("Images used by tiles layers must have width and height be divisible by 16")]
    // ImageDimensions,
    // #[error("Automapper seed ({0}) must be below 1,000,000,000")]
    // AutomapperSeed(u32),
    // #[error("Second {0:?} layer")]
    // DuplicatePhysics(LayerKind),
    // #[error("The physics layers have different shapes")]
    // DifferentPhysicsShapes,
    #[error("0.7 compressed tile data length must be a multiple of 4")]
    CompressedSize,
    #[error("The tile data size doesn't match with the layer dimensions")]
    TilesDataSize,
    // #[error("0.7 tilemap decompression failed")]
    // TeeworldsCompression,
}

#[derive(Error, Debug)]
#[error("Tile at x: {x}, y: {y} - {err}")]
pub(crate) struct TileError {
    x: usize,
    y: usize,
    err: TileErrorKind,
}

#[derive(Error, Debug)]
pub enum TileErrorKind {
    // #[error("Skip byte of tile is {0} instead of zero")]
    // TileSkip(u8),
    // #[error("Unused byte of tile is {0} instead of zero")]
    // TileUnused(u8),
    // #[error("Unknown tile flags used, flags: {:#010b}", .0)]
    // UnknownTileFlags(u8),
    // #[error("Opaque tile flag used in physics layer")]
    // OpaqueTileFlag,
    // #[error("Unused byte of speedup is {0} instead of zero")]
    // SpeedupUnused(u8),
    // #[error("Angle of speedup is {0}, but should be between 0 and (exclusive) 360")]
    // SpeedupAngle(i16),
}

pub trait TileChecking {
    fn check(&self) -> Result<(), TileErrorKind> {
        Ok(())
    }
}

impl<T: TileChecking> CheckData for CompressedData<Array2<T>, TilesLoadInfo> {
    fn check_data(&self) -> Result<(), MapErrorKind> {
        let size = self.shape();
        check_i32_fit(size.w, "width")?;
        check_i32_fit(size.h, "height")?;
        let tile_count = size.w.unwrapped_as::<u64>() * size.h.unwrapped_as::<u64>();
        check_i32_fit(tile_count, "tile count")?;
        let tile_size = mem::size_of::<T>().unwrapped_as::<u64>();
        let tile_data_size = tile_count * tile_size;
        check_i32_fit(tile_data_size, "tilemap data size")?;
        if size.w < 2 || size.h < 2 {
            return Err(LayerError::TooSmall.into());
        }
        match self {
            CompressedData::Loaded(tiles) => {
                for ((y, x), tile) in tiles.indexed_iter() {
                    tile.check().map_err(|err| TileError { x, y, err })?;
                }
            }
            CompressedData::Compressed(_, data_size, info) => {
                if info.compression {
                    if data_size % 4 != 0 {
                        return Err(LayerError::CompressedSize.into());
                    }
                } else if tile_data_size.unwrapped_as::<usize>() != *data_size {
                    return Err(LayerError::TilesDataSize.into());
                }
            }
        }
        Ok(())
    }
}
