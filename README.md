# Teeworlds Web Editor (TWWE)

![TWWE on Sunny Side Up by Ravie.](screenshots/sunny.png)

Teeworlds / DDraceNetwork map editor. Online and collaborative, just like the game.

The editor is available at [tw.thissma.fr](https://tw.thissma.fr). ~~A DDNet server is hosted with the name `twwe -- tw.thissma.fr` to test the maps on that website with auto-reload~~ (currently unavailable).

Alternatively, download TWWE desktop app from the [releases page](https://github.com/k2d222/twwe/releases).

## Development Status (Feb. 2025)

**2025 update**: The app is now mostly compatible with ddnet editor. Developpment has now stopped, but the software is close to complete and stable. I will keep maintaining the website and fix bugs. Most likely no new features will be added.

### DDNet Compatibility

The table below shows the feature parity with ddnet's in-game map editor.

|                 | Support | Comment                                                                               |
|-----------------|---------|---------------------------------------------------------------------------------------|
| Groups          | ✅      |                                                                                       |
| Layers          | ✅      |                                                                                       |
| Images          | ✅      | Image tab planned                                                                     |
| Envelopes       | ✅      | UX needs improvement                                                                  |
| Sounds          | ❌      | Not planned                                                                           |
| Map details     | ✅      |                                                                                       |
| Tiles           | 🆗      | Missing: Shift tiles, Auto game tiles                                                 |
| Quads           | 🆗      | Missing: Slice, Square, Align, Aspect ratio                                           |
| Automappers     | ✅      |                                                                                       |
| Server settings | 🆗      | Better support for server settings planned (#77)                                      |
| Misc. Tools     | ❌      | Missing: Append map, Allow/Remove unused, Destructive, Refocus, Goto, Place border    |
| Misc. display   | ❌      | Missing: Tile info, Grid, Proof, High detail, Zoom                                    |

### Unique features

 * Collaborative editing
 * Automapper edit and live-preview
 * Rules++ support (experimental)

### Roadmap to 1.0

 - [x] Desktop client
 - [x] Server bridging
 - [ ] sync with ddnet server / reload-on-save (#21)
 - [x] Map passwords and permissions
 - [x] Undo / Redo history (#31)
 - [ ] More tools: Proof, Quad tools
 - [x] Bug squashing

## Usage

Explore the UI, it resembles the ddnet editor for the most part.

### Using the website

You can use this editor by simply going to [tw.thissma.fr](https://tw.thissma.fr). You should see the default server with a bunch of maps that others created. For the default server, a ddnet server is also running with name `twwe -- tw.thissma.fr` on which you can test your map immediately. The server is reloaded each time the map is saved.

### Using the standalone app

Alternatively, you can [install the app](https://github.com/k2d222/twwe/releases) to use the editor offline. On startup, the editor will look for maps in your ddnet data folder.

With this app you can enable sharing your map (top-right button), which gives access to you map to other users via one of the servers.

### Using the server

Download the precompiled binaries and the static files from the [release page](https://github.com/k2d222/twwe/releases).

Run the server with `twwe-server --static <path_to_static_folder>`. By default, it will serve the maps present in your ddnet data folder (the same maps as the in-game editor).

Open <http://localhost:16800> to access the editor.

### Key/Mouse bindings

| Key                                                      | Action                                                           |
|----------------------------------------------------------|------------------------------------------------------------------|
| <kbd>Wheel</kbd><kbd>Up / Down</kbd>                     | Zoom in / out                                                    |
| <kbd>W / A / S / D / ↑ / ↓ / ← / → </kbd>                | Move around                                                      |
| <kbd>Ctrl</kbd><kbd>🖱️ Left</kbd><br/><kbd>🖱️ Middle</kbd> | Pan around                                                       |
| <kbd>🖱️ Left</kbd>                                        | Copy tiles (empty selection)<br/>Paste tiles                     |
| <kbd>Shift</kbd><kbd>🖱️ Left</kbd>                        | Delete tiles (empty selection)<br/>Fill tiles (repeat selection) |
| <kbd>🖱️ Right</kbd>                                       | Clear selection                                                  |
| <kbd>Space</kbd> (hold)                                  | Open the tile picker                                             |
| <kbd>H / N</kbd>                                         | Mirror selection horizontally                                    |
| <kbd>V / M</kbd>                                         | Mirror selection vertically                                      |
| <kbd>R</kbd>                                             | Rotate selection clockwise                                       |
| <kbd>Shift</kbd><kbd>R</kbd><br/><kbd>T</kbd>            | Rotate selection counter-clockwise                               |
| <kbd>Tab</kbd>                                           | Show / Hide sidebars                                             |
| <kbd>Ctrl</kbd><kbd>S</kbd>                              | Save map<br/>Save automapper                                     |
| <kbd>Ctrl</kbd><kbd>P</kbd>                              | Save map<br/>Preview automapper                                  |

Additionally: 
 * <kbd>🖱️ Right</kbd> opens context-menus on quad points, envelope points and envelope lines.
 * You can select multiple layers with `shift`.
 * The Save button saves the map on the disk on the server side. If a teeworlds server using this map is running, enter `reload` in the server console to update it.

## Building and Running

The code is split into a client, a desktop and a server part. The client generates a static site (html, js, …) that you can host wherever you want or even run locally. The server is a HTTP and WebSocket server that the client connects to. The maps are stored on the server machine.


### Server

The server is available on `crates.io`: `cargo install twwe-server`. Or can be compiled manually.

Run the server with `twwe-server --maps <path_to_maps_dir>`.

Use the first command-line argument to change address and port e.g. `twwe-server localhost:3333 --maps ...` to run locally on port 3333.

Use the `--cert` and `--key` arguments to enable TLS support for websocket. They must point to your PEM certificate and private key.

Use the `--rpp <path>` argument to enable Rules++ support (experimental). `<path>` must be the **absolute** path to a directory containing: `rpp` (the rpp executable), `base.r` and `base.p`.

#### Limits

The HTTP server is rate-limited per IP. It allows bursts of 100 requests and then 500ms between requests. It can be configured with `--max-http-bursts <amount>` and `--http-ratelimit-delay <ms>`.

The `--max-maps <amount>` argument limits the number of maps created by users. The `--max-map-size <MiB>` argument limits the size of each map file.

#### Server bridging

With the desktop client, it is possible to connect a "bridge" to a remote server (e.g. pi.thissma.fr:16900), to allow other users to access and edit a map on your hard drive from the internet. This feature has security implications for both the server and the client, so make sure you understand them before enabling bridging.

 * For the client, enabling bridge essentially gives the internet a direct access to the map file on your computer. Anyone who has access to the passphrase can do damage to your map file. Make sure you make a backup and trust the people with whom you share the passphrase.
 * For the server, bridging initiates a connection to an arbitrary websocket url chosen by the client. Make sure your server may not leak the local network or connect to unwanted networks.

The `bridge_out` and `bridge_in` feature flags guard this feature and are disabled by default. You can enable them with `cargo run --feature bridge_in -- ...`.

### Client

Copy the `env.example` file to `.env` or `.env.production` and configure the websocket server url.

Have [npm](https://www.npmjs.com/) installed and run `npm install` in the client directory to install dependencies, `npm run dev` to run a dev server and `npm run build` to produce a release in the `dist` directory.

Note: the client is written in non-strict Typescript. Typescript is only used for IDE hints and documentation, but ignored by the [Vite](https://vitejs.dev/guide/features.html#typescript) bundler. Use `npm run check` to run Typescript checks on the project.

### Desktop

The desktop client is a [Tauri](https://tauri.app/) web-app that you can install and enables editing your local map files like the default editor. You can also enable sharing your maps over the internet (read [Server bridging](#server-bridging)).

The app opens a localhost server on port 16800. It looks for maps in the "standard" ddnet folders (see storage.cfg: $USERDIR, $DATADIR and $CURRENTDIR).

Binaries can be found in the [releases page](https://github.com/k2d222/twwe/releases).

## License

This work is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). You are free to use and modify the code and executables under some conditions. Please contact me if the license doesn't fit your needs.
