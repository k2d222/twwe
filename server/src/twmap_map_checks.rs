use twmap::{checks::EnvPointErrorKind, EnvPoint};

// because those implementations are private in twmap, I copy-pasted them here.

#[derive(Debug)]
pub struct EnvPointError {
    pub kind: EnvPointErrorKind,
    pub index: usize,
}

pub fn check_env_points<T: Copy>(points: &[EnvPoint<T>]) -> Result<(), EnvPointError> {
    use EnvPointErrorKind::*;
    if let Some(point) = points.first() {
        if point.time < 0 {
            return Err(EnvPointError {
                kind: NegativeTimeStamp(point.time),
                index: 0,
            });
        }
    }

    for (i, pair) in points.windows(2).enumerate() {
        if pair[0].time > pair[1].time {
            return Err(EnvPointError {
                kind: Ordering(pair[0].time, pair[1].time),
                index: i + 1,
            });
        }
    }

    use twmap::CurveKind::*;
    for (i, point) in points.iter().enumerate() {
        match point.curve {
            Step | Linear | Fast | Smooth | Slow | Bezier(_) => {}
            Unknown(n) => {
                return Err(EnvPointError {
                    kind: UnknownCurveType(n),
                    index: i,
                })
            }
        }
    }
    Ok(())
}
