# Estado del proyecto ZENIX · Centro de operaciones

Actualizado: 10/11/2026 · **Fase 1 terminada. Fases 2 y 3 sin empezar: esperan indicación expresa.**

## Fase 1 — Base operativa utilizable ✅

| # | Entregable | Estado |
|---|---|---|
| 1 | Arquitectura, base de datos y migraciones versionadas | Hecho |
| 2 | Autenticación de dos usuarios, registro público cerrado | Hecho (falta crear las cuentas en el proyecto real) |
| 3 | Diseño responsive: lateral en escritorio, barra + "Más" en celular | Hecho |
| 4 | Ajustes básicos y catálogo editable con versiones de tarifa | Hecho |
| 5 | Clientes, equipos y consultas | Hecho |
| 6 | Presupuestos con versiones, aprobación, WhatsApp y conversión a orden | Hecho |
| 7 | Órdenes: responsables, estados, checklist, adicionales, fotos | Hecho |
| 8 | Cobros y gastos básicos, saldo por orden, anulación trazable | Hecho |
| 9 | Inicio con pendientes reales | Hecho |
| 10 | Captura de ideas y listado | Hecho |
| 11 | Exportación JSON/CSV + copia y restauración por script | Hecho |
| 12 | Datos de demostración separados (marca DEMO, carga y borrado) | Hecho |
| 13 | Guías de instalación, despliegue, tarifas y copias | Hecho |

### Pruebas ejecutadas
| Prueba | Resultado | Dónde corrió |
|---|---|---|
| 22 pruebas de aceptación de base (las 13 del pedido y 9 más) | 22/22 | PostgreSQL 16 local con roles de Supabase simulados |
| Tipado y compilación | Sin errores | Local |
| Pruebas unitarias de formato | 4/4 | Local |
| Revisión de 35 pantallas, escritorio y celular | Sin errores de consola ni desbordes | Chrome sin interfaz; lecturas servidas desde la base local, sin escritura |
| Copia y restauración | Datos, políticas y permisos idénticos | Base local separada |

### No probado todavía (requiere el proyecto Supabase real)
- Ingreso real con Supabase Auth, cierre de sesión y renovación de sesión.
- Escrituras desde el navegador a través de la API de Supabase (la lógica que ejecutan sí está probada en la base).
- Subida y lectura de fotos en Storage (las políticas se probaron sobre una tabla simulada).
- Instalación como PWA y funcionamiento sin conexión en un celular real.
- Despliegue en Cloudflare.

### Decisiones tomadas que conviene que revisen
- **Vigencia por defecto de presupuestos: 7 días** (editable en Ajustes). No estaba definida.
- **Un cobro no puede superar el saldo de la orden.** Si hay un extra, primero se carga como trabajo adicional.
- **Solo el Administrador** anula movimientos, reabre órdenes cerradas, exporta y edita ajustes.
- **Nombre comercial inicial:** "Zenix Technologies" (del logo). Editable.
- Los estados de consulta siguen solos al presupuesto (enviado, aprobado, convertido).
- Alta de socios desde el editor SQL, no desde la app.

### Límites conocidos de la fase 1
- Sin tareas sueltas de agenda: "retiros" se anotan como próxima actividad de una consulta.
- Sin cobro ligado a un presupuesto antes de existir la orden (el anticipo se cobra sobre la orden).
- "Cobros menos gastos" no es ganancia ni caja; la pantalla lo aclara.
- Sin búsqueda global, modo privacidad ni PDF (módulo H, fases siguientes).
- Tarifas con vigencia futura programada: no; el cambio rige desde que se guarda.

## Fase 2 — Contenido, inventario y rentabilidad ⏸ No iniciada
Estudio de contenido, tablero y calendario, galería y versiones, campañas, compras y proveedores, inventario y consumo por orden, ventas y sobre pedido, costos reales y estimados, finanzas completas y reparto, PDF, recordatorios, garantías y reingresos.

## Fase 3 — Informes, plantillas y consolidación ⏸ No iniciada
Informes técnicos, catálogo de componentes, rentabilidad por servicio, metas y simulaciones, editor de flyers y PNG, configuración tributaria, copias completas con manifiesto y restauración, indicadores de almacenamiento, accesibilidad y PWA finales.

## Infraestructura y límites gratuitos verificados (10/11/2026)
| Servicio | Límite Free | Observación |
|---|---|---|
| Supabase base de datos | 500 MB por proyecto | Sin copias automáticas |
| Supabase Storage | 1 GB | 5 MB por archivo configurado en el bucket |
| Supabase transferencia | 5 GB/mes | |
| Supabase proyectos | 2 activos | Se pausan tras 1 semana sin actividad |
| Cloudflare | Archivos estáticos sin costo por solicitud | Sin restricción de uso comercial en su acuerdo |
| Vercel Hobby | — | Descartado: solo uso personal no comercial |

Los límites pueden cambiar: revisar las páginas oficiales de precios antes de la fase 2. No se promete gratuidad ilimitada.
