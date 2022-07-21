# Teeworlds Web Editor (TWWE)

Teeworlds / DDraceNetwork map editor. Online and collaborative, just like the game.

A server is (or will be) hosted at [tw.thissma.fr](https://tw.thissma.fr). Please don't DDos me. Note: try http if https is not working.


## Status

Able to preview and edit tiles layer just like the original editor. It primarily focuses on the ddnet flavour of teeworlds and supports the physics layers (switch, front, tune, speedup, tele).

Able to render quads layers, but not edit them yet.

No support for envelopes and sound layers.

Bugs are expected. It is advised to save regularly and if a bug happens, log out and back in to roll back to the previous save.
Maps corruptions are very unlikely to happen though thanks to @patiga's [twmap library](https://gitlab.com/Patiga/twmap)

## Usage

Many features are missing. Currently you can only edit tiles in tiles layers. Use mouse wheel to zoom in/out, hold and drag any mouse button to move around and click or press spacebar to place a tile under the cursor.

Select the active tile by clicking the square at the bottom.

Select the active layer by clicking one of the radio buttons on the left bar.

The Save button saves the map on the disk on the server side. If a teeworlds server using this map is running, enter `reload` in the server console to update it.

## Building and Running

### Server

Have rust and cargo installed. And create a server/maps/ directory with your .map files in it.

run with `RUST_LOG=debug cargo run --release` to run in release mode with debugging info printed to stdout.

Use the first command-line argument to change port e.g. `cargo run localhost:3333` to run locally on port 3333.

Use the `--cert` and `--key` flags to enable TLS support for websocket. They must point to your PEM certificate and private key.

### Client

Copy the `env.example` file to `.env.production` and configure the websocket server url. For a TLS-encrypted websocket, the url scheme is `wss://`. Otherwise, use `ws://`.

Have npm installed and run `npm install` in the client directory to install dependencies, `npm run dev` to run a dev server and `npm run build` to produce a release in the `dist` directory.

Note: the client is written in non-strict Typescript. Typescript is only used for IDE hints and documentation, but ignored by the [Vite](https://vitejs.dev/guide/features.html#typescript) bundler.
Use `npm run check` to run Typescript checks on the project.

## Roadmap

Future short-term goals are as follows:

 - [x] Improve **concurrency** on the server. ~Currently, the whole server state is protected by a single mutex which means there cannot be any simultaneous requests.~
 - [x] Allow editing multiple maps on a single server. The server will advertise which maps are available.
 - [x] Allow users to create, upload and download maps
 - [ ] Setup access permissions.
 - [ ] Plugin to update a real Teeworlds or DDNet server (a simple /reload command sent should be enough)
 - [ ] Stabilise and secure the server for a production(-ish) use.
 - [ ] Add more editor tools for quads, envelopes, sounds etc.
