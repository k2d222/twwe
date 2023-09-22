use std::{fmt::Display, path::Path, sync::OnceLock};

use regex::Regex;
use serde::{Deserialize, Deserializer, Serializer};
use serde_with::serde_conv;

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

pub(crate) fn check_map_path(fname: &str) -> bool {
    // COMBAK: this is too restrictive, but proper sanitization is hard.
    // TODO: add tests
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        let c1 = r"[:alnum:]\(\)\[\]_,\-"; // safe 1st char in word
        let cn = r"[:alnum:]\(\)\[\]_,\-\s\."; // safe non-first char in word
        let max_len = 40; // max file name or dir name
        let word = format!(r"[{}][{}]{{0,{}}}", c1, cn, max_len - 1);
        Regex::new(&format!(r"^({}/)*({})$", word, word)).unwrap()
    });
    re.is_match(fname)
}

pub(crate) fn check_file_name(name: &str) -> bool {
    // this is a very primitive sanitization to prevent path traversal attacks.
    !(name.chars().any(std::path::is_separator) || name.starts_with(".") || name.is_empty())
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
            .find(|(str, kind)| *str == ext)
            .map(|(_, ext)| ext)
            .copied()
    } else {
        None
    }
}
