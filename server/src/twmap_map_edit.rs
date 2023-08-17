use twmap::{
    edit::{edge_extend_ndarray, shrink_ndarray},
    TilemapLayer,
};
use vek::Extent2;

// because those implementations are private in twmap, I copy-pasted them here.

pub fn extend_layer<T: TilemapLayer>(
    layer: &mut T,
    up: usize,
    down: usize,
    left: usize,
    right: usize,
) {
    *layer.tiles_mut().unwrap_mut() = edge_extend_ndarray(
        layer.tiles().unwrap_ref(),
        Extent2 { w: left, h: up },
        Extent2 { w: right, h: down },
    )
    .unwrap();
}

pub fn shrink_layer<T: TilemapLayer>(
    layer: &mut T,
    up: usize,
    down: usize,
    left: usize,
    right: usize,
) {
    *layer.tiles_mut().unwrap_mut() = shrink_ndarray(
        layer.tiles().unwrap_ref(),
        Extent2 { w: left, h: up },
        Extent2 { w: right, h: down },
    )
    .unwrap();
}
