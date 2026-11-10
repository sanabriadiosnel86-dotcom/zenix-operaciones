-- ZENIX · Fase 1 · Seguridad: RLS en todas las tablas y permisos explícitos.
-- Principio: sin sesión no se ve nada; con sesión pero sin perfil activo, tampoco.
-- IMPORTANTE para migraciones futuras: toda tabla nueva debe activar RLS y repetir este patrón de permisos.

do $$
declare t text;
begin
  foreach t in array array['perfiles','configuracion','auditoria','servicios','servicio_tarifas','clientes','equipos','consultas',
                           'presupuestos','presupuesto_versiones','presupuesto_items','ordenes','orden_items','orden_checklist',
                           'orden_eventos','movimientos','ideas','adjuntos'] loop
    execute format('alter table public.%I enable row level security', t);
    if t <> 'auditoria' then
      execute format('create policy "socios leen" on public.%I for select to authenticated using ((select app.es_miembro()))', t);
    end if;
  end loop;
  foreach t in array array['clientes','equipos','consultas','ideas'] loop
    execute format('create policy "socios crean" on public.%I for insert to authenticated with check ((select app.es_miembro()))', t);
    execute format('create policy "socios editan" on public.%I for update to authenticated using ((select app.es_miembro())) with check ((select app.es_miembro()))', t);
  end loop;
end $$;

create policy "admin lee auditoria" on public.auditoria for select to authenticated using ((select app.es_admin()));
create policy "admin edita socios" on public.perfiles for update to authenticated
  using ((select app.es_admin())) with check ((select app.es_admin()));
create policy "admin edita ajustes" on public.configuracion for update to authenticated
  using ((select app.es_admin())) with check ((select app.es_admin()));
create policy "socios editan orden" on public.ordenes for update to authenticated
  using ((select app.es_miembro()) and estado not in ('entregado', 'cancelado'))
  with check ((select app.es_miembro()));
create policy "socios agregan tareas" on public.orden_checklist for insert to authenticated with check ((select app.es_miembro()));
create policy "socios marcan tareas" on public.orden_checklist for update to authenticated
  using ((select app.es_miembro())) with check ((select app.es_miembro()));
create policy "socios adjuntan" on public.adjuntos for insert to authenticated with check ((select app.es_miembro()));
create policy "socios quitan adjuntos" on public.adjuntos for delete to authenticated using ((select app.es_miembro()));

-- >>> PERMISOS (bloque repetible: scripts/restaurar.sh lo vuelve a aplicar después de restaurar una copia)
grant usage on schema app to authenticated;
revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

-- Permisos de tabla: se parte de cero y se concede solo lo necesario.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;

grant insert, update on public.clientes, public.equipos, public.consultas, public.ideas to authenticated;
grant update (nombre, rol, activo, version) on public.perfiles to authenticated;
grant update (valor, version) on public.configuracion to authenticated;
-- Órdenes: desde la app solo se editan los textos de trabajo; estado e importes van por funciones.
grant update (responsable_id, problema, condicion_recepcion, accesorios, diagnostico, trabajo_aprobado,
              observaciones, recomendaciones, entrega_prevista, version) on public.ordenes to authenticated;
grant insert (orden_id, posicion, texto), update (hecho) on public.orden_checklist to authenticated;
grant insert, delete on public.adjuntos to authenticated;

-- Funciones públicas (RPC): nunca para anónimos.
revoke all on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
-- El alta de socios solo corre desde el editor SQL o con el rol de servicio.
revoke all on function public.alta_socio(text, text, text) from authenticated;
grant execute on function public.alta_socio(text, text, text) to service_role;
-- <<< PERMISOS
