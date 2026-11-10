-- ZENIX · Centro de operaciones — Fase 1 · Esquema base
-- Reglas: importes en guaraníes como bigint (enteros); fechas "de negocio" como date en America/Asuncion;
-- nada se borra si está referenciado (FK restrict); las copias de precio/condiciones son inmutables.

create schema if not exists app;

create or replace function app.hoy() returns date
language sql stable set search_path = '' as
$$ select (now() at time zone 'America/Asuncion')::date $$;

-- ───────────────────────── Socios ─────────────────────────
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete restrict,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  rol text not null default 'operador' check (rol in ('admin', 'operador')),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create or replace function app.es_miembro() returns boolean
language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.perfiles p where p.id = (select auth.uid()) and p.activo) $$;

create or replace function app.es_admin() returns boolean
language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.perfiles p where p.id = (select auth.uid()) and p.activo and p.rol = 'admin') $$;

create or replace function app.exigir_miembro() returns uuid
language plpgsql stable set search_path = '' as $$
declare v uuid := (select auth.uid());
begin
  if v is null or not app.es_miembro() then
    raise exception 'No tenés permiso para esta acción.' using errcode = 'ZX403';
  end if;
  return v;
end $$;

create or replace function app.exigir_admin() returns uuid
language plpgsql stable set search_path = '' as $$
declare v uuid := (select auth.uid());
begin
  if v is null or not app.es_admin() then
    raise exception 'Esta acción requiere el rol Administrador.' using errcode = 'ZX403';
  end if;
  return v;
end $$;

-- ───────────────────────── Auditoría ─────────────────────────
create table public.auditoria (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id text not null,
  accion text not null check (accion in ('alta', 'cambio', 'baja')),
  autor uuid,
  cambios jsonb,
  created_at timestamptz not null default now()
);
create index auditoria_registro_idx on public.auditoria (tabla, registro_id, created_at desc);

-- ───────────────────────── Disparadores comunes ─────────────────────────
-- Control de concurrencia: el cliente envía la versión que leyó; si otro socio guardó antes, se rechaza.
create or replace function app.tg_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.version is distinct from old.version then
    raise exception 'Otro socio modificó este registro mientras lo editabas. Recargá para ver la versión actual.'
      using errcode = 'ZX409';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

create or replace function app.tg_autor() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_by := coalesce((select auth.uid()), new.created_by);
  return new;
end $$;

-- Los datos de demostración solo nacen desde demo_cargar() o heredan la marca del cliente.
create or replace function app.tg_demo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name in ('equipos', 'consultas') then
    select c.es_demo into new.es_demo from public.clientes c where c.id = new.cliente_id;
    new.es_demo := coalesce(new.es_demo, false);
  else
    new.es_demo := coalesce(current_setting('app.demo', true), '') = '1';
  end if;
  return new;
end $$;

create or replace function app.tg_auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_new jsonb; v_old jsonb; v_cambios jsonb; v_id text;
begin
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if coalesce(v_new, v_old) ->> 'es_demo' = 'true' or coalesce(current_setting('app.demo', true), '') = '1' then return null; end if;
  v_id := coalesce(coalesce(v_new, v_old) ->> 'id', coalesce(v_new, v_old) ->> 'clave');
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into v_cambios
    from jsonb_each(v_new) n join jsonb_each(v_old) o using (key)
    where n.value is distinct from o.value and n.key not in ('updated_at', 'version');
    if v_cambios is null then return null; end if;
  elsif tg_op = 'DELETE' then
    v_cambios := v_old;
  end if;
  insert into public.auditoria (tabla, registro_id, accion, autor, cambios)
  values (tg_table_name, v_id,
          case tg_op when 'INSERT' then 'alta' when 'UPDATE' then 'cambio' else 'baja' end,
          (select auth.uid()), v_cambios);
  return null;
end $$;

-- Siempre debe quedar al menos un administrador activo.
create or replace function app.tg_ultimo_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.rol = 'admin' and old.activo and not (new.rol = 'admin' and new.activo)
     and not exists (select 1 from public.perfiles p where p.id <> old.id and p.rol = 'admin' and p.activo) then
    raise exception 'Tiene que quedar al menos un Administrador activo.' using errcode = 'ZX422';
  end if;
  return new;
end $$;
create trigger perfiles_ultimo_admin before update on public.perfiles
  for each row execute function app.tg_ultimo_admin();

