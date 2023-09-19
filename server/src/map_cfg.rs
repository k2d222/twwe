use serde::{Deserialize, Serialize};

#[derive(PartialEq, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MapAccess {
    Public,
    Unlisted,
}

impl Default for MapAccess {
    fn default() -> Self {
        MapAccess::Public
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct MapConfig {
    pub name: String,
    pub access: MapAccess,
}
