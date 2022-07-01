/// stolen private functions from twmap.

/// up - down - left - right
fn ndarray_shrink<T: Default + Clone>(
    ndarray: &Array2<T>,
    up: usize,
    down: usize,
    left: usize,
    right: usize,
) -> Option<Array2<T>> {
    let height = ndarray.nrows().checked_sub(up)?.checked_sub(down)?;
    let width = ndarray.ncols().checked_sub(left)?.checked_sub(right)?;
    Some(
        ndarray
            .slice(s![up..up + height, left..left + width])
            .to_owned(),
    )
}

pub fn layer_shrink(self, up: usize, down: usize, left: usize, right: usize) -> Option<Layer> {
    use Layer::*;
    Some(match self {
        Game(l) => Game(l.checked_shrink(up, down, left, right)?),
        Tiles(l) => Tiles(l.checked_shrink(up, down, left, right)?),
        Quads(mut l) => {
            l.reposition(
                i32::try_from(up).ok()?.checked_mul(-32 * 1024)?,
                i32::try_from(left).ok()?.checked_mul(-32 * 1024)?,
            )?;
            Quads(l)
        }
        Front(l) => Front(l.checked_shrink(up, down, left, right)?),
        Tele(l) => Tele(l.checked_shrink(up, down, left, right)?),
        Speedup(l) => Speedup(l.checked_shrink(up, down, left, right)?),
        Switch(l) => Switch(l.checked_shrink(up, down, left, right)?),
        Tune(l) => Tune(l.checked_shrink(up, down, left, right)?),
        Sounds(mut l) => {
            l.reposition(
                i32::try_from(up).ok()?.checked_mul(-32 * 1024)?,
                i32::try_from(left).ok()?.checked_mul(-32 * 1024)?,
            )?;
            Sounds(l)
        }
        Invalid(l) => Invalid(l),
    })
}

fn ndarray_extend<T: Default + Copy>(
    ndarray: &Array2<T>,
    up: usize,
    down: usize,
    left: usize,
    right: usize,
) -> Array2<T> {
    let old_height = ndarray.nrows();
    let new_height = old_height
        .checked_add(up)
        .unwrap()
        .checked_add(down)
        .unwrap();
    let old_width = ndarray.ncols();
    let new_width = old_width
        .checked_add(left)
        .unwrap()
        .checked_add(right)
        .unwrap();
    let mut new_ndarray = Array2::default((new_height, new_width));
    // copy old layer into the new one
    new_ndarray
        .slice_mut(s![up..up + ndarray.nrows(), left..left + ndarray.ncols()])
        .assign(ndarray);
    // copy the corner of the old ndarray into the corner region of the new one
    let corners = vec![
        ((0..up, 0..left), ndarray[(0, 0)]), // top left
        (
            (0..up, new_width - right..new_width),
            ndarray[(0, old_width - 1)],
        ), // top right
        (
            (new_height - down..new_height, 0..left),
            ndarray[(old_height - 1, 0)],
        ), // bottom
        (
            (new_height - down..new_height, new_width - right..new_width),
            ndarray[(old_height - 1, old_width - 1)],
        ),
    ];
    for ((y_slice, x_slice), corner) in corners {
        new_ndarray
            .slice_mut(s![y_slice, x_slice])
            .map_inplace(|e| *e = corner);
    }
    // copy the old outermost rows/columns into the new area
    let vertical_edge_ranges = vec![
        (ndarray.row(0), (0..up, left..left + old_width)), // upper edge
        (
            ndarray.row(old_height - 1),
            (up + old_height..new_height, left..left + old_width),
        ), // lower edge
    ];
    let horizontal_edge_ranges = vec![
        (ndarray.column(0), (up..up + old_height, 0..left)), // left edge
        (
            ndarray.column(old_width - 1),
            (up..up + old_height, left + old_width..new_width),
        ), // right edge
    ];
    for (edge, (y_slice, x_slice)) in vertical_edge_ranges {
        new_ndarray
            .slice_mut(s![y_slice, x_slice])
            .rows_mut()
            .into_iter()
            .for_each(|mut row| row.assign(&edge))
    }
    for (edge, (y_slice, x_slice)) in horizontal_edge_ranges {
        new_ndarray
            .slice_mut(s![y_slice, x_slice])
            .columns_mut()
            .into_iter()
            .for_each(|mut row| row.assign(&edge))
    }
    new_ndarray
}

pub fn layer_grow<T: TileMapLayer>(
    layer: &mut T,
    up: usize,
    down: usize,
    left: usize,
    right: usize,
) {
    *layer.tiles_mut().unwrap_mut() =
        extend_ndarray(layer.tiles().unwrap_ref(), up, down, left, right);
}

pub fn layer_resize<T: TileMapLayer>(
    layer: &mut T,
    up: usize,
    down: usize,
    left: usize,
    right: usize,
) {
    layer_grow(layer, min(up), down, left, right)
}
