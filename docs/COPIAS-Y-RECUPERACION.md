# Copias y recuperación de datos

**El plan Free de Supabase no hace copias automáticas.** La copia depende de ustedes. Rutina sugerida: una vez por semana, y siempre antes de cambios grandes.

## Nivel 1 · Exportación desde la app (2 minutos)
**Ajustes → Datos → Todo (JSON)**, con rol Administrador. Baja todas las tablas en un archivo; también hay CSV de clientes, órdenes, movimientos, presupuestos e ideas para abrir en una planilla.
- Sirve para consultar y como resguardo legible.
- No incluye contraseñas ni los archivos del Storage (las fotos figuran por su ruta).
- La restauración automática desde este JSON **no existe todavía**: es parte de la fase 3.

## Nivel 2 · Copia completa restaurable (recomendada)
Requiere una computadora con las herramientas de PostgreSQL (`pg_dump`, `psql`) versión 17 o superior.

```bash
export ZENIX_DB_URL='postgresql://postgres.TU_REF:TU_CLAVE@…pooler.supabase.com:5432/postgres'  # Supabase → Connect → Session pooler
scripts/respaldo.sh
```
Genera `respaldos/FECHA/` con las cuentas de acceso, la estructura, los permisos y todos los datos, más una suma de verificación. **Contiene datos privados:** guardala cifrada y en otro lugar (disco externo o nube personal).

### Restaurar
Siempre en un proyecto **nuevo y vacío**, nunca sobre la base en uso:
```bash
export ZENIX_DB_URL='…cadena del proyecto NUEVO…'
scripts/restaurar.sh respaldos/2026-11-10_0900
```
Después: ejecutar `supabase/migrations/…_storage.sql` en el proyecto nuevo, apuntar la app a la nueva URL y clave (`.env.local` + `npm run deploy`) y volver a subir las fotos.

**Qué se probó:** copia y restauración completas en una base PostgreSQL 16 separada: mismas cantidades de registros, mismos saldos, mismas 33 políticas y 31 disparadores, y los permisos siguen cerrados para anónimos. **Qué falta probar:** el mismo procedimiento contra un proyecto Supabase real (háganlo una vez con datos de demostración antes de confiar en él).

## Archivos del Storage
No están cubiertos por ninguno de los dos niveles. Hasta la fase 3 (copia con manifiesto de archivos), conserven los originales importantes en el celular o la computadora.

## Si el proyecto aparece "pausado"
Supabase pausa los proyectos gratuitos tras una semana sin actividad. Los datos no se borran: se reactiva desde el panel con **Restore project** y tarda unos minutos. Con uso diario no debería ocurrir. No dejen pasar meses con el proyecto pausado: confirmen en el panel el plazo vigente para reactivarlo.

## Si se llenan los límites gratuitos
| Límite Free | Uso esperado | Qué hacer |
|---|---|---|
| Base 500 MB | Texto: años de uso | Revisar Database → Usage |
| Archivos 1 GB | ≈ 2.500–4.000 fotos (la app las reduce a 1600 px) | Borrar fotos viejas ya entregadas o usar enlaces externos |
| Transferencia 5 GB/mes | Holgado para dos usuarios | — |

Ninguna función actual exige un plan pago.