-- ───────────────────────── Configuración editable ─────────────────────────
create table public.configuracion (
  clave text primary key check (clave in ('negocio', 'comercial', 'reparto', 'plantillas')),
  valor jsonb not null check (jsonb_typeof(valor) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.perfiles (id),
  version integer not null default 1
);

create or replace function app.tg_configuracion() returns trigger
language plpgsql set search_path = '' as $$
declare a numeric; b numeric; r numeric;
begin
  new.updated_by := (select auth.uid());
  if new.clave = 'reparto' then
    a := (new.valor ->> 'socio1_pct')::numeric; b := (new.valor ->> 'socio2_pct')::numeric;
    r := (new.valor ->> 'reserva_pct')::numeric;
    if a is null or b is null or r is null or a < 0 or b < 0 or a + b <> 100 or r < 0 or r > 100 then
      raise exception 'El reparto entre socios debe sumar 100 %% y la reserva estar entre 0 y 100 %%.' using errcode = 'ZX422';
    end if;
  elsif new.clave = 'comercial' then
    if coalesce((new.valor ->> 'vigencia_dias')::int, 0) not between 1 and 365 then
      raise exception 'La vigencia de los presupuestos debe estar entre 1 y 365 días.' using errcode = 'ZX422';
    end if;
  elsif new.clave = 'negocio' then
    if char_length(btrim(coalesce(new.valor ->> 'nombre', ''))) not between 1 and 80 then
      raise exception 'El nombre comercial es obligatorio (hasta 80 caracteres).' using errcode = 'ZX422';
    end if;
  end if;
  return new;
end $$;
create trigger configuracion_validar before insert or update on public.configuracion
  for each row execute function app.tg_configuracion();

-- ───────────────────────── Catálogo y versiones de tarifa ─────────────────────────
create table public.servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 120),
  tipo text not null default 'servicio' check (tipo in ('servicio', 'producto')),
  descripcion text check (char_length(descripcion) <= 2000),
  activo boolean not null default true,
  created_by uuid references public.perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create unique index servicios_nombre_uq on public.servicios (lower(btrim(nombre)));

create table public.servicio_tarifas (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios (id) on delete restrict,
  precio bigint check (precio is null or precio between 0 and 100000000000), -- null = a cotizar
  inclusiones jsonb not null default '[]' check (jsonb_typeof(inclusiones) = 'array'),
  exclusiones jsonb not null default '[]' check (jsonb_typeof(exclusiones) = 'array'),
  checklist jsonb not null default '[]' check (jsonb_typeof(checklist) = 'array'),
  condiciones text check (char_length(condiciones) <= 2000),
  vigente_desde timestamptz not null default now(),
  vigente_hasta timestamptz,
  created_by uuid references public.perfiles (id),
  created_at timestamptz not null default now()
);
create unique index servicio_tarifa_vigente_uq on public.servicio_tarifas (servicio_id) where vigente_hasta is null;
create index servicio_tarifas_servicio_idx on public.servicio_tarifas (servicio_id, vigente_desde desc);

-- ───────────────────────── Clientes, equipos, consultas ─────────────────────────
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  telefono text check (telefono ~ '^[0-9+() -]{6,25}$'),
  email text check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 160),
  direccion text check (char_length(direccion) <= 300),
  canal_origen text check (canal_origen in ('instagram', 'whatsapp', 'facebook', 'tiktok', 'recomendacion', 'local', 'otro')),
  observaciones text check (char_length(observaciones) <= 2000),
  archivado boolean not null default false,
  es_demo boolean not null default false,
  created_by uuid references public.perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index clientes_nombre_idx on public.clientes (lower(nombre));

create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete restrict,
  tipo text not null check (tipo in ('laptop', 'pc', 'tarjeta_grafica', 'celular', 'otro')),
  marca text check (char_length(marca) <= 80),
  modelo text check (char_length(modelo) <= 120),
  serie text check (char_length(serie) <= 80),
  notas text check (char_length(notas) <= 1000),
  es_demo boolean not null default false,
  created_by uuid references public.perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index equipos_cliente_idx on public.equipos (cliente_id);

