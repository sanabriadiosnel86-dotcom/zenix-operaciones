-- ZENIX · Fase 1 · Operaciones atómicas (RPC)
-- Todas verifican permisos en el servidor, validan entradas y corren en una sola transacción.
-- Códigos de error propios: ZX403 sin permiso · ZX404 no existe · ZX409 conflicto de edición · ZX422 dato inválido.

create or replace function app.err(p_codigo text, p_mensaje text) returns void
language plpgsql set search_path = '' as $$
begin raise exception '%', p_mensaje using errcode = p_codigo; end $$;

create or replace function app.gs(p bigint) returns text
language sql immutable set search_path = '' as
$$ select 'Gs. ' || replace(to_char(p, 'FM999G999G999G999G990'), ',', '.') $$;

-- ───────────── Catálogo: guardar servicio y, si cambió, abrir una nueva versión de tarifa ─────────────
create or replace function public.guardar_servicio(
  p_id uuid, p_nombre text, p_tipo text, p_descripcion text, p_activo boolean,
  p_precio bigint, p_inclusiones jsonb, p_exclusiones jsonb, p_checklist jsonb, p_condiciones text,
  p_version integer default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app.exigir_admin(); v_id uuid := p_id; s public.servicios; t public.servicio_tarifas;
        v_inc jsonb := coalesce(p_inclusiones, '[]'); v_exc jsonb := coalesce(p_exclusiones, '[]'); v_chk jsonb := coalesce(p_checklist, '[]');
        v_cond text := nullif(btrim(coalesce(p_condiciones, '')), '');
begin
  if jsonb_typeof(v_inc) <> 'array' or jsonb_typeof(v_exc) <> 'array' or jsonb_typeof(v_chk) <> 'array'
     or jsonb_array_length(v_inc) > 30 or jsonb_array_length(v_exc) > 30 or jsonb_array_length(v_chk) > 30 then
    perform app.err('ZX422', 'Las inclusiones, exclusiones y el checklist admiten hasta 30 líneas cada uno.');
  end if;
  if p_precio is not null and p_precio < 0 then perform app.err('ZX422', 'El precio no puede ser negativo.'); end if;

  if v_id is null then
    insert into public.servicios (nombre, tipo, descripcion, activo, created_by)
    values (btrim(p_nombre), coalesce(p_tipo, 'servicio'), nullif(btrim(coalesce(p_descripcion, '')), ''), coalesce(p_activo, true), v_uid)
    returning id into v_id;
  else
    select * into s from public.servicios where id = v_id for update;
    if not found then perform app.err('ZX404', 'El servicio no existe.'); end if;
    if p_version is not null and s.version <> p_version then
      perform app.err('ZX409', 'Otro socio modificó este servicio. Recargá para ver la versión actual.');
    end if;
    update public.servicios
    set nombre = btrim(p_nombre), tipo = coalesce(p_tipo, tipo),
        descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''), activo = coalesce(p_activo, activo)
    where id = v_id;
    select * into t from public.servicio_tarifas where servicio_id = v_id and vigente_hasta is null;
  end if;

  if t.id is null or t.precio is distinct from p_precio or t.inclusiones <> v_inc or t.exclusiones <> v_exc
     or t.checklist <> v_chk or t.condiciones is distinct from v_cond then
    update public.servicio_tarifas set vigente_hasta = now() where servicio_id = v_id and vigente_hasta is null;
    insert into public.servicio_tarifas (servicio_id, precio, inclusiones, exclusiones, checklist, condiciones, created_by)
    values (v_id, p_precio, v_inc, v_exc, v_chk, v_cond, v_uid);
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe un servicio con ese nombre.' using errcode = 'ZX422';
end $$;

