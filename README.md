# ZENIX · Centro de operaciones

Sistema privado de Zenix Technologies para gestionar clientes, presupuestos, taller, cobros e ideas de contenido desde computadora y celular. **Fase 1 de 3 terminada** (ver [docs/ESTADO.md](docs/ESTADO.md)).

| Capa | Tecnología | Costo |
|---|---|---|
| Interfaz | React 19 + TypeScript + Vite + Tailwind, PWA | — |
| Datos, acceso y archivos | Supabase (PostgreSQL + Auth + Storage privado), con RLS | Plan Free |
| Alojamiento | Cloudflare Workers (archivos estáticos), subdominio `workers.dev` | Plan Free |

## Puesta en marcha (resumen)

1. Seguí [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md): crea la base, los dos usuarios y publica la app.
2. Para desarrollo local: `npm ci`, copiá `.env.example` a `.env.local`, completá los dos valores y corré `npm run dev`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en http://localhost:5173 |
| `npm run build` | Verifica tipos y compila a `dist/` |
| `npm test` | Pruebas unitarias (formato de guaraníes, fechas, WhatsApp, CSV) |
| `npm run test:db` | 22 pruebas de aceptación contra un PostgreSQL local (requiere PostgreSQL 15+ instalado) |
| `npm run test:ui` | Revisión visual de 35 pantallas en Chrome (ver nota en `scripts/ui-smoke.mjs`) |
| `npm run deploy` | Compila y publica en Cloudflare |

## Estructura

```
supabase/migrations/   Esquema, funciones atómicas, seguridad (RLS), storage y datos iniciales
supabase/tests/        Pruebas de aceptación de la base y entorno simulado para correrlas sin Supabase
src/lib/               Cliente Supabase, capa de datos, formato (Gs., fechas America/Asuncion)
src/pages/             Pantallas   ·   src/forms.tsx  Formularios   ·   src/ui.tsx  Componentes
scripts/               Base local de pruebas, copia y restauración, revisión visual
docs/                  Despliegue, tarifas, copias y recuperación, permisos, estado de las fases
```

## Reglas que el código respeta

- **La base es la única fuente de datos.** No se usa `localStorage` para registros; el service worker solo guarda el cascarón de la app.
- **Precios congelados.** Cada presupuesto y orden copia precio, inclusiones, exclusiones y condiciones. Cambiar el catálogo abre una versión nueva de tarifa y no toca documentos anteriores.
- **Operaciones sensibles atómicas e idempotentes.** Cobros, gastos, órdenes y adicionales llevan una clave por operación: doble clic o reintento devuelven el mismo registro.
- **Nada se borra.** Los movimientos se anulan con motivo; presupuestos y órdenes se cancelan; todo queda en historial y auditoría.
- **Permisos en el servidor.** RLS en todas las tablas; sin sesión, o con sesión sin perfil de socio activo, no se lee ni escribe nada.
- **Edición simultánea.** Cada registro lleva versión; si el otro socio guardó antes, el segundo guardado se rechaza con aviso.
- **Paleta editable** en `src/index.css` (`@theme`). Los botones usan un verde más oscuro (`--color-brand-strong`) que el principal `#12BE8D` porque el texto blanco sobre `#12BE8D` no alcanza contraste AA.
