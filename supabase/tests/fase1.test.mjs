// Pruebas de aceptación de la fase 1 contra PostgreSQL real (ver scripts/db-local.sh).
// Cada "sesión" imita lo que hace Supabase: rol authenticated/anon + identidad del token (auth.uid()).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

pg.types.setTypeParser(20, Number); // bigint → number (los importes en guaraníes caben holgadamente)
const base = { host: '127.0.0.1', port: Number(process.env.PGPORT || 54329), user: 'postgres', database: process.env.ZENIX_DB || 'zenix_test' };
const abiertas = [];
async function sesion(sub) {
  const c = new pg.Client(base); await c.connect(); abiertas.push(c);
  if (sub === 'postgres') return c;
  if (sub) {
    await c.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub, role: 'authenticated' })]);
    await c.query('set role authenticated');
  } else await c.query('set role anon');
  return c;
}
const falla = (codigo) => (e) => { assert.equal(e.code, codigo, `esperaba ${codigo}, llegó ${e.code}: ${e.message}`); return true; };
const una = async (c, sql, p = []) => (await c.query(sql, p)).rows[0];
const S = {};

before(async () => {
  S.root = await sesion('postgres');
  for (const [k, email] of [['a', 'socio1@zenix.test'], ['b', 'socio2@zenix.test'], ['x', 'intruso@zenix.test']]) {
    S[k + 'Id'] = (await una(S.root, 'insert into auth.users (email) values ($1) returning id', [email])).id;
  }
  await S.root.query(`select public.alta_socio('socio1@zenix.test', 'Socio Uno', 'admin')`);
  await S.root.query(`select public.alta_socio('socio2@zenix.test', 'Socio Dos', 'operador')`);
  S.a = await sesion(S.aId); S.b = await sesion(S.bId); S.x = await sesion(S.xId); S.anon = await sesion(null);
});
after(async () => { await Promise.all(abiertas.map((c) => c.end())); });

test('sin sesión no se accede a registros, funciones ni archivos privados', async () => {
  for (const t of ['clientes', 'ordenes', 'movimientos', 'perfiles', 'configuracion', 'ordenes_resumen', 'pendientes', 'auditoria']) {
    await assert.rejects(S.anon.query(`select * from public.${t}`), falla('42501'));
  }
  await assert.rejects(S.anon.query('select public.exportar_datos()'), falla('42501'));
  await assert.rejects(S.anon.query(`select public.registrar_movimiento($1,'cobro',1000,null,'efectivo','x')`, [randomUUID()]), falla('42501'));
  await assert.rejects(S.anon.query(`select public.alta_socio('a@b.c','x','admin')`), falla('42501'));
  await S.root.query(`insert into storage.objects (bucket_id, name) values ('zenix-privado', 'ordenes/prueba.jpg')`);
  assert.equal((await S.anon.query('select * from storage.objects')).rowCount, 0);
  await assert.rejects(S.anon.query(`insert into storage.objects (bucket_id, name) values ('zenix-privado', 'x.jpg')`), falla('42501'));
  assert.equal((await una(S.root, `select public from storage.buckets where id = 'zenix-privado'`)).public, false);
});

test('una cuenta autenticada que no es socia tampoco ve ni escribe nada', async () => {
  for (const t of ['clientes', 'servicios', 'perfiles', 'configuracion', 'movimientos']) {
    assert.equal((await S.x.query(`select * from public.${t}`)).rowCount, 0, t);
  }
  await assert.rejects(S.x.query(`insert into public.clientes (nombre) values ('Intruso')`), falla('42501'));
  await assert.rejects(S.x.query(`select public.registrar_movimiento($1,'gasto',1000,null,'efectivo','x','otro')`, [randomUUID()]), falla('ZX403'));
  await assert.rejects(S.x.query('select public.exportar_datos()'), falla('ZX403'));
  await assert.rejects(S.x.query(`select public.alta_socio('intruso@zenix.test','Yo','admin')`), falla('42501'));
  assert.equal((await S.x.query('select * from storage.objects')).rowCount, 0);
  await assert.rejects(S.x.query(`insert into storage.objects (bucket_id, name) values ('zenix-privado', 'x.jpg')`), falla('42501'));
});

