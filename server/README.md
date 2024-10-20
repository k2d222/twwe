# TeeWorlds Web Editor (TWWE) server

Visit [the github repository](https://github.com/k2d222/twwe) for more information.

```
Usage: twwe-server [OPTIONS] [ADDR]

Arguments:
  [ADDR]  Address and port to listen to (addr:port) [default: 127.0.0.1:16800]

Options:
  -c, --cert <CERT>
          
  -k, --key <KEY>
          Path to the TLS certificate private key
      --maps <maps>
          Path to the maps directories (containing sub-directories containing map.map, config.json etc.)
      --data <data>
          Path to ddnet data directories, if you want to read maps from there. Map will be read in the maps sub-directory, automappers in editor/automap, map config is volatile for now. Automappers will be shared between all maps in the same data directory
  -s, --static <static>
          Directory of static files to serve
      --rpp <rpp>
          Path to rules++ executable
      --max-maps <MAX_MAPS>
          Maximum number of maps in both --maps and --data folders [default: 1000]
      --max-map-size <MAX_MAP_SIZE>
          Maximum size of a map file, in KiB. Default: 10MiB. FYI: DDNet maps are typically less than 1MiB, the largest is Cerberus, 5MiB [default: 10240]
      --max-connections <MAX_CONNECTIONS>
          Maximum number of simultaneous websocket connections [default: 100]
      --max-http-bursts <MAX_HTTP_BURSTS>
          Maximum number of HTTP requests an IP can do at once before being rate-limited [default: 100]
      --http-ratelimit-delay <HTTP_RATELIMIT_DELAY>
          Once an IP is rate-limited, delay after which 1 request quota is replenished. In milliseconds [default: 500]
  -h, --help
          Print help
  -V, --version
          Print version
```
