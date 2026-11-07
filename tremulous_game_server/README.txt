
# Example deploy command 

docker --context aws-debian-1 compose --env-file env/au-1.env up --build -d

# Player log

Real players' (not bots') visits are recorded in an SQLite database at
$PLAYER_DB_DIR/players.db on each host (see env/*.env). It survives rebuilds.
Each row is one visit (table player_sessions); rows are tagged with SERVER_NAME.

ssh <host> sqlite3 tremulous-db/players.db \
  "SELECT name, ip, transport, joined_utc, duration_seconds, leave_reason
   FROM player_sessions_readable ORDER BY id DESC LIMIT 20"