test('catálogo inicial con las tarifas confirmadas', async () => {
  const r = (await S.b.query(`select s.nombre, t.precio, jsonb_array_length(t.inclusiones) n, jsonb_array_length(t.exclusiones) e
     from servicios s join servicio_tarifas t on t.servicio_id = s.id and t.vigente_hasta is null order by s.nombre`)).rows;
  const por = Object.fromEntries(r.map((x) => [x.nombre, x]));
  assert.equal(por['Mantenimiento de PC'].precio, 150000);
  assert.equal(por['Mantenimiento de laptop'].precio, 160000);
  assert.equal(por['Mantenimiento de laptop'].e, 1);
  assert.equal(por['Mantenimiento de tarjeta gráfica'].precio, 30000);
  assert.equal(por['Mantenimiento de tarjeta gráfica'].n, 0, 'las inclusiones de tarjeta gráfica quedan pendientes');
  assert.equal(por['Mantenimiento de laptop gaming con metal líquido'].precio, null, 'se cotiza aparte');
  S.laptop = (await una(S.b, `select id from servicios where nombre = 'Mantenimiento de laptop'`)).id;
});

test('crear un cliente y una consulta', async () => {
  S.cli = await una(S.b, `insert into clientes (nombre, telefono, canal_origen, es_demo) values ('Ana Prueba', '0981 123 456', 'instagram', true) returning *`);
  assert.equal(S.cli.created_by, S.bId);
  assert.equal(S.cli.es_demo, false, 'la marca demo no se puede forzar desde la app');
  await assert.rejects(S.b.query(`insert into clientes (nombre, telefono) values ('Mal', 'abc')`), falla('23514'));
  S.con = await una(S.b, `insert into consultas (cliente_id, servicio_id, detalle, responsable_id, proxima_actividad, fecha_seguimiento)
     values ($1, $2, 'Laptop calienta mucho', $3, 'Enviar presupuesto', app.hoy()) returning *`, [S.cli.id, S.laptop, S.bId]);
  assert.equal(S.con.estado, 'consulta');
  await assert.rejects(S.b.query(`update consultas set estado = 'rechazado' where id = $1`, [S.con.id]), falla('23514'));
  S.equipo = await una(S.b, `insert into equipos (cliente_id, tipo, marca, modelo) values ($1, 'laptop', 'Lenovo', 'IdeaPad 3') returning *`, [S.cli.id]);
});

test('presupuesto de laptop a Gs. 160.000, con reintento que no duplica', async () => {
  const clave = randomUUID();
  const items = JSON.stringify([{ servicio_id: S.laptop, cantidad: 1, precio_unitario: 160000, descuento: 0 }]);
  const args = [clave, S.cli.id, S.con.id, items];
  const sql = `select public.guardar_presupuesto($1, null, $2, $3, app.hoy() + 7, 0, 'Condiciones acordadas', null, $4::jsonb) id`;
  S.pre = (await una(S.b, sql, args)).id;
  assert.equal((await una(S.b, sql, args)).id, S.pre, 'misma clave → mismo presupuesto');
  assert.equal((await una(S.b, 'select count(*)::int n from presupuestos')).n, 1);
  const r = await una(S.b, 'select * from presupuestos_resumen where id = $1', [S.pre]);
  assert.equal(r.total, 160000); assert.equal(r.estado, 'borrador'); assert.equal(r.version_actual, 1);
  const it = await una(S.b, 'select * from presupuesto_items where version_id = $1', [r.version_id]);
  assert.equal(it.descripcion, 'Mantenimiento de laptop');
  assert.equal(it.inclusiones.length, 4); assert.equal(it.exclusiones.length, 1); assert.notEqual(it.tarifa_id, null);
  await assert.rejects(S.b.query(`select public.guardar_presupuesto($1, null, $2, null, null, 0, null, null, '[]'::jsonb)`, [randomUUID(), S.cli.id]), falla('ZX422'));
  await assert.rejects(S.b.query(`select public.guardar_presupuesto($1, null, $2, null, null, 999999, null, null, $3::jsonb)`, [randomUUID(), S.cli.id, items]), falla('ZX422'));
});

