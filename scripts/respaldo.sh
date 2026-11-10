#!/usr/bin/env bash
# Copia completa y restaurable de los datos de ZENIX (no incluye los archivos del Storage).
# Uso:  ZENIX_DB_URL='postgresql://postgres.[ref]:[CLAVE]@...pooler.supabase.com:5432/postgres' scripts/respaldo.sh
# La URL está en Supabase → Connect → "Session pooler". No la guardes en el repositorio ni la compartas.
set -euo pipefail
: "${ZENIX_DB_URL:?Definí ZENIX_DB_URL con la cadena de conexión de la base}"
DEST="${1:-respaldos/$(TZ=America/Asuncion date +%Y-%m-%d_%H%M)}"
mkdir -p "$DEST"; chmod 700 "$DEST"
# 1) Cuentas de acceso (correo y contraseña cifrada). Sin esto, los socios deberían recrearse a mano.
pg_dump "$ZENIX_DB_URL" --data-only --no-owner --table=auth.users --table=auth.identities > "$DEST/1_cuentas.sql"
# 2) Estructura, permisos, políticas y datos del sistema.
pg_dump "$ZENIX_DB_URL" --no-owner --schema=app --schema=public > "$DEST/2_zenix.sql"
( cd "$DEST" && sha256sum 1_cuentas.sql 2_zenix.sql > SHA256SUMS )
echo "Copia guardada en $DEST. Contiene datos privados: guardala cifrada y fuera de este equipo."
