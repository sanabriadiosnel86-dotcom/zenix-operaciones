#!/usr/bin/env bash
# Restaura una copia hecha con respaldo.sh en una base VACÍA (proyecto Supabase nuevo, sin migraciones aplicadas).
# Uso:  ZENIX_DB_URL='postgresql://...' scripts/restaurar.sh respaldos/2026-11-10_0900
# Nunca lo ejecutes sobre la base en uso: probá siempre en un proyecto separado.
set -euo pipefail
: "${ZENIX_DB_URL:?Definí ZENIX_DB_URL con la cadena de conexión de la base DESTINO}"
ORIGEN="${1:?Indicá la carpeta de la copia}"
( cd "$ORIGEN" && sha256sum -c SHA256SUMS )
if [ "$(psql "$ZENIX_DB_URL" -Atc "select count(*) from pg_tables where schemaname = 'public'")" != "0" ]; then
  echo "La base destino ya tiene tablas en 'public'. Restaurá solo sobre una base vacía." >&2; exit 1
fi
P=(psql "$ZENIX_DB_URL" -q -v ON_ERROR_STOP=1 --single-transaction)
# Las cuentas se cargan sin disparar automatismos del sistema de acceso.
{ echo "set session_replication_role = replica;"; cat "$ORIGEN/1_cuentas.sql"; } | "${P[@]}"
# El esquema public ya existe en todo PostgreSQL/Supabase: se omite su creación.
grep -vE '^(CREATE SCHEMA public;|COMMENT ON SCHEMA public )' "$ORIGEN/2_zenix.sql" | "${P[@]}"
# Supabase concede permisos amplios por defecto a lo que se crea en public: se vuelve a cerrar todo como en la migración de seguridad.
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
sed -n '/^-- >>> PERMISOS/,/^-- <<< PERMISOS/p' "$RAIZ"/supabase/migrations/*_seguridad.sql | "${P[@]}"
echo "Datos restaurados. Falta: aplicar supabase/migrations/*_storage.sql (bucket privado) y volver a subir los archivos."