-- ───────────── Conceptos: se copia (congela) lo vigente del catálogo en el momento de cotizar ─────────────
create or replace function app.leer_concepto(
  p_it jsonb, out o_servicio uuid, out o_tarifa uuid, out o_desc text, out o_cant integer, out o_precio bigint,
  out o_dto bigint, out o_inc jsonb, out o_exc jsonb, out o_chk jsonb
) language plpgsql stable set search_path = '' as $$
declare v_nombre text;
begin
  o_servicio := nullif(p_it ->> 'servicio_id', '')::uuid;
  o_inc := '[]'; o_exc := '[]'; o_chk := '[]';
  if o_servicio is not null then
    select t.id, t.inclusiones, t.exclusiones, t.checklist, s.nombre
      into o_tarifa, o_inc, o_exc, o_chk, v_nombre
    from public.servicios s join public.servicio_tarifas t on t.servicio_id = s.id and t.vigente_hasta is null
    where s.id = o_servicio;
    if not found then perform app.err('ZX422', 'Uno de los servicios elegidos ya no existe en el catálogo.'); end if;
  end if;
  o_desc := coalesce(nullif(btrim(coalesce(p_it ->> 'descripcion', '')), ''), v_nombre);
  o_cant := coalesce((p_it ->> 'cantidad')::integer, 1);
  o_precio := (p_it ->> 'precio_unitario')::bigint;
  o_dto := coalesce((p_it ->> 'descuento')::bigint, 0);
  if o_desc is null or char_length(o_desc) > 300 then perform app.err('ZX422', 'Cada concepto necesita una descripción (hasta 300 caracteres).'); end if;
  if o_cant not between 1 and 999 then perform app.err('ZX422', 'La cantidad debe estar entre 1 y 999.'); end if;
  if o_precio is null or o_precio < 0 then perform app.err('ZX422', 'Falta el precio de "' || o_desc || '". Los servicios a cotizar necesitan un importe acordado.'); end if;
  if o_dto < 0 or o_dto > o_cant * o_precio then perform app.err('ZX422', 'El descuento de "' || o_desc || '" no puede superar su importe.'); end if;
end $$;

create or replace function app.validar_conceptos(p_items jsonb) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    perform app.err('ZX422', 'Agregá entre 1 y 50 conceptos.');
  end if;
end $$;

