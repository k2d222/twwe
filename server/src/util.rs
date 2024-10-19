use std::path::Path;

use crate::{
    protocol::AutomapperKind,
    twmap_map_edit::{extend_layer, shrink_layer},
};

pub(crate) fn timestamp_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_secs()
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

    if !(2..=10000).contains(&width) {
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

    if !(2..=10000).contains(&height) {
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
