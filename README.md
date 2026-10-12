# Tremulous Web
Tremulous web client, game server and master server. This is for the web port which you can play at https://www.tremulous.online

The code for the web port can be found at https://github.com/justinl1996/tremulous

## To build and run
For each directory (other than `tremulous_assets`) run the following
```
docker compose --build -d
```
For the game server there are specific environment variables which are set for each server. i.e. to deploy the AU server:
```
docker compose --env-file env/au-1.env --build -d
```

Note: For your own hosts you will need to provision your own SSL certificates (I use letsencrypt since its free) and assign it a domain name. Replace the fields `ssl_certificate`, `ssl_certificate_key` and `server_name` with your values.

## tremulous_client
The frontend for `https://www.tremulous.online`. The actual tremulous binary and wasm can be found under `node/bin`

## tremulous_content_server
This hosts the pk3 files to be loaded when the client first visits the website.

The pk3 files in `tremulous_assets` are copied into `node/pk3_assets` at build time (via a compose `additional_contexts`). After deploying, you can then view the manifest at `<your-url>/assets/manifest.json`.

## tremulous_client_content
Combination of tremulous_client and tremulous_content_server to run on the same host

## tremulous_game_server
This is for running the game servers.

The pk3 files in `tremulous_assets` are copied into `server/gpp` at build time (via a compose `additional_contexts`); `server/gpp` only needs the `.cfg` files.

## tremulous_master_server
Master server for `tremulous.online`. Since this is websocket based, webclients use a seperate master server and cannot communicate with regular clients and game servers.

## tremulous_assets
All the PK3 assets used by `tremulous_game_server` and `tremulous_content_server`.