-- ───────────── Presupuestos ─────────────
create or replace function public.guardar_presupuesto(
  p_clave uuid, p_presupuesto_id uuid, p_cliente_id uuid, p_consulta_id uuid, p_vigencia_hasta date,
  p_anticipo bigint, p_condiciones text, p_notas text, p_items jsonb, p_version integer default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app.exigir_miembro(); p public.presupuestos; v_id uuid; v_num integer; v_ver uuid;
        v_total bigint := 0; v_demo boolean; it jsonb; i integer := 0; c record;
begin
  if p_clave is null then perform app.err('ZX422', 'Falta la clave de la operación.'); end if;
  select presupuesto_id into v_id from public.presupuesto_versiones where clave_idem = p_clave;
  if found then return v_id; end if;
  perform app.validar_conceptos(p_items);

  if p_presupuesto_id is null then
    select es_demo into v_demo from public.clientes where id = p_cliente_id;
    if not found then perform app.err('ZX404', 'El cliente no existe.'); end if;
    if p_consulta_id is not null and not exists (select 1 from public.consultas where id = p_consulta_id and cliente_id = p_cliente_id) then
      perform app.err('ZX422', 'La consulta no corresponde a ese cliente.');
    end if;
    insert into public.presupuestos (cliente_id, consulta_id, es_demo, created_by)
    values (p_cliente_id, p_consulta_id, v_demo, v_uid) returning id into v_id;
    v_num := 1;
  else
    select * into p from public.presupuestos where id = p_presupuesto_id for update;
    if not found then perform app.err('ZX404', 'El presupuesto no existe.'); end if;
    if p_version is not null and p.version <> p_version then
      perform app.err('ZX409', 'Otro socio modificó este presupuesto. Recargá para ver la versión actual.');
    end if;
    if p.estado not in ('borrador', 'enviado', 'rechazado') then
      perform app.err('ZX422', 'Un presupuesto aprobado, convertido o cancelado no admite nuevas versiones. Creá uno nuevo.');
    end if;
    v_id := p.id; v_num := p.version_actual + 1;
  end if;

  insert into public.presupuesto_versiones (presupuesto_id, numero_version, vigencia_hasta, condiciones, notas, clave_idem, created_by)
  values (v_id, v_num, p_vigencia_hasta, nullif(btrim(coalesce(p_condiciones, '')), ''), nullif(btrim(coalesce(p_notas, '')), ''), p_clave, v_uid)
  returning id into v_ver;

  for it in select * from jsonb_array_elements(p_items) loop
    i := i + 1;
    select * into c from app.leer_concepto(it);
    insert into public.presupuesto_items (version_id, posicion, servicio_id, tarifa_id, descripcion, cantidad, precio_unitario, descuento, inclusiones, exclusiones, checklist)
    values (v_ver, i, c.o_servicio, c.o_tarifa, c.o_desc, c.o_cant, c.o_precio, c.o_dto, c.o_inc, c.o_exc, c.o_chk);
    v_total := v_total + c.o_cant * c.o_precio - c.o_dto;
  end loop;

  if coalesce(p_anticipo, 0) < 0 or coalesce(p_anticipo, 0) > v_total then
    perform app.err('ZX422', 'El anticipo no puede superar el total del presupuesto.');
  end if;
  update public.presupuesto_versiones set total = v_total, anticipo = coalesce(p_anticipo, 0) where id = v_ver;
  update public.presupuestos set version_actual = v_num, estado = 'borrador', enviado_en = null, motivo_cierre = null where id = v_id;
  return v_id;
end $$;

create or replace function public.marcar_presupuesto(p_id uuid, p_estado text, p_motivo text default null, p_version integer default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app.exigir_miembro(); p public.presupuestos; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into p from public.presupuestos where id = p_id for update;
  if not found then perform app.err('ZX404', 'El presupuesto no existe.'); end if;
  if p_version is not null and p.version <> p_version then
    perform app.err('ZX409', 'Otro socio modificó este presupuesto. Recargá para ver la versión actual.');
  end if;
  if p_estado = 'enviado' and p.estado in ('borrador', 'enviado') then
    update public.presupuestos set estado = 'enviado', enviado_en = now() where id = p_id;
    update public.consultas set estado = 'presupuesto_enviado' where id = p.consulta_id and estado = 'consulta';
  elsif p_estado = 'rechazado' and p.estado in ('borrador', 'enviado') then
    if v_motivo is null then perform app.err('ZX422', 'Indicá el motivo del rechazo.'); end if;
    update public.presupuestos set estado = 'rechazado', motivo_cierre = v_motivo where id = p_id;
    update public.consultas set estado = 'rechazado', motivo_cierre = v_motivo
      where id = p.consulta_id and estado in ('consulta', 'presupuesto_enviado');
  elsif p_estado = 'cancelado' and p.estado in ('borrador', 'enviado', 'aprobado', 'rechazado') then
    if v_motivo is null then perform app.err('ZX422', 'Indicá el motivo de la cancelación.'); end if;
    update public.presupuestos set estado = 'cancelado', motivo_cierre = v_motivo where id = p_id;
  else
    perform app.err('ZX422', 'Ese cambio de estado no está permitido para este presupuesto.');
  end if;
end $$;

create or replace function public.aprobar_presupuesto(p_id uuid, p_medio text, p_fecha timestamptz default null, p_nota text default null, p_version integer default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app.exigir_miembro(); p public.presupuestos; v_fecha timestamptz := coalesce(p_fecha, now());
begin
  select * into p from public.presupuestos where id = p_id for update;
  if not found then perform app.err('ZX404', 'El presupuesto no existe.'); end if;
  if p_version is not null and p.version <> p_version then
    perform app.err('ZX409', 'Otro socio modificó este presupuesto. Recargá para ver la versión actual.');
  end if;
  if p.estado not in ('borrador', 'enviado') then perform app.err('ZX422', 'Solo se puede aprobar un presupuesto en borrador o enviado.'); end if;
  if p_medio is null or p_medio not in ('whatsapp', 'llamada', 'presencial', 'correo', 'otro') then
    perform app.err('ZX422', 'Indicá por qué medio se recibió la aprobación.');
  end if;
  if v_fecha > now() + interval '5 minutes' then perform app.err('ZX422', 'La fecha de aprobación no puede ser futura.'); end if;
  update public.presupuestos
  set estado = 'aprobado', aprobado_en = v_fecha, aprobado_medio = p_medio,
      aprobado_nota = nullif(btrim(coalesce(p_nota, '')), ''), aprobado_por = v_uid
  where id = p_id;
  update public.consultas set estado = 'aprobado' where id = p.consulta_id and estado in ('consulta', 'presupuesto_enviado');
end $$;

-- ───────────── Órdenes ─────────────
create or replace function app.validar_orden(p_cliente uuid, p_equipo uuid, p_responsable uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not exists (select 1 from public.equipos where id = p_equipo and cliente_id = p_cliente) then
    perform app.err('ZX422', 'El equipo elegido no pertenece a ese cliente.');
  end if;
  if p_responsable is not null and not exists (select 1 from public.perfiles where id = p_responsable and activo) then
    perform app.err('ZX422', 'El responsable elegido no es un socio activo.');
  end if;
end $$;

-- Convierte un presupuesto aprobado en orden sin volver a escribir datos. Repetir la llamada devuelve la misma orden.
create or replace function public.convertir_presupuesto(
  p_id uuid, p_equipo_id uuid, p_responsable_id uuid, p_problema text default null,
  p_condicion text default null, p_accesorios text default null, p_entrega_prevista date default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app.exigir_miembro(); p public.presupuestos; v public.presupuesto_versiones; v_orden uuid;
begin
  select * into p from public.presupuestos where id = p_id for update;
  if not found then perform app.err('ZX404', 'El presupuesto no existe.'); end if;
  select id into v_orden from public.ordenes where presupuesto_id = p_id;
  if found then return v_orden; end if;
  if p.estado <> 'aprobado' then perform app.err('ZX422', 'Primero registrá la aprobación del presupuesto.'); end if;
  perform app.validar_orden(p.cliente_id, p_equipo_id, p_responsable_id);
  select * into v from public.presupuesto_versiones where presupuesto_id = p_id and numero_version = p.version_actual;

  insert into public.ordenes (cliente_id, equipo_id, presupuesto_id, presupuesto_version_id, responsable_id, problema,
                              condicion_recepcion, accesorios, entrega_prevista, condiciones, es_demo, created_by)
  values (p.cliente_id, p_equipo_id, p_id, v.id, coalesce(p_responsable_id, v_uid), nullif(btrim(coalesce(p_problema, '')), ''),
          nullif(btrim(coalesce(p_condicion, '')), ''), nullif(btrim(coalesce(p_accesorios, '')), ''), p_entrega_prevista,
          v.condiciones, p.es_demo, v_uid)
  returning id into v_orden;

  insert into public.orden_items (orden_id, posicion, servicio_id, descripcion, cantidad, precio_unitario, descuento, inclusiones, exclusiones, origen, created_by)
  select v_orden, i.posicion, i.servicio_id, i.descripcion, i.cantidad, i.precio_unitario, i.descuento, i.inclusiones, i.exclusiones, 'presupuesto', v_uid
  from public.presupuesto_items i where i.version_id = v.id;

  insert into public.orden_checklist (orden_id, posicion, texto)
  select v_orden, (row_number() over (order by i.posicion, e.ord))::integer, left(e.txt, 200)
  from public.presupuesto_items i cross join lateral jsonb_array_elements_text(i.checklist) with ordinality as e(txt, ord)
  where i.version_id = v.id and btrim(e.txt) <> '';

  insert into public.orden_eventos (orden_id, a_estado, nota, autor)
  values (v_orden, 'recepcion', 'Orden creada desde el presupuesto P-' || lpad(p.numero::text, 3, '0') || ' v' || p.version_actual, v_uid);
  update public.presupuestos set estado = 'convertido' where id = p_id;
  update public.consultas set estado = 'convertido' where id = p.consulta_id and estado in ('consulta', 'presupuesto_enviado', 'aprobado');
  return v_orden;
end $$;

create or replace function public.crear_orden(
  p_clave uuid, p_cliente_id uuid, p_equipo_id uuid, p_responsable_id uuid, p_problema text,
  p_condicion text, p_accesorios text, p_entrega_prevista date, p_items jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app.exigir_miembro(); v_orden uuid; v_demo boolean; it jsonb; i integer := 0; c record; v_pos integer := 0; t text;
begin
  if p_clave is null then perform app.err('ZX422', 'Falta la clave de la operación.'); end if;
  select id into v_orden from public.ordenes where clave_idem = p_clave;
  if found then return v_orden; end if;
  perform app.validar_conceptos(p_items);
  select es_demo into v_demo from public.clientes where id = p_cliente_id;
  if not found then perform app.err('ZX404', 'El cliente no existe.'); end if;
  perform app.validar_orden(p_cliente_id, p_equipo_id, p_responsable_id);

  insert into public.ordenes (cliente_id, equipo_id, responsable_id, problema, condicion_recepcion, accesorios, entrega_prevista, clave_idem, es_demo, created_by)
  values (p_cliente_id, p_equipo_id, coalesce(p_responsable_id, v_uid), nullif(btrim(coalesce(p_problema, '')), ''),
          nullif(btrim(coalesce(p_condicion, '')), ''), nullif(btrim(coalesce(p_accesorios, '')), ''), p_entrega_prevista, p_clave, v_demo, v_uid)
  on conflict (clave_idem) do nothing
  returning id into v_orden;
  if v_orden is null then
    select id into v_orden from public.ordenes where clave_idem = p_clave;
    return v_orden;
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    i := i + 1;
    select * into c from app.leer_concepto(it);
    insert into public.orden_items (orden_id, posicion, servicio_id, descripcion, cantidad, precio_unitario, descuento, inclusiones, exclusiones, origen, created_by)
    values (v_orden, i, c.o_servicio, c.o_desc, c.o_cant, c.o_precio, c.o_dto, c.o_inc, c.o_exc, 'directo', v_uid);
    for t in select * from jsonb_array_elements_text(c.o_chk) loop
      if btrim(t) <> '' then
        v_pos := v_pos + 1;
        insert into public.orden_checklist (orden_id, posicion, texto) values (v_orden, v_pos, left(t, 200));
      end if;
    end loop;
  end loop;
  insert into public.orden_eventos (orden_id, a_estado, nota, autor) values (v_orden, 'recepcion', 'Orden creada', v_uid);
  return v_orden;
end $$;

create or replace function public.cambiar_estado_orden(p_id uuid, p_estado text, p_motivo text default null, p_version integer default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app.exigir_miembro(); o public.ordenes; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into o from public.ordenes where id = p_id for update;
  if not found then perform app.err('ZX404', 'La orden no existe.'); end if;
  if p_version is not null and o.version <> p_version then
    perform app.err('ZX409', 'Otro socio modificó esta orden. Recargá para ver la versión actual.');
  end if;
  if p_estado is null or p_estado not in ('recepcion', 'diagnostico', 'esperando_aprobacion', 'en_mantenimiento', 'pruebas', 'listo', 'entregado', 'en_espera', 'cancelado') then
    perform app.err('ZX422', 'Estado de orden desconocido.');
  end if;
  if p_estado = o.estado then return; end if;
  if o.estado in ('entregado', 'cancelado') and not app.es_admin() then
    perform app.err('ZX403', 'Solo un Administrador puede reabrir una orden entregada o cancelada.');
  end if;
  if p_estado in ('en_espera', 'cancelado') and v_motivo is null then
    perform app.err('ZX422', 'Indicá el motivo para dejar la orden en espera o cancelarla.');
  end if;
  update public.ordenes
  set estado = p_estado,
      estado_anterior = o.estado,
      motivo_estado = case when p_estado in ('en_espera', 'cancelado') then v_motivo end,
      entregado_en = case when p_estado = 'entregado' then now() end
  where id = p_id;
  insert into public.orden_eventos (orden_id, de_estado, a_estado, nota, autor) values (p_id, o.estado, p_estado, v_motivo, v_uid);
end $$;

-- Trabajo adicional: exige registrar la aprobación del cliente y no modifica los conceptos acordados.
create or replace function public.agregar_adicional(
  p_clave uuid, p_orden_id uuid, p_descripcion text, p_cantidad integer, p_precio bigint, p_descuento bigint,
  p_medio text, p_nota text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app.exigir_miembro(); o public.ordenes; v_id uuid; c record;
begin
  if p_clave is null then perform app.err('ZX422', 'Falta la clave de la operación.'); end if;
  select * into o from public.ordenes where id = p_orden_id for update;
  if not found then perform app.err('ZX404', 'La orden no existe.'); end if;
  select id into v_id from public.orden_items where clave_idem = p_clave;
  if found then return v_id; end if;
  if o.estado in ('entregado', 'cancelado') then perform app.err('ZX422', 'La orden está cerrada; no admite trabajos adicionales.'); end if;
  if p_medio is null or p_medio not in ('whatsapp', 'llamada', 'presencial', 'correo', 'otro') then
    perform app.err('ZX422', 'Indicá por qué medio el cliente aprobó el trabajo adicional.');
  end if;
  select * into c from app.leer_concepto(jsonb_build_object('descripcion', p_descripcion, 'cantidad', p_cantidad, 'precio_unitario', p_precio, 'descuento', p_descuento));
  insert into public.orden_items (orden_id, posicion, descripcion, cantidad, precio_unitario, descuento, origen, aprobado_en, aprobado_medio, aprobado_nota, clave_idem, created_by)
  values (p_orden_id, coalesce((select max(posicion) from public.orden_items where orden_id = p_orden_id), 0) + 1,
          c.o_desc, c.o_cant, c.o_precio, c.o_dto, 'adicional', now(), p_medio, nullif(btrim(coalesce(p_nota, '')), ''), p_clave, v_uid)
  returning id into v_id;
  insert into public.orden_eventos (orden_id, nota, autor)
  values (p_orden_id, 'Trabajo adicional aprobado (' || p_medio || '): ' || c.o_desc || ' · ' || app.gs(c.o_cant * c.o_precio - c.o_dto), v_uid);
  return v_id;
end $$;

-- ───────────── Cobros y gastos: idempotentes por clave; el reintento devuelve el mismo movimiento ─────────────
create or replace function public.registrar_movimiento(
  p_clave uuid, p_tipo text, p_monto bigint, p_fecha date, p_medio text, p_concepto text,
  p_categoria text default null, p_orden_id uuid default null, p_cliente_id uuid default null, p_comprobante text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app.exigir_miembro(); m public.movimientos; o public.ordenes; v_saldo bigint;
        v_demo boolean := false; v_cliente uuid := p_cliente_id; v_fecha date := coalesce(p_fecha, app.hoy());
begin
  if p_clave is null then perform app.err('ZX422', 'Falta la clave de la operación.'); end if;
  select * into m from public.movimientos where idempotency_key = p_clave;
  if found then return to_jsonb(m) || jsonb_build_object('duplicado', true); end if;

  if p_tipo is null or p_tipo not in ('cobro', 'gasto') then perform app.err('ZX422', 'Tipo de movimiento inválido.'); end if;
  if p_monto is null or p_monto <= 0 then perform app.err('ZX422', 'El importe debe ser mayor que cero.'); end if;
  if p_medio is null or p_medio not in ('efectivo', 'transferencia', 'tarjeta', 'billetera', 'otro') then perform app.err('ZX422', 'Elegí el medio de pago.'); end if;
  if btrim(coalesce(p_concepto, '')) = '' then perform app.err('ZX422', 'Escribí el concepto del movimiento.'); end if;
  if v_fecha > app.hoy() then perform app.err('ZX422', 'La fecha no puede ser futura.'); end if;
  if p_tipo = 'gasto' and p_categoria is null then perform app.err('ZX422', 'Elegí la categoría del gasto.'); end if;

  if p_orden_id is not null then
    select * into o from public.ordenes where id = p_orden_id for update; -- serializa los cobros de una misma orden
    if not found then perform app.err('ZX404', 'La orden no existe.'); end if;
    select * into m from public.movimientos where idempotency_key = p_clave;
    if found then return to_jsonb(m) || jsonb_build_object('duplicado', true); end if;
    v_cliente := o.cliente_id; v_demo := o.es_demo;
    if p_tipo = 'cobro' then
      if o.estado = 'cancelado' then perform app.err('ZX422', 'La orden está cancelada; no admite cobros.'); end if;
      v_saldo := app.saldo_orden(p_orden_id);
      if p_monto > v_saldo then
        perform app.err('ZX422', 'El cobro (' || app.gs(p_monto) || ') supera el saldo de la orden (' || app.gs(v_saldo) || ').');
      end if;
    end if;
  elsif v_cliente is not null then
    select es_demo into v_demo from public.clientes where id = v_cliente;
    if not found then perform app.err('ZX404', 'El cliente no existe.'); end if;
  end if;

  insert into public.movimientos (tipo, monto, fecha, medio, concepto, categoria, orden_id, cliente_id, comprobante, idempotency_key, es_demo, created_by)
  values (p_tipo, p_monto, v_fecha, p_medio, btrim(p_concepto), case when p_tipo = 'gasto' then p_categoria end, p_orden_id, v_cliente,
          nullif(btrim(coalesce(p_comprobante, '')), ''), p_clave, coalesce(v_demo, false), v_uid)
  on conflict (idempotency_key) do nothing
  returning * into m;
  if m.id is null then
    select * into m from public.movimientos where idempotency_key = p_clave;
    return to_jsonb(m) || jsonb_build_object('duplicado', true);
  end if;
  return to_jsonb(m) || jsonb_build_object('duplicado', false);
end $$;

-- Anular no borra: el movimiento queda en el historial con autor, fecha y motivo, y deja de contar en los totales.
create or replace function public.anular_movimiento(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app.exigir_admin(); m public.movimientos;
begin
  if btrim(coalesce(p_motivo, '')) = '' then perform app.err('ZX422', 'Indicá el motivo de la anulación.'); end if;
  select * into m from public.movimientos where id = p_id for update;
  if not found then perform app.err('ZX404', 'El movimiento no existe.'); end if;
  if m.anulado_en is not null then return; end if;
  update public.movimientos set anulado_en = now(), anulado_por = v_uid, anulado_motivo = btrim(p_motivo) where id = p_id;
end $$;

-- ───────────── Exportación (solo Administrador) ─────────────
create or replace function public.exportar_datos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := app.exigir_admin(); t text; v_filas jsonb; v_tablas jsonb := '{}';
begin
  foreach t in array array['perfiles','configuracion','servicios','servicio_tarifas','clientes','equipos','consultas',
                           'presupuestos','presupuesto_versiones','presupuesto_items','ordenes','orden_items','orden_checklist',
                           'orden_eventos','movimientos','ideas','adjuntos','auditoria'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.%I x', t) into v_filas;
    v_tablas := v_tablas || jsonb_build_object(t, v_filas);
  end loop;
  return jsonb_build_object('sistema', 'ZENIX · Centro de operaciones', 'formato', 1, 'generado_en', now(),
                            'nota', 'Los adjuntos figuran por su ruta o enlace; los archivos del Storage no viajan en esta exportación.',
                            'tablas', v_tablas);
end $$;

-- ───────────── Datos de demostración: se cargan y se borran aparte, siempre marcados es_demo ─────────────
create or replace function public.demo_cargar() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app.exigir_admin(); v_c1 uuid; v_c2 uuid; v_e1 uuid; v_q1 uuid; v_p1 uuid; v_p2 uuid; v_o1 uuid; v_serv uuid; v_precio bigint;
begin
  if exists (select 1 from public.clientes where es_demo) then
    perform app.err('ZX422', 'Los datos de demostración ya están cargados.');
  end if;
  perform set_config('app.demo', '1', true);
  select s.id, t.precio into v_serv, v_precio from public.servicios s
    join public.servicio_tarifas t on t.servicio_id = s.id and t.vigente_hasta is null
    where s.activo and t.precio is not null order by s.created_at limit 1;
  if v_serv is null then perform app.err('ZX422', 'Cargá al menos un servicio con precio antes de usar la demostración.'); end if;

  insert into public.clientes (nombre, telefono, canal_origen, observaciones) values ('Cliente Demo Uno', '0981 000 001', 'instagram', 'Registro de demostración') returning id into v_c1;
  insert into public.clientes (nombre, telefono, canal_origen) values ('Cliente Demo Dos', '0981 000 002', 'whatsapp') returning id into v_c2;
  insert into public.equipos (cliente_id, tipo, marca, modelo) values (v_c1, 'laptop', 'Marca Demo', 'Modelo D-15') returning id into v_e1;
  insert into public.consultas (cliente_id, servicio_id, detalle, responsable_id, proxima_actividad, fecha_seguimiento)
    values (v_c2, v_serv, 'Consulta de demostración: pide precio de mantenimiento', v_uid, 'Responder consulta', app.hoy()) returning id into v_q1;
  insert into public.consultas (cliente_id, servicio_id, detalle, responsable_id) values (v_c1, v_serv, 'Consulta de demostración convertida en trabajo', v_uid);

  v_p1 := public.guardar_presupuesto(gen_random_uuid(), null, v_c2, v_q1, app.hoy() + 7, 0, null, 'Presupuesto de demostración',
            jsonb_build_array(jsonb_build_object('servicio_id', v_serv, 'cantidad', 1, 'precio_unitario', v_precio)));
  perform public.marcar_presupuesto(v_p1, 'enviado');
  v_p2 := public.guardar_presupuesto(gen_random_uuid(), null, v_c1, null, app.hoy() + 7, 0, null, null,
            jsonb_build_array(jsonb_build_object('servicio_id', v_serv, 'cantidad', 1, 'precio_unitario', v_precio)));
  perform public.aprobar_presupuesto(v_p2, 'whatsapp', now(), 'Aprobación de demostración');
  v_o1 := public.convertir_presupuesto(v_p2, v_e1, v_uid, 'Calienta y hace ruido (demostración)', 'Sin golpes visibles', 'Cargador', app.hoy() + 2);
  perform public.cambiar_estado_orden(v_o1, 'en_mantenimiento');
  if v_precio >= 2 then
    perform public.registrar_movimiento(gen_random_uuid(), 'cobro', v_precio / 2, app.hoy(), 'efectivo', 'Anticipo de demostración', null, v_o1);
  end if;
  perform public.registrar_movimiento(gen_random_uuid(), 'gasto', 10000, app.hoy(), 'efectivo', 'Gasto de demostración', 'traslado', null, v_c1);
  insert into public.ideas (titulo, nota, formato, canal, prioridad) values ('Idea de demostración: antes y después de una limpieza', 'Ejemplo para probar el listado.', 'reel', 'instagram', 'media');
  perform set_config('app.demo', '', true);
end $$;

create or replace function public.demo_borrar() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := app.exigir_admin();
begin
  perform set_config('app.demo', '1', true);
  delete from public.adjuntos a where (a.entidad = 'orden' and a.entidad_id in (select id from public.ordenes where es_demo))
     or (a.entidad = 'idea' and a.entidad_id in (select id from public.ideas where es_demo))
     or (a.entidad = 'cliente' and a.entidad_id in (select id from public.clientes where es_demo));
  delete from public.movimientos where es_demo;
  delete from public.orden_checklist where orden_id in (select id from public.ordenes where es_demo);
  delete from public.orden_eventos where orden_id in (select id from public.ordenes where es_demo);
  delete from public.orden_items where orden_id in (select id from public.ordenes where es_demo);
  delete from public.ordenes where es_demo;
  delete from public.presupuesto_items where version_id in (select v.id from public.presupuesto_versiones v join public.presupuestos p on p.id = v.presupuesto_id where p.es_demo);
  delete from public.presupuesto_versiones where presupuesto_id in (select id from public.presupuestos where es_demo);
  delete from public.presupuestos where es_demo;
  delete from public.consultas where es_demo;
  delete from public.equipos where es_demo;
  delete from public.clientes where es_demo;
  delete from public.ideas where es_demo;
  perform set_config('app.demo', '', true);
exception when foreign_key_violation then
  raise exception 'Hay registros reales vinculados a datos de demostración. Revisalos antes de borrar la demostración.' using errcode = 'ZX422';
end $$;

-- ───────────── Alta de socios: solo desde el editor SQL / rol de servicio (nunca desde la app) ─────────────
create or replace function public.alta_socio(p_email text, p_nombre text, p_rol text default 'admin') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if not found then
    raise exception 'No existe un usuario con el correo %. Crealo primero en Authentication → Users.', p_email;
  end if;
  insert into public.perfiles (id, nombre, rol) values (v_id, btrim(p_nombre), p_rol)
  on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol, activo = true;
  return v_id;
end $$;
