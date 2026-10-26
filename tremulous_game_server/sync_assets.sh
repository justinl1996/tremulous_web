#!/bin/bash

# Rsync the pk3 assets that rarely change (maps and base data) to ~/tremulous-data/gpp
# on each game server. The container mounts this directory (see docker-compose.yaml),
# so these pk3s no longer need to be copied into the image on every deploy.

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ASSETS_DIR=$SCRIPT_DIR/../tremulous_assets

# sync_assets <user@host> <ssh port>
sync_assets() {
    echo "==> Syncing assets to $1:$2"
    # No -z: pk3s are zips and don't compress further. -P shows progress and keeps
    # partially sent files so an interrupted sync resumes.
    rsync -av -P --delete \
        -e "ssh -p $2 -o ServerAliveInterval=15 -o ServerAliveCountMax=4" \
        --rsync-path="mkdir -p tremulous-data/gpp && rsync" \
        --include='map-*.pk3' \
        --include='data-1.1.0.pk3' \
        --include='data-gpp1.pk3' \
        --include='data-web-1.3.1.pk3' \
        --exclude='*' \
        "$ASSETS_DIR/" "$1:tremulous-data/gpp/"
}

sync_assets root@139.99.210.27 2065   # au-1 (tierhive-au-1)
sync_assets ubuntu@192.9.134.0 22     # us-1 (oracle-amd-2)
sync_assets root@172.99.188.64 2862   # eu-1 (tierhive-eu-1)
