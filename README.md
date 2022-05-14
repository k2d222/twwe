# Teeworlds Web Editor (TWWE)

Teeworlds / DDraceNetwork map editor. Online and collaborative, just like the game.

A server is (or will be) hosted at [tw.thissma.fr](http://tw.thissma.fr). Please don't DDos me. Note: try http if https is not working.


## Status

Currently in a early Proof-of-Concept stage. Quick development.

## Usage

Many features are missing. Currently you can only edit tiles in tiles layers. Use mouse wheel to zoom in/out, hold and drag any mouse button to move around and click or press spacebar to place a tile under the cursor.

Select the active tile by clicking the square at the bottom.

Select the active layer by clicking one of the radio buttons on the left bar.

The Save button saves the map on the disk on the server side. If a teeworlds server using this map is running, enter `reload` in the server console to update it.

## Building and Running

### Server
Have rust and cargo installed and run `RUST_LOG=debug cargo run` in the server directory. Use the first command-line argument to change port e.g. `cargo run localhost:3333` to run locally on port 3333.

### Client

Have npm installed and run `npm install` in the client directory to install dependencies, `npm run run` to run a dev server and `npm run build` to produce a release in the dist directory.
You will probably want to change the remote server address in `client/js/main.ts`. 

Note: the client is written in non-strict Typescript. Typescript is only used for IDE hints and documentation, but ignored by the [Parcel](https://parceljs.org/languages/typescript/) bundler.
Use `npm run tsc` to run Typescript checks on the project.

## Roadmap

Future short-term goals are as follows:

* Improve **concurrency** on the server. Currently, the whole server state is protected by a single mutex which means there cannot be any simultaneous requests.
* Allow editing multiple maps on a single server. The server will advertise which maps are available and add restrictions on which users can connect to (maybe a password per map?)
* Allow users to create, upload and download maps and setup access permissions.
* Plugin to update a real Teeworlds or DDNet server (a simple /reload command sent should be enough)
* Stabilise and securise the server for a production(-ish) use.
* Add more editor tools for quads, envelopes, sounds etc.