create table public.consultas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete restrict,
  servicio_id uuid references public.servicios (id) on delete restrict,
  detalle text not null check (char_length(btrim(detalle)) between 1 and 2000),
  responsable_id uuid references public.perfiles (id),
  estado text not null default 'consulta'
    check (estado in ('consulta', 'presupuesto_enviado', 'aprobado', 'convertido', 'rechazado', 'cancelado')),
  proxima_actividad text check (char_length(proxima_actividad) <= 200),
  fecha_seguimiento date,
  motivo_cierre text check (char_length(motivo_cierre) <= 500),
  es_demo boolean not null default false,
  created_by uuid references public.perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint consultas_motivo_ck check (estado not in ('rechazado', 'cancelado') or btrim(coalesce(motivo_cierre, '')) <> '')
);
create index consultas_cliente_idx on public.consultas (cliente_id);
create index consultas_abiertas_idx on public.consultas (fecha_seguimiento) where estado in ('consulta', 'presupuesto_enviado', 'aprobado');

-- ───────────────────────── Presupuestos con versiones ─────────────────────────
create sequence public.presupuesto_numero_seq;
create table public.presupuestos (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique default nextval('public.presupuesto_numero_seq'),
  cliente_id uuid not null references public.clientes (id) on delete restrict,
  consulta_id uuid references public.consultas (id) on delete restrict,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'enviado', 'aprobado', 'rechazado', 'cancelado', 'convertido')),
  version_actual integer not null default 1,
  enviado_en timestamptz,
  aprobado_en timestamptz,
  aprobado_medio text check (aprobado_medio in ('whatsapp', 'llamada', 'presencial', 'correo', 'otro')),
  aprobado_nota text check (char_length(aprobado_nota) <= 500),
  aprobado_por uuid references public.perfiles (id), -- socio que registró la aprobación
  motivo_cierre text check (char_length(motivo_cierre) <= 500),
  es_demo boolean not null default false,
  created_by uuid references public.perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint presupuestos_aprobacion_ck check (estado not in ('aprobado', 'convertido') or (aprobado_en is not null and aprobado_medio is not null))
);
create index presupuestos_cliente_idx on public.presupuestos (cliente_id);
create index presupuestos_estado_idx on public.presupuestos (estado);

create table public.presupuesto_versiones (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos (id) on delete restrict,
  numero_version integer not null check (numero_version >= 1),
  vigencia_hasta date,
  anticipo bigint not null default 0 check (anticipo >= 0),
  condiciones text check (char_length(condiciones) <= 4000),
  notas text check (char_length(notas) <= 2000),
  total bigint not null default 0 check (total >= 0),
  clave_idem uuid unique,
  created_by uuid references public.perfiles (id),
  created_at timestamptz not null default now(),
  unique (presupuesto_id, numero_version),
  check (anticipo <= total)
);

create table public.presupuesto_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.presupuesto_versiones (id) on delete restrict,
  posicion integer not null,
  servicio_id uuid references public.servicios (id) on delete restrict,
  tarifa_id uuid references public.servicio_tarifas (id) on delete restrict,
  descripcion text not null check (char_length(btrim(descripcion)) between 1 and 300),
  cantidad integer not null check (cantidad between 1 and 999),
  precio_unitario bigint not null check (precio_unitario between 0 and 100000000000),
  descuento bigint not null default 0 check (descuento >= 0),
  inclusiones jsonb not null default '[]',
  exclusiones jsonb not null default '[]',
  checklist jsonb not null default '[]',
  total bigint generated always as (cantidad * precio_unitario - descuento) stored,
  check (descuento <= cantidad * precio_unitario)
);
create index presupuesto_items_version_idx on public.presupuesto_items (version_id, posicion);