test('registrar la aprobación y convertirlo en orden sin reescribir datos', async () => {
  await assert.rejects(S.b.query('select public.convertir_presupuesto($1, $2, $3)', [S.pre, S.equipo.id, S.bId]), falla('ZX422'));
  await S.b.query(`select public.marcar_presupuesto($1, 'enviado')`, [S.pre]);
  assert.equal((await una(S.b, 'select estado from consultas where id = $1', [S.con.id])).estado, 'presupuesto_enviado');
  await assert.rejects(S.b.query(`select public.aprobar_presupuesto($1, null)`, [S.pre]), falla('ZX422'));
  await S.b.query(`select public.aprobar_presupuesto($1, 'whatsapp', now(), 'Confirmó por mensaje')`, [S.pre]);
  const p = await una(S.b, 'select * from presupuestos where id = $1', [S.pre]);
  assert.equal(p.estado, 'aprobado'); assert.equal(p.aprobado_medio, 'whatsapp'); assert.equal(p.aprobado_por, S.bId); assert.ok(p.aprobado_en);
  const otroCliente = await una(S.b, `insert into clientes (nombre) values ('Otro') returning id`);
  const ajeno = await una(S.b, `insert into equipos (cliente_id, tipo) values ($1, 'pc') returning id`, [otroCliente.id]);
  await assert.rejects(S.b.query('select public.convertir_presupuesto($1, $2, $3)', [S.pre, ajeno.id, S.bId]), falla('ZX422'));
  const sql = `select public.convertir_presupuesto($1, $2, $3, 'Calienta mucho', 'Rayones en la tapa', 'Cargador', app.hoy() + 2) id`;
  S.orden = (await una(S.b, sql, [S.pre, S.equipo.id, S.bId])).id;
  assert.equal((await una(S.b, sql, [S.pre, S.equipo.id, S.bId])).id, S.orden, 'convertir dos veces devuelve la misma orden');
  assert.equal((await una(S.b, 'select count(*)::int n from ordenes')).n, 1);
  const o = await una(S.b, 'select * from ordenes_resumen where id = $1', [S.orden]);
  assert.equal(o.total, 160000); assert.equal(o.saldo, 160000); assert.equal(o.checklist_total, 4); assert.equal(o.estado, 'recepcion');
  assert.equal((await una(S.b, 'select condiciones from ordenes where id = $1', [S.orden])).condiciones, 'Condiciones acordadas');
  assert.equal((await una(S.b, 'select estado from presupuestos where id = $1', [S.pre])).estado, 'convertido');
  assert.equal((await una(S.b, 'select estado from consultas where id = $1', [S.con.id])).estado, 'convertido');
});

test('cambiar la tarifa del catálogo no altera la orden ni el presupuesto anteriores', async () => {
  const inc = JSON.stringify(['Limpieza interna', 'Limpieza de ventiladores', 'Cambio de pasta térmica', 'Revisión de temperatura', 'Prueba de estrés']);
  const sql = `select public.guardar_servicio($1, 'Mantenimiento de laptop', 'servicio', null, true, 185000, $2::jsonb, '[]'::jsonb, $2::jsonb, null)`;
  await assert.rejects(S.b.query(sql, [S.laptop, inc]), falla('ZX403'));
  await S.a.query(sql, [S.laptop, inc]);
  const t = (await S.b.query('select precio, vigente_hasta from servicio_tarifas where servicio_id = $1 order by vigente_desde', [S.laptop])).rows;
  assert.equal(t.length, 2); assert.equal(t[0].precio, 160000); assert.notEqual(t[0].vigente_hasta, null);
  assert.equal(t[1].precio, 185000); assert.equal(t[1].vigente_hasta, null);
  assert.equal((await una(S.b, 'select total from ordenes_resumen where id = $1', [S.orden])).total, 160000);
  const oi = await una(S.b, 'select precio_unitario, inclusiones from orden_items where orden_id = $1', [S.orden]);
  assert.equal(oi.precio_unitario, 160000); assert.equal(oi.inclusiones.length, 4);
  assert.equal((await una(S.b, 'select total from presupuestos_resumen where id = $1', [S.pre])).total, 160000);
  await S.a.query(sql, [S.laptop, inc]); // guardar sin cambios no abre otra versión
  assert.equal((await una(S.b, 'select count(*)::int n from servicio_tarifas where servicio_id = $1', [S.laptop])).n, 2);
  await assert.rejects(S.b.query('update servicio_tarifas set precio = 1 where servicio_id = $1', [S.laptop]), falla('42501'));
  await assert.rejects(S.b.query('update presupuesto_items set precio_unitario = 1'), falla('42501'));
  await assert.rejects(S.b.query('update orden_items set precio_unitario = 1'), falla('42501'));
});

