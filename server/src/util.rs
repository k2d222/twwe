use std::{fmt::Display, path::Path, sync::OnceLock};

use regex::Regex;
use serde::Serializer;

use crate::{
    protocol::AutomapperKind,
    twmap_map_edit::{extend_layer, shrink_layer},
};

// TODO: use serde_with's DisplayFromStr?
pub(crate) fn serialize_display<T, S>(value: &T, serializer: S) -> Result<S::Ok, S::Error>
where
    T: Display,
    S: Serializer,
{
    serializer.collect_str(value)
}

pub(crate) mod serialize_partial_index {
    use serde::{de, Deserialize, Deserializer, Serializer};

    pub(crate) fn serialize<S: Serializer>(
        opt_index: &Option<Option<u16>>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        match opt_index {
            None => serializer.serialize_unit(),
            Some(None) => serializer.serialize_none(),
            Some(Some(v)) => serializer.serialize_some(&v.to_string()),
        }
    }

    pub(crate) fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Option<Option<u16>>, D::Error> {
        let opt_name: Option<String> = Deserialize::deserialize(deserializer)?;
        let opt_index = match opt_name {
            Some(opt_name) => opt_name
                .split('_')
                .next()
                .ok_or(de::Error::invalid_value(
                    de::Unexpected::Str(&opt_name),
                    &"a mapdir-compatible resource index",
                ))?
                .parse::<u16>()
                .map(|v| Some(Some(v)))
                .map_err(de::Error::custom)?,
            None => Some(None),
        };
        Ok(opt_index)
    }
}

pub(crate) mod macros {
    macro_rules! apply_partial {
        ($src:expr => $tgt:expr, $($field:ident),*) => {{
            $(
                if let Some($field) = $src.$field {
                    $tgt.$field = $field;
                }
            )*
        }};
    }

    pub(crate) use apply_partial;
}

// taken as-is from twmap
pub(crate) trait ViewAsBytes: structview::View {
    fn into_boxed_bytes(boxed_slice: Box<[Self]>) -> Box<[u8]> {
        let len = boxed_slice.len() * std::mem::size_of::<Self>();
        let ptr = Box::into_raw(boxed_slice);
        unsafe {
            let byte_slice = std::slice::from_raw_parts_mut(ptr as *mut u8, len);
            Box::from_raw(byte_slice)
        }
    }
}
impl<T: structview::View> ViewAsBytes for T {}

pub(crate) fn check_file_name(name: &str) -> bool {
    // this is a very primitive sanitization to prevent path traversal attacks.
    !(name.chars().any(std::path::is_separator) || name.starts_with('.') || name.is_empty())
}

pub(crate) fn set_layer_width<T: twmap::TilemapLayer>(
    layer: &mut T,
    width: usize,
) -> Result<(), &'static str> {
    let old_width = layer.tiles().shape().w as isize;
    let diff = width as isize - old_width;

    if width < 2 || width > 10000 {
        return Err("invalid layer dimensions");
    }

    if diff > 0 {
        extend_layer(layer, 0, 0, 0, diff as usize);
    } else if diff < 0 {
        shrink_layer(layer, 0, 0, 0, -diff as usize);
    }

    Ok(())
}

pub(crate) fn set_layer_height<T: twmap::TilemapLayer>(
    layer: &mut T,
    height: usize,
) -> Result<(), &'static str> {
    let old_height = layer.tiles().shape().h as isize;
    let diff = height as isize - old_height;

    if height < 2 || height > 10000 {
        return Err("invalid layer dimensions");
    }

    if diff > 0 {
        extend_layer(layer, 0, diff as usize, 0, 0);
    } else if diff < 0 {
        shrink_layer(layer, 0, -diff as usize, 0, 0);
    }

    Ok(())
}

pub(crate) fn is_automapper(path: &Path) -> Option<AutomapperKind> {
    let extensions = &[
        ("rules", AutomapperKind::DDNet),
        ("rpp", AutomapperKind::RulesPP),
        ("json", AutomapperKind::Teeworlds),
    ];

    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        extensions
            .iter()
            .find(|(str, _kind)| *str == ext)
            .map(|(_, ext)| ext)
            .copied()
    } else {
        None
    }
}