-- ───────────────────────── Órdenes de servicio ─────────────────────────
create sequence public.orden_numero_seq;
create table public.ordenes (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique default nextval('public.orden_numero_seq'),
  cliente_id uuid not null references public.clientes (id) on delete restrict,
  equipo_id uuid not null references public.equipos (id) on delete restrict,
  presupuesto_id uuid unique references public.presupuestos (id) on delete restrict,
  presupuesto_version_id uuid references public.presupuesto_versiones (id) on delete restrict,
  responsable_id uuid references public.perfiles (id),
  estado text not null default 'recepcion'
    check (estado in ('recepcion', 'diagnostico', 'esperando_aprobacion', 'en_mantenimiento', 'pruebas', 'listo', 'entregado', 'en_espera', 'cancelado')),
  estado_anterior text,
  motivo_estado text check (char_length(motivo_estado) <= 500),
  problema text check (char_length(problema) <= 2000),
  condicion_recepcion text check (char_length(condicion_recepcion) <= 2000),
  accesorios text check (char_length(accesorios) <= 500),
  diagnostico text check (char_length(diagnostico) <= 4000),
  trabajo_aprobado text check (char_length(trabajo_aprobado) <= 2000),
  observaciones text check (char_length(observaciones) <= 4000),
  recomendaciones text check (char_length(recomendaciones) <= 4000),
  condiciones text,
  fecha_ingreso timestamptz not null default now(),
  entrega_prevista date,
  entregado_en timestamptz,
  clave_idem uuid unique,
  es_demo boolean not null default false,
  created_by uuid references public.perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint ordenes_motivo_ck check (estado not in ('en_espera', 'cancelado') or btrim(coalesce(motivo_estado, '')) <> '')
);
create index ordenes_estado_idx on public.ordenes (estado);
create index ordenes_cliente_idx on public.ordenes (cliente_id);

create table public.orden_items (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes (id) on delete restrict,
  posicion integer not null,
  servicio_id uuid references public.servicios (id) on delete restrict,
  descripcion text not null check (char_length(btrim(descripcion)) between 1 and 300),
  cantidad integer not null check (cantidad between 1 and 999),
  precio_unitario bigint not null check (precio_unitario between 0 and 100000000000),
  descuento bigint not null default 0 check (descuento >= 0),
  inclusiones jsonb not null default '[]',
  exclusiones jsonb not null default '[]',
  total bigint generated always as (cantidad * precio_unitario - descuento) stored,
  origen text not null check (origen in ('presupuesto', 'directo', 'adicional')),
  aprobado_en timestamptz,
  aprobado_medio text check (aprobado_medio in ('whatsapp', 'llamada', 'presencial', 'correo', 'otro')),
  aprobado_nota text check (char_length(aprobado_nota) <= 500),
  clave_idem uuid unique,
  created_by uuid references public.perfiles (id),
  created_at timestamptz not null default now(),
  check (descuento <= cantidad * precio_unitario),
  constraint orden_items_adicional_ck check (origen <> 'adicional' or (aprobado_en is not null and aprobado_medio is not null))
);
create index orden_items_orden_idx on public.orden_items (orden_id, posicion);

create table public.orden_checklist (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes (id) on delete restrict,
  posicion integer not null default 0,
  texto text not null check (char_length(btrim(texto)) between 1 and 200),
  hecho boolean not null default false,
  hecho_por uuid references public.perfiles (id),
  hecho_en timestamptz,
  created_at timestamptz not null default now()
);
create index orden_checklist_orden_idx on public.orden_checklist (orden_id, posicion);

create or replace function app.tg_checklist() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.hecho := false; new.hecho_por := null; new.hecho_en := null;
  elsif new.hecho is distinct from old.hecho then
    new.hecho_por := case when new.hecho then (select auth.uid()) end;
    new.hecho_en := case when new.hecho then now() end;
  else
    new.hecho_por := old.hecho_por; new.hecho_en := old.hecho_en;
  end if;
  return new;
end $$;
create trigger orden_checklist_marca before insert or update on public.orden_checklist
  for each row execute function app.tg_checklist();

create table public.orden_eventos (
  id bigint generated always as identity primary key,
  orden_id uuid not null references public.ordenes (id) on delete restrict,
  de_estado text,
  a_estado text,
  nota text check (char_length(nota) <= 1000),
  autor uuid references public.perfiles (id),
  created_at timestamptz not null default now()
);
create index orden_eventos_orden_idx on public.orden_eventos (orden_id, created_at);

