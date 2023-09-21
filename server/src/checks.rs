use crate::{error::Error, protocol::*, twmap_map_checks::InternalMapChecking};

pub(crate) trait PartialCheck {
    fn check_self(&self) -> Result<(), Error> {
        Ok(())
    }
    fn check_map(&self, _map: &twmap::TwMap) -> Result<(), Error> {
        Ok(())
    }
}

impl PartialCheck for PartialInfo {
    fn check_self(&self) -> Result<(), Error> {
        macro_rules! check_length {
            ($field:expr, $name:literal, $max:ident) => {{
                if let Some(field) = $field {
                    if field.len() > twmap::Info::$max {
                        return Err(Error::FieldTooLong($name));
                    }
                }
            }};
        }

        check_length!(&self.author, "author", MAX_AUTHOR_LENGTH);
        check_length!(&self.author, "version", MAX_VERSION_LENGTH);
        check_length!(&self.author, "credits", MAX_CREDITS_LENGTH);
        check_length!(&self.author, "license", MAX_LICENSE_LENGTH);

        if let Some(settings) = &self.settings {
            for setting in settings.iter() {
                if setting.len() > twmap::Info::MAX_SETTING_LENGTH {
                    return Err(Error::FieldTooLong("setting"));
                }
            }
        }

        Ok(())
    }
}

impl PartialCheck for PartialEnvelope {
    fn check_map(&self, map: &twmap::TwMap) -> Result<(), Error> {
        macro_rules! check_env {
            ($env:ident) => {{
                if let Some(name) = &$env.name {
                    if name.len() > twmap::Envelope::MAX_NAME_LENGTH {
                        return Err(Error::FieldTooLong("name"));
                    }
                }
                if let Some(points) = &$env.points {
                    if points.len() > i32::MAX as usize {
                        return Err(Error::MaxEnvPoints);
                    }
                    twmap::EnvPoint::check_all(points, &map)
                        .map_err(|e| Error::MapError(e.to_string()))?;
                }
            }};
        }

        match self {
            PartialEnvelope::Position(part_env) => check_env!(part_env),
            PartialEnvelope::Color(part_env) => check_env!(part_env),
            PartialEnvelope::Sound(part_env) => check_env!(part_env),
        }

        Ok(())
    }
}

impl<T: Copy> PartialCheck for PartialEnv<T> {
    fn check_self(&self) -> Result<(), Error> {
        if let Some(name) = &self.name {
            if name.len() > twmap::Envelope::MAX_NAME_LENGTH {
                return Err(Error::FieldTooLong("name"));
            }
        }
        if let Some(points) = &self.points {
            if points.len() > i32::MAX as usize {
                return Err(Error::MaxEnvPoints);
            }
        }

        Ok(())
    }

    fn check_map(&self, map: &twmap::TwMap) -> Result<(), Error> {
        if let Some(points) = &self.points {
            twmap::EnvPoint::check_all(points, &map).map_err(|e| Error::MapError(e.to_string()))?;
        }
        Ok(())
    }
}

impl PartialCheck for PartialGroup {
    fn check_self(&self) -> Result<(), Error> {
        if let Some(name) = &self.name {
            if name.len() > twmap::Group::MAX_NAME_LENGTH {
                return Err(Error::FieldTooLong("name"));
            }
        }
        if let Some(clip) = &self.clip {
            if clip.w < 0 || clip.h < 0 {
                return Err(Error::InvalidClip);
            }
        }

        Ok(())
    }

    fn check_map(&self, _map: &twmap::TwMap) -> Result<(), Error> {
        Ok(())
    }
}

impl PartialCheck for PartialLayer {
    fn check_self(&self) -> Result<(), Error> {
        match self {
            PartialLayer::Game(layer) => layer.check_self()?,
            PartialLayer::Tiles(layer) => layer.check_self()?,
            PartialLayer::Quads(layer) => layer.check_self()?,
            PartialLayer::Front(layer) => layer.check_self()?,
            PartialLayer::Tele(layer) => layer.check_self()?,
            PartialLayer::Speedup(layer) => layer.check_self()?,
            PartialLayer::Switch(layer) => layer.check_self()?,
            PartialLayer::Tune(layer) => layer.check_self()?,
        }
        Ok(())
    }

    fn check_map(&self, map: &twmap::TwMap) -> Result<(), Error> {
        match self {
            PartialLayer::Game(layer) => layer.check_map(map)?,
            PartialLayer::Tiles(layer) => layer.check_map(map)?,
            PartialLayer::Quads(layer) => layer.check_map(map)?,
            PartialLayer::Front(layer) => layer.check_map(map)?,
            PartialLayer::Tele(layer) => layer.check_map(map)?,
            PartialLayer::Speedup(layer) => layer.check_map(map)?,
            PartialLayer::Switch(layer) => layer.check_map(map)?,
            PartialLayer::Tune(layer) => layer.check_map(map)?,
        }

        Ok(())
    }
}

impl PartialCheck for PartialTilesLayer {
    fn check_self(&self) -> Result<(), Error> {
        if let Some(name) = &self.name {
            if name.len() > twmap::Layer::MAX_NAME_LENGTH {
                return Err(Error::FieldTooLong("name"));
            }
        }

        Ok(())
    }

    fn check_map(&self, map: &twmap::TwMap) -> Result<(), Error> {
        if let Some(Some(index)) = self.color_env {
            let env = map
                .envelopes
                .get(index as usize)
                .ok_or(Error::EnvelopeNotFound)?;
            if !matches!(env, twmap::Envelope::Color(_)) {
                return Err(Error::WrongEnvelopeType);
            }
        }
        if let Some(Some(index)) = self.image {
            let img = map.images.get(index as usize).ok_or(Error::ImageNotFound)?;
            if !img.for_tilemap() {
                return Err(Error::WrongTilesImage);
            }
        }
        if let Some(am_cfg) = &self.automapper_config {
            if am_cfg.seed > 1_000_000_000 {
                return Err(Error::Invalid("automapper config seed"));
            }
        }

        Ok(())
    }
}

impl PartialCheck for PartialQuadsLayer {
    fn check_self(&self) -> Result<(), Error> {
        if let Some(name) = &self.name {
            if name.len() > twmap::Layer::MAX_NAME_LENGTH {
                return Err(Error::FieldTooLong("name"));
            }
        }

        Ok(())
    }

    fn check_map(&self, map: &twmap::TwMap) -> Result<(), Error> {
        if let Some(Some(index)) = self.image {
            if index as usize >= map.images.len() {
                return Err(Error::ImageNotFound);
            }
        }

        Ok(())
    }
}

impl PartialCheck for PartialPhysicsLayer {}

impl PartialCheck for twmap::Quad {
    fn check_self(&self) -> Result<(), Error> {
        Ok(())
    }

    fn check_map(&self, map: &twmap::TwMap) -> Result<(), Error> {
        if let Some(index) = self.position_env {
            let env = map
                .envelopes
                .get(index as usize)
                .ok_or(Error::EnvelopeNotFound)?;
            if !matches!(env, twmap::Envelope::Position(_)) {
                return Err(Error::WrongEnvelopeType);
            }
        }

        if let Some(index) = self.color_env {
            let env = map
                .envelopes
                .get(index as usize)
                .ok_or(Error::EnvelopeNotFound)?;
            if !matches!(env, twmap::Envelope::Color(_)) {
                return Err(Error::WrongEnvelopeType);
            }
        }

        Ok(())
    }
}
