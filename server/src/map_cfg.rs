use serde::{Deserialize, Serialize};

#[derive(Default, PartialEq, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MapAccess {
    #[default]
    Public,
    Unlisted,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct MapConfig {
    pub name: String,
    pub access: MapAccess,
}