-- ───────────────────────── Cobros y gastos ─────────────────────────
create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('cobro', 'gasto')),
  monto bigint not null check (monto between 1 and 100000000000),
  fecha date not null default app.hoy(),
  medio text not null check (medio in ('efectivo', 'transferencia', 'tarjeta', 'billetera', 'otro')),
  concepto text not null check (char_length(btrim(concepto)) between 1 and 200),
  categoria text check (categoria in ('insumos', 'repuestos', 'traslado', 'envio', 'herramientas', 'servicios', 'otro')),
  orden_id uuid references public.ordenes (id) on delete restrict,
  cliente_id uuid references public.clientes (id) on delete restrict,
  comprobante text check (char_length(comprobante) <= 80),
  idempotency_key uuid not null unique,
  anulado_en timestamptz,
  anulado_por uuid references public.perfiles (id),
  anulado_motivo text check (char_length(anulado_motivo) <= 500),
  es_demo boolean not null default false,
  created_by uuid references public.perfiles (id),
  created_at timestamptz not null default now(),
  constraint movimientos_anulado_ck check (anulado_en is null or btrim(coalesce(anulado_motivo, '')) <> '')
);
create index movimientos_fecha_idx on public.movimientos (fecha desc);
create index movimientos_orden_idx on public.movimientos (orden_id) where orden_id is not null;

-- ───────────────────────── Ideas de contenido ─────────────────────────
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 160),
  nota text check (char_length(nota) <= 4000),
  enlace text check (enlace ~ '^https?://' and char_length(enlace) <= 500),
  servicio_id uuid references public.servicios (id) on delete restrict,
  objetivo text check (char_length(objetivo) <= 200),
  canal text check (canal in ('instagram', 'facebook', 'tiktok', 'whatsapp', 'otro')),
  formato text check (formato in ('reel', 'flyer', 'carrusel', 'historia', 'video', 'otro')),
  responsable_id uuid references public.perfiles (id),
  prioridad text not null default 'media' check (prioridad in ('baja', 'media', 'alta')),
  estado text not null default 'idea'
    check (estado in ('idea', 'en_preparacion', 'en_diseno', 'en_revision', 'listo', 'publicado', 'descartada')),
  es_demo boolean not null default false,
  created_by uuid references public.perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index ideas_estado_idx on public.ideas (estado, created_at desc);

-- ───────────────────────── Adjuntos (archivo privado o enlace externo) ─────────────────────────
create table public.adjuntos (
  id uuid primary key default gen_random_uuid(),
  entidad text not null check (entidad in ('orden', 'idea', 'cliente')),
  entidad_id uuid not null,
  etiqueta text not null default 'otro' check (etiqueta in ('recepcion', 'antes', 'despues', 'otro')),
  origen text not null check (origen in ('archivo', 'enlace')),
  storage_path text,
  enlace text check (enlace ~ '^https?://' and char_length(enlace) <= 500),
  nombre text check (char_length(nombre) <= 200),
  mime text check (char_length(mime) <= 100),
  tamano bigint check (tamano between 0 and 5242880),
  created_by uuid references public.perfiles (id),
  created_at timestamptz not null default now(),
  constraint adjuntos_origen_ck check (
    (origen = 'archivo' and storage_path is not null and enlace is null)
    or (origen = 'enlace' and enlace is not null and storage_path is null))
);
create index adjuntos_entidad_idx on public.adjuntos (entidad, entidad_id);
create unique index adjuntos_path_uq on public.adjuntos (storage_path) where storage_path is not null;

