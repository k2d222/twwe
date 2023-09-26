use base64::Engine;
use serde::{de::Error, de::Unexpected, Deserialize, Serialize};

// TODO: use serde_with's base64?
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Base64(pub Vec<u8>);

impl Serialize for Base64 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let str = base64::engine::general_purpose::STANDARD.encode(&self.0);
        serializer.serialize_str(&str)
    }
}

impl<'de> Deserialize<'de> for Base64 {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let str: &str = Deserialize::deserialize(deserializer)?;
        base64::engine::general_purpose::STANDARD
            .decode(str)
            .map(Base64)
            .map_err(|_| D::Error::invalid_value(Unexpected::Str(str), &"a base64-encoded string"))
    }
}