test('revisar un presupuesto crea una versión nueva y conserva el historial', async () => {
  const it = (p) => JSON.stringify([{ servicio_id: S.laptop, cantidad: 1, precio_unitario: p }]);
  const id = (await una(S.a, `select public.guardar_presupuesto($1, null, $2, null, null, 0, null, null, $3::jsonb) id`, [randomUUID(), S.cli.id, it(185000)])).id;
  const v1 = await una(S.a, 'select version from presupuestos where id = $1', [id]);
  await S.a.query(`select public.guardar_presupuesto($1, $2, null, null, null, 50000, null, 'Con descuento', $3::jsonb, $4)`, [randomUUID(), id, it(170000), v1.version]);
  await assert.rejects(S.b.query(`select public.guardar_presupuesto($1, $2, null, null, null, 0, null, null, $3::jsonb, $4)`, [randomUUID(), id, it(1), v1.version]), falla('ZX409'));
  const vs = (await S.b.query('select numero_version, total, anticipo from presupuesto_versiones where presupuesto_id = $1 order by 1', [id])).rows;
  assert.deepEqual(vs, [{ numero_version: 1, total: 185000, anticipo: 0 }, { numero_version: 2, total: 170000, anticipo: 50000 }]);
  assert.equal((await una(S.b, 'select total, version_actual from presupuestos_resumen where id = $1', [id])).total, 170000);
  await assert.rejects(S.b.query(`select public.marcar_presupuesto($1, 'rechazado')`, [id]), falla('ZX422'));
  await assert.rejects(S.b.query(`select public.guardar_presupuesto($1, $2, null, null, null, 0, null, null, $3::jsonb)`, [randomUUID(), S.pre, it(1)]), falla('ZX422'));
  S.pre2 = id;
});

test('completar checklist: queda registrado quién y cuándo', async () => {
  const filas = (await S.b.query('select id from orden_checklist where orden_id = $1 order by posicion', [S.orden])).rows;
  await S.b.query('update orden_checklist set hecho = true where id = $1', [filas[0].id]);
  await S.a.query('update orden_checklist set hecho = true where id = any($1)', [filas.slice(1).map((f) => f.id)]);
  const r = (await S.b.query('select hecho, hecho_por, hecho_en from orden_checklist where orden_id = $1 order by posicion', [S.orden])).rows;
  assert.equal(r[0].hecho_por, S.bId); assert.equal(r[1].hecho_por, S.aId); assert.ok(r.every((x) => x.hecho && x.hecho_en));
  await assert.rejects(S.b.query('update orden_checklist set hecho_por = $1 where id = $2', [S.aId, filas[0].id]), falla('42501'));
  assert.equal((await una(S.b, 'select checklist_hechos h from ordenes_resumen where id = $1', [S.orden])).h, 4);
});

