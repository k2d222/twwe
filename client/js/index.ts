import Svelte from "./ui/index.svelte";
import { Map } from './twmap/map'
import { Server } from './server/server'
import { RenderMap } from './gl/renderMap'


async function main() {

  new Svelte({
    target: document.body,
  });
}

main()