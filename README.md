# Teeworlds Web Editor (TWWE)

Teeworlds / DDraceNetwork map editor. Online and collaborative, just like the game.

A server is (or will be) hosted at [tw.thissma.fr](tw.thissma.fr). Please don't DDos me.

## Status

Currently in a early Proof-of-Concept stage. Quick development.

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

* Improve performance for the meshing: currently takes ~50ms to edit every tile! (not sure how for now, maybe chunking, greedy meshing or a separate smaller buffer for edits)
* Improve **concurrency** on the server. Currently, the whole server state is protected by a single mutex which means there cannot be any simultaneous requests.
* Allow editing multiple maps on a single server. The server will advertise which maps are available and add restrictions on which users can connect to (maybe a password per map?)
* Allow users to create, upload and download maps and setup access permissions.
* Plugin to update a real Teeworlds or DDNet server (a simple /reload command sent should be enough)
* Stabilise and securise the server for a production(-ish) use.
* Add more editor tools for quads, envelopes, sounds etc.