test('avanzar estados con historial, motivo obligatorio y detección de conflicto', async () => {
  await assert.rejects(S.b.query(`update ordenes set estado = 'listo' where id = $1`, [S.orden]), falla('42501'));
  let v = (await una(S.b, 'select version from ordenes where id = $1', [S.orden])).version;
  await S.b.query(`select public.cambiar_estado_orden($1, 'diagnostico', null, $2)`, [S.orden, v]);
  await assert.rejects(S.a.query(`select public.cambiar_estado_orden($1, 'pruebas', null, $2)`, [S.orden, v]), falla('ZX409'));
  await assert.rejects(S.b.query(`select public.cambiar_estado_orden($1, 'en_espera')`, [S.orden]), falla('ZX422'));
  await S.b.query(`select public.cambiar_estado_orden($1, 'en_espera', 'Esperando repuesto')`, [S.orden]);
  await S.b.query(`select public.cambiar_estado_orden($1, 'en_mantenimiento')`, [S.orden]);
  await S.b.query(`select public.cambiar_estado_orden($1, 'pruebas')`, [S.orden]);
  await S.b.query(`select public.cambiar_estado_orden($1, 'listo')`, [S.orden]);
  const ev = (await S.b.query('select a_estado, autor from orden_eventos where orden_id = $1 order by id', [S.orden])).rows;
  assert.deepEqual(ev.map((e) => e.a_estado), ['recepcion', 'diagnostico', 'en_espera', 'en_mantenimiento', 'pruebas', 'listo']);
  // edición simultánea de los textos de la orden
  v = (await una(S.a, 'select version from ordenes where id = $1', [S.orden])).version;
  await S.a.query(`update ordenes set diagnostico = 'Pasta seca', version = $2 where id = $1`, [S.orden, v]);
  await assert.rejects(S.b.query(`update ordenes set diagnostico = 'Otro texto', version = $2 where id = $1`, [S.orden, v]), falla('ZX409'));
  assert.equal((await una(S.b, 'select diagnostico d from ordenes where id = $1', [S.orden])).d, 'Pasta seca');
});

test('pago parcial, saldo y reintento sin duplicar', async () => {
  const clave = randomUUID();
  const sql = `select public.registrar_movimiento($1, 'cobro', 60000, app.hoy(), 'transferencia', 'Anticipo', null, $2) m`;
  const m1 = (await una(S.b, sql, [clave, S.orden])).m;
  assert.equal(m1.duplicado, false);
  const m2 = (await una(S.b, sql, [clave, S.orden])).m;
  assert.equal(m2.duplicado, true); assert.equal(m2.id, m1.id);
  let o = await una(S.b, 'select cobrado, saldo from ordenes_resumen where id = $1', [S.orden]);
  assert.deepEqual(o, { cobrado: 60000, saldo: 100000 });
  // doble clic real: dos solicitudes simultáneas con la misma clave desde dos conexiones
  const c2 = randomUUID(); const dos = await sesion(S.bId);
  const sql2 = `select public.registrar_movimiento($1, 'cobro', 40000, app.hoy(), 'efectivo', 'Segundo pago', null, $2) m`;
  const [r1, r2] = await Promise.all([una(S.b, sql2, [c2, S.orden]), una(dos, sql2, [c2, S.orden])]);
  assert.equal(r1.m.id, r2.m.id); assert.equal([r1.m.duplicado, r2.m.duplicado].filter(Boolean).length, 1);
  o = await una(S.b, 'select cobrado, saldo from ordenes_resumen where id = $1', [S.orden]);
  assert.deepEqual(o, { cobrado: 100000, saldo: 60000 });
  assert.equal((await una(S.b, `select count(*)::int n from movimientos where orden_id = $1`, [S.orden])).n, 2);
  await assert.rejects(S.b.query(`select public.registrar_movimiento($1, 'cobro', 60001, null, 'efectivo', 'De más', null, $2)`, [randomUUID(), S.orden]), falla('ZX422'));
  await assert.rejects(S.b.query(`select public.registrar_movimiento($1, 'cobro', 0, null, 'efectivo', 'Cero')`, [randomUUID()]), falla('ZX422'));
  await assert.rejects(S.b.query(`insert into movimientos (tipo, monto, medio, concepto, idempotency_key) values ('cobro', 5, 'efectivo', 'directo', gen_random_uuid())`), falla('42501'));
  await assert.rejects(S.b.query('update movimientos set monto = 1'), falla('42501'));
  await assert.rejects(S.b.query('delete from movimientos'), falla('42501'));
  S.mov = m1.id;
});

