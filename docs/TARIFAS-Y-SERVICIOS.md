# Cómo modificar tarifas y servicios

Todo se hace desde la app, con rol **Administrador**, en **Ajustes → Catálogo y tarifas**. No hay que tocar código ni volver a desplegar.

## Cambiar un precio
1. Tocá **Editar** en el servicio, escribí el nuevo importe y **Guardar**.
2. El sistema cierra la tarifa anterior y abre una versión nueva con fecha y autor (se ve en "Historial de tarifas").
3. **Qué cambia:** los presupuestos y órdenes que se creen desde ese momento.
4. **Qué no cambia:** presupuestos ya creados (en cualquier estado) y órdenes existentes. Conservan el precio, las inclusiones, las exclusiones y las condiciones acordadas.

Si revisás un presupuesto viejo (nueva versión), el sistema avisa que el catálogo cambió pero **no** actualiza el precio solo: lo decidís vos.

## Inclusiones, exclusiones y checklist
- Una línea por ítem. Las **inclusiones** y **exclusiones** aparecen en el presupuesto y en el mensaje de WhatsApp.
- El **checklist** se copia a cada orden nueva de ese servicio y cada tarea guarda quién la marcó y cuándo.
- **Mantenimiento de tarjeta gráfica** quedó con inclusiones y checklist vacíos a propósito: complétenlos cuando los definan.

## Servicios "a cotizar"
Dejá el precio vacío. Al agregarlo a un presupuesto, el sistema exige escribir el importe acordado. Así está cargado *Mantenimiento de laptop gaming con metal líquido*.

## Crear, desactivar
- **Nuevo** crea un servicio o producto. No se inventan tarifas: sin precio queda "A cotizar".
- Para dejar de ofrecer algo, desmarcá **Activo**. No se borra, porque puede estar en documentos anteriores.

## Otros valores editables (Ajustes)
| Sección | Qué se configura |
|---|---|
| Negocio | Nombre comercial y datos de contacto |
| Socios y roles | Nombre, rol y acceso de cada socio |
| Condiciones y reparto | Vigencia de presupuestos, condiciones por defecto, porcentajes de reparto y reserva |
| Mensajes | Plantillas de WhatsApp con variables |

Pendiente para fases siguientes: insumos y stock mínimo, gastos habituales de traslado, metas, plantillas PDF y parámetros tributarios.

## Tarifas iniciales cargadas (10/11/2026)
| Servicio | Precio | Incluye |
|---|---|---|
| Mantenimiento de PC | Gs. 150.000 | Limpieza interna · Limpieza de ventiladores · Cambio de pasta térmica · Revisión de temperatura |
| Mantenimiento de laptop | Gs. 160.000 | Lo mismo. No incluye: laptops gaming con metal líquido |
| Mantenimiento de tarjeta gráfica | Gs. 30.000 | Pendiente de configurar |
| Laptop gaming con metal líquido | A cotizar | — |
