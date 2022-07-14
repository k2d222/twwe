import type { WebSocketServer } from "src/server/server";
import { writable, Writable } from "svelte/store";

export const server: Writable<WebSocketServer> = writable(null)