test('gastos básicos y anulación trazable (solo Administrador)', async () => {
  await assert.rejects(S.b.query(`select public.registrar_movimiento($1, 'gasto', 25000, null, 'efectivo', 'Pasta térmica')`, [randomUUID()]), falla('ZX422'));
  const g = (await una(S.b, `select public.registrar_movimiento($1, 'gasto', 25000, null, 'efectivo', 'Pasta térmica', 'insumos') m`, [randomUUID()])).m;
  assert.equal(g.tipo, 'gasto'); assert.equal(g.created_by, S.bId);
  await assert.rejects(S.b.query(`select public.anular_movimiento($1, 'Error')`, [S.mov]), falla('ZX403'));
  await assert.rejects(S.a.query(`select public.anular_movimiento($1, '')`, [S.mov]), falla('ZX422'));
  await S.a.query(`select public.anular_movimiento($1, 'Se cargó dos veces')`, [S.mov]);
  const m = await una(S.b, 'select anulado_por, anulado_motivo, monto from movimientos where id = $1', [S.mov]);
  assert.equal(m.anulado_por, S.aId); assert.equal(m.monto, 60000, 'el registro original se conserva');
  assert.equal((await una(S.b, 'select saldo from ordenes_resumen where id = $1', [S.orden])).saldo, 120000);
});

test('trabajo adicional: exige aprobación y no toca lo acordado', async () => {
  await assert.rejects(S.b.query(`select public.agregar_adicional($1, $2, 'Cambio de cooler', 1, 80000, 0, null)`, [randomUUID(), S.orden]), falla('ZX422'));
  const k = randomUUID();
  const sql = `select public.agregar_adicional($1, $2, 'Cambio de cooler', 1, 80000, 0, 'llamada', 'Aceptó por teléfono') id`;
  const a1 = await una(S.b, sql, [k, S.orden]); const a2 = await una(S.b, sql, [k, S.orden]);
  assert.equal(a1.id, a2.id);
  const o = await una(S.b, 'select total, saldo from ordenes_resumen where id = $1', [S.orden]);
  assert.deepEqual(o, { total: 240000, saldo: 200000 });
  assert.equal((await una(S.b, 'select total from presupuestos_resumen where id = $1', [S.pre])).total, 160000);
});

test('entrega y reapertura: una orden cerrada solo la reabre un Administrador', async () => {
  await S.b.query(`select public.cambiar_estado_orden($1, 'entregado')`, [S.orden]);
  assert.ok((await una(S.b, 'select entregado_en e from ordenes where id = $1', [S.orden])).e);
  assert.equal((await S.b.query(`update ordenes set diagnostico = 'x' where id = $1`, [S.orden])).rowCount, 0, 'una orden cerrada no se edita');
  await assert.rejects(S.b.query(`select public.cambiar_estado_orden($1, 'pruebas')`, [S.orden]), falla('ZX403'));
  const p = (await S.b.query(`select tipo, monto, responsable_id, fecha, estado, ref_tipo, ref_id from pendientes where ref_id = $1`, [S.orden])).rows;
  assert.deepEqual(p.map((x) => x.tipo), ['cobro']); assert.equal(p[0].monto, 200000); assert.equal(p[0].responsable_id, S.bId);
  await S.a.query(`select public.cambiar_estado_orden($1, 'listo')`, [S.orden]);
});

test('orden directa (sin presupuesto) con clave anti-duplicado', async () => {
  const k = randomUUID(); const pc = (await una(S.b, `select id from servicios where nombre = 'Mantenimiento de PC'`)).id;
  const sql = `select public.crear_orden($1, $2, $3, null, 'No enciende', null, null, null, $4::jsonb) id`;
  const items = JSON.stringify([{ servicio_id: pc, precio_unitario: 150000 }]);
  const o1 = await una(S.b, sql, [k, S.cli.id, S.equipo.id, items]); const o2 = await una(S.b, sql, [k, S.cli.id, S.equipo.id, items]);
  assert.equal(o1.id, o2.id);
  const r = await una(S.b, 'select total, checklist_total, responsable_id from ordenes_resumen where id = $1', [o1.id]);
  assert.deepEqual(r, { total: 150000, checklist_total: 4, responsable_id: S.bId });
  const gaming = (await una(S.b, `select id from servicios where nombre like '%metal líquido'`)).id;
  await assert.rejects(S.b.query(sql, [randomUUID(), S.cli.id, S.equipo.id, JSON.stringify([{ servicio_id: gaming }])]), falla('ZX422'));
});