-- ───────────────────────── Aplicar disparadores comunes ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['perfiles','configuracion','servicios','clientes','equipos','consultas','presupuestos','ordenes','ideas'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.tg_version()', t || '_version', t);
  end loop;
  foreach t in array array['clientes','equipos','consultas','ideas','adjuntos'] loop
    execute format('create trigger %I before insert on public.%I for each row execute function app.tg_autor()', t || '_autor', t);
  end loop;
  foreach t in array array['clientes','equipos','consultas','ideas'] loop
    execute format('create trigger %I before insert on public.%I for each row execute function app.tg_demo()', t || '_demo', t);
  end loop;
  foreach t in array array['perfiles','configuracion','servicios','servicio_tarifas','clientes','consultas','presupuestos','ordenes','orden_items','movimientos'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.tg_auditar()', t || '_auditar', t);
  end loop;
end $$;

-- ───────────────────────── Vistas (respetan RLS de quien consulta) ─────────────────────────
create or replace function app.saldo_orden(p_orden uuid) returns bigint
language sql stable set search_path = '' as $$
  select (coalesce((select sum(i.total) from public.orden_items i where i.orden_id = p_orden), 0)
        - coalesce((select sum(m.monto) from public.movimientos m
                    where m.orden_id = p_orden and m.tipo = 'cobro' and m.anulado_en is null), 0))::bigint
$$;

create view public.ordenes_resumen with (security_invoker = true) as
select o.id, o.numero, o.estado, o.motivo_estado, o.cliente_id, c.nombre as cliente_nombre, c.telefono as cliente_telefono,
       o.equipo_id, e.tipo as equipo_tipo, e.marca as equipo_marca, e.modelo as equipo_modelo,
       o.responsable_id, o.fecha_ingreso, o.entrega_prevista, o.entregado_en, o.presupuesto_id, o.es_demo, o.updated_at,
       coalesce(t.total, 0)::bigint as total,
       coalesce(m.cobrado, 0)::bigint as cobrado,
       (coalesce(t.total, 0) - coalesce(m.cobrado, 0))::bigint as saldo,
       coalesce(k.hechos, 0)::integer as checklist_hechos,
       coalesce(k.items, 0)::integer as checklist_total
from public.ordenes o
join public.clientes c on c.id = o.cliente_id
join public.equipos e on e.id = o.equipo_id
left join lateral (select sum(i.total) as total from public.orden_items i where i.orden_id = o.id) t on true
left join lateral (select sum(x.monto) as cobrado from public.movimientos x
                   where x.orden_id = o.id and x.tipo = 'cobro' and x.anulado_en is null) m on true
left join lateral (select count(*) filter (where h.hecho) as hechos, count(*) as items
                   from public.orden_checklist h where h.orden_id = o.id) k on true;

create view public.presupuestos_resumen with (security_invoker = true) as
select p.id, p.numero, p.estado, p.cliente_id, c.nombre as cliente_nombre, c.telefono as cliente_telefono,
       p.consulta_id, p.version_actual, p.enviado_en, p.aprobado_en, p.aprobado_medio, p.es_demo,
       p.created_by, p.created_at, p.updated_at, p.version,
       v.id as version_id, v.total, v.anticipo, v.vigencia_hasta,
       o.id as orden_id, o.numero as orden_numero
from public.presupuestos p
join public.clientes c on c.id = p.cliente_id
join public.presupuesto_versiones v on v.presupuesto_id = p.id and v.numero_version = p.version_actual
left join public.ordenes o on o.presupuesto_id = p.id;

-- Pendientes reales para Inicio: cada fila tiene responsable, fecha, estado y vínculo al registro.
create view public.pendientes with (security_invoker = true) as
select 'seguimiento'::text as tipo, 'consulta'::text as ref_tipo, q.id as ref_id, null::integer as numero,
       c.nombre as cliente_nombre, coalesce(q.proxima_actividad, 'Seguimiento de consulta') as detalle,
       q.fecha_seguimiento as fecha, q.responsable_id, q.estado, null::bigint as monto, q.es_demo
from public.consultas q join public.clientes c on c.id = q.cliente_id
where q.estado in ('consulta', 'presupuesto_enviado', 'aprobado') and q.fecha_seguimiento is not null
union all
select case p.estado when 'enviado' then 'presupuesto_pendiente' else 'presupuesto_aprobado' end, 'presupuesto', p.id, p.numero,
       p.cliente_nombre, case p.estado when 'enviado' then 'Presupuesto enviado sin respuesta' else 'Aprobado: falta convertirlo en orden' end,
       coalesce(p.vigencia_hasta, (p.updated_at at time zone 'America/Asuncion')::date), p.created_by, p.estado, p.total, p.es_demo
from public.presupuestos_resumen p where p.estado in ('enviado', 'aprobado')
union all
select 'entrega', 'orden', o.id, o.numero, o.cliente_nombre, 'Entrega prevista', o.entrega_prevista, o.responsable_id, o.estado, o.saldo, o.es_demo
from public.ordenes_resumen o
where o.estado not in ('entregado', 'cancelado', 'listo') and o.entrega_prevista is not null
union all
select 'listo', 'orden', o.id, o.numero, o.cliente_nombre, 'Listo para entregar',
       coalesce(o.entrega_prevista, (o.updated_at at time zone 'America/Asuncion')::date), o.responsable_id, o.estado, o.saldo, o.es_demo
from public.ordenes_resumen o where o.estado = 'listo'
union all
select 'cobro', 'orden', o.id, o.numero, o.cliente_nombre, 'Entregado con saldo pendiente',
       (o.entregado_en at time zone 'America/Asuncion')::date, o.responsable_id, o.estado, o.saldo, o.es_demo
from public.ordenes_resumen o where o.estado = 'entregado' and o.saldo > 0;
