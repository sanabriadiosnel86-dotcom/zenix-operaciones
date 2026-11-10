-- ZENIX · Fase 1 · Configuración inicial (editable después desde Ajustes, sin tocar código).
-- Tarifas confirmadas por los socios el 10/11/2026. No se inventan otras tarifas.
insert into public.configuracion (clave, valor) values
  ('negocio', jsonb_build_object('nombre', 'Zenix Technologies', 'telefono', '', 'email', '', 'direccion', '', 'redes', '')),
  ('comercial', jsonb_build_object('vigencia_dias', 7, 'anticipo_pct', 0,
     'condiciones', 'Los repuestos y trabajos adicionales requieren presupuesto y aprobación separados.')),
  ('reparto', jsonb_build_object('socio1_pct', 50, 'socio2_pct', 50, 'reserva_pct', 0)),
  ('plantillas', jsonb_build_object(
     'whatsapp_presupuesto', E'Hola {cliente}, te paso el presupuesto {numero} de {negocio}:\n\n{detalle}\n\nTotal: {total}\nVálido hasta: {vigencia}\n\n{condiciones}\n\n¿Lo confirmamos?',
     'whatsapp_listo', E'Hola {cliente}, tu equipo de la orden {orden} ya está listo para retirar. Saldo pendiente: {saldo}. ¡Gracias por confiar en {negocio}!'))
on conflict (clave) do nothing;

do $$
declare v uuid; v_inc jsonb := '["Limpieza interna", "Limpieza de ventiladores", "Cambio de pasta térmica", "Revisión de temperatura"]';
        v_cond text := 'Los repuestos y trabajos adicionales requieren presupuesto y aprobación separados.';
begin
  if exists (select 1 from public.servicios) then return; end if;

  insert into public.servicios (nombre, tipo) values ('Mantenimiento de PC', 'servicio') returning id into v;
  insert into public.servicio_tarifas (servicio_id, precio, inclusiones, checklist, condiciones) values (v, 150000, v_inc, v_inc, v_cond);

  insert into public.servicios (nombre, tipo) values ('Mantenimiento de laptop', 'servicio') returning id into v;
  insert into public.servicio_tarifas (servicio_id, precio, inclusiones, exclusiones, checklist, condiciones)
  values (v, 160000, v_inc, '["Laptops gaming que utilicen metal líquido: cotización aparte"]', v_inc, v_cond);

  insert into public.servicios (nombre, tipo, descripcion)
  values ('Mantenimiento de tarjeta gráfica', 'servicio', 'Inclusiones pendientes de configurar en Ajustes.') returning id into v;
  insert into public.servicio_tarifas (servicio_id, precio, condiciones) values (v, 30000, v_cond);

  insert into public.servicios (nombre, tipo, descripcion)
  values ('Mantenimiento de laptop gaming con metal líquido', 'servicio', 'Sin tarifa fija: se cotiza aparte en cada caso.') returning id into v;
  insert into public.servicio_tarifas (servicio_id, precio, condiciones) values (v, null, v_cond);
end $$;
