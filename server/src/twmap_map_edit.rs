use twmap::{
    edit::{edge_extend_ndarray, shrink_ndarray},
    Point, TilemapLayer,
};

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
        Point { x: left, y: up },
        Point { x: right, y: down },
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
        Point { x: left, y: up },
        Point { x: right, y: down },
    )
    .unwrap();
}