test('edición simultánea de un cliente: el segundo guardado se rechaza', async () => {
  const v = (await una(S.a, 'select version from clientes where id = $1', [S.cli.id])).version;
  await S.a.query(`update clientes set observaciones = 'Prefiere WhatsApp', version = $2 where id = $1`, [S.cli.id, v]);
  await assert.rejects(S.b.query(`update clientes set observaciones = 'Llamar de tarde', version = $2 where id = $1`, [S.cli.id, v]), falla('ZX409'));
  const c = await una(S.b, 'select observaciones, version from clientes where id = $1', [S.cli.id]);
  assert.equal(c.observaciones, 'Prefiere WhatsApp'); assert.equal(c.version, v + 1);
  await assert.rejects(S.b.query('delete from clientes where id = $1', [S.cli.id]), falla('42501'));
});

test('permisos del segundo usuario (Socio operador) frente al Administrador', async () => {
  assert.equal((await S.b.query(`update configuracion set valor = valor || '{"nombre":"Hack"}' where clave = 'negocio'`)).rowCount, 0);
  assert.equal((await S.b.query(`update perfiles set rol = 'admin' where id = $1`, [S.bId])).rowCount, 0);
  assert.equal((await S.b.query('select * from auditoria')).rowCount, 0);
  await assert.rejects(S.b.query('select public.exportar_datos()'), falla('ZX403'));
  await assert.rejects(S.b.query('select public.demo_cargar()'), falla('ZX403'));
  assert.equal((await S.a.query(`update configuracion set valor = valor || '{"nombre":"Zenix"}' where clave = 'negocio'`)).rowCount, 1);
  await assert.rejects(S.a.query(`update configuracion set valor = '{"socio1_pct":60,"socio2_pct":50,"reserva_pct":0}' where clave = 'reparto'`), falla('ZX422'));
  await assert.rejects(S.a.query(`update perfiles set rol = 'operador' where id = $1`, [S.aId]), falla('ZX422'));
  await S.a.query(`update perfiles set rol = 'admin' where id = $1`, [S.bId]); // ambos pueden ser administradores
  assert.equal((await una(S.b, 'select app.es_admin() ok')).ok, true);
  await S.a.query(`update perfiles set rol = 'operador' where id = $1`, [S.bId]);
  const aud = (await S.a.query(`select tabla, accion, autor from auditoria where tabla in ('servicio_tarifas', 'movimientos', 'configuracion', 'ordenes')`)).rows;
  assert.ok(aud.some((x) => x.tabla === 'servicio_tarifas' && x.autor === S.aId), 'el cambio de tarifa queda auditado');
  assert.ok(aud.some((x) => x.tabla === 'movimientos' && x.accion === 'cambio'), 'la anulación queda auditada');
  assert.ok(aud.some((x) => x.tabla === 'ordenes' && x.accion === 'cambio'), 'los cambios de estado quedan auditados');
  // dar de baja al socio le corta el acceso en la siguiente consulta
  await S.a.query(`update perfiles set activo = false where id = $1`, [S.bId]);
  assert.equal((await S.b.query('select * from clientes')).rowCount, 0);
  await S.a.query(`update perfiles set activo = true where id = $1`, [S.bId]);
});

test('guardar una idea y verla al volver a entrar (persistencia)', async () => {
  const i = await una(S.b, `insert into ideas (titulo, nota, formato, canal) values ('Antes y después de limpieza', 'Grabar con buena luz', 'reel', 'instagram') returning *`);
  assert.equal(i.estado, 'idea'); assert.equal(i.created_by, S.bId);
  await assert.rejects(S.b.query(`insert into ideas (titulo, enlace) values ('x', 'javascript:alert(1)')`), falla('23514'));
  const nueva = await sesion(S.bId); // "cerrar sesión y volver a entrar"
  assert.equal((await una(nueva, 'select titulo from ideas where id = $1', [i.id])).titulo, 'Antes y después de limpieza');
  assert.equal((await una(nueva, 'select saldo from ordenes_resumen where id = $1', [S.orden])).saldo, 200000);
});

