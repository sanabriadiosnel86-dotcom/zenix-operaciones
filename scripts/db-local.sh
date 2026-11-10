#!/usr/bin/env bash
# Levanta un PostgreSQL local desechable, aplica el entorno simulado y todas las migraciones.
# Uso: scripts/db-local.sh [nombre_db]   (requiere PostgreSQL 15+ instalado; no usa Docker)
set -euo pipefail
DB="${1:-zenix_test}"; PORT="${PGPORT:-54329}"; DIR="${ZENIX_PGDATA:-/tmp/zenix-pg}"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"; [ -n "$BIN" ] && export PATH="$BIN:$PATH"
RUN=""; [ "$(id -u)" = "0" ] && RUN="su postgres -c"
x() { if [ -n "$RUN" ]; then $RUN "$*"; else bash -c "$*"; fi; }
if [ ! -d "$DIR/data" ]; then
  mkdir -p "$DIR"; [ -n "$RUN" ] && chown postgres "$DIR"
  x "PATH=$PATH initdb -D $DIR/data -U postgres -A trust >/dev/null"
fi
x "PATH=$PATH pg_ctl -D $DIR/data status >/dev/null 2>&1" || x "PATH=$PATH pg_ctl -D $DIR/data -o '-p $PORT -c listen_addresses=127.0.0.1' -l $DIR/log -w start >/dev/null"
P="psql -v ON_ERROR_STOP=1 -q -h 127.0.0.1 -p $PORT -U postgres"
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
$P -d "$DB" -f "$ROOT/supabase/tests/00_entorno_local.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do $P -d "$DB" -f "$f"; done
echo "Base '$DB' lista en 127.0.0.1:$PORT"