test('archivos privados: un socio sube y ve; los adjuntos distinguen archivo de enlace', async () => {
  await S.b.query(`insert into storage.objects (bucket_id, name) values ('zenix-privado', 'ordenes/x/foto.jpg')`);
  assert.ok((await S.b.query('select * from storage.objects')).rowCount >= 1);
  await S.b.query(`insert into adjuntos (entidad, entidad_id, etiqueta, origen, storage_path, nombre) values ('orden', $1, 'antes', 'archivo', 'ordenes/x/foto.jpg', 'foto.jpg')`, [S.orden]);
  await S.b.query(`insert into adjuntos (entidad, entidad_id, origen, enlace) values ('orden', $1, 'enlace', 'https://example.com/a.jpg')`, [S.orden]);
  await assert.rejects(S.b.query(`insert into adjuntos (entidad, entidad_id, origen, enlace, storage_path) values ('orden', $1, 'enlace', 'https://e.com', 'x')`, [S.orden]), falla('23514'));
});

test('pendientes de Inicio: responsable, fecha, estado y vínculo', async () => {
  const p = (await S.b.query('select * from pendientes order by tipo')).rows;
  assert.ok(p.length >= 1);
  for (const x of p) { assert.ok(x.ref_id && x.ref_tipo && x.estado && x.fecha, JSON.stringify(x)); }
  assert.ok(p.some((x) => x.tipo === 'listo' && x.ref_id === S.orden));
});

test('exportación básica: contiene los datos reales y solo la obtiene el Administrador', async () => {
  const e = (await una(S.a, 'select public.exportar_datos() d')).d;
  assert.equal(e.formato, 1);
  assert.ok(e.tablas.clientes.some((c) => c.nombre === 'Ana Prueba'));
  assert.ok(e.tablas.ordenes.some((o) => o.id === S.orden));
  assert.equal(e.tablas.movimientos.length, 3);
  assert.ok(e.tablas.servicio_tarifas.length >= 5);
  assert.equal(e.tablas.presupuesto_items.filter((i) => i.precio_unitario === 160000).length, 1);
  for (const t of ['perfiles', 'configuracion', 'consultas', 'presupuestos', 'presupuesto_versiones', 'orden_items', 'orden_checklist', 'orden_eventos', 'ideas', 'adjuntos', 'auditoria']) assert.ok(Array.isArray(e.tablas[t]), t);
});

test('datos de demostración separados: se cargan marcados y se borran sin tocar los reales', async () => {
  const antes = await una(S.a, `select (select count(*) from clientes)::int c, (select count(*) from ordenes)::int o, (select count(*) from movimientos)::int m, (select count(*) from auditoria)::int a`);
  await S.a.query('select public.demo_cargar()');
  await assert.rejects(S.a.query('select public.demo_cargar()'), falla('ZX422'));
  const d = await una(S.a, `select (select count(*) from clientes where es_demo)::int c, (select count(*) from ordenes where es_demo)::int o,
     (select count(*) from movimientos where es_demo)::int m, (select count(*) from presupuestos where es_demo)::int p, (select count(*) from ideas where es_demo)::int i,
     (select count(*) from equipos where es_demo)::int e, (select count(*) from consultas where es_demo)::int q`);
  assert.deepEqual(d, { c: 2, o: 1, m: 2, p: 2, i: 1, e: 1, q: 2 });
  await S.a.query('select public.demo_borrar()');
  const despues = await una(S.a, `select (select count(*) from clientes)::int c, (select count(*) from ordenes)::int o, (select count(*) from movimientos)::int m, (select count(*) from auditoria)::int a`);
  assert.deepEqual(despues, antes, 'la demostración no deja rastro en los datos reales ni en la auditoría');
  assert.equal((await una(S.a, 'select count(*)::int n from ideas where es_demo')).n, 0);
});
