// Revisión visual de pantallas (escritorio y celular) con Chrome sin interfaz.
// OJO: esto NO es una prueba de punta a punta. El navegador no habla con Supabase: las lecturas se responden
// con filas reales de la base local de pruebas (datos demo) a través de un intermediario mínimo de solo lectura.
// Sirve para detectar errores de render, desbordes y fallas de consola. La integración real se prueba contra el proyecto Supabase.
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import pg from 'pg';
import { mkdirSync } from 'node:fs';

pg.types.setTypeParser(20, Number);
const db = new pg.Client({ host: '127.0.0.1', port: Number(process.env.PGPORT || 54329), user: 'postgres', database: process.env.ZENIX_DB || 'zenix_ui' });
await db.connect();
const uid = (await db.query(`select id from public.perfiles where rol = 'admin' limit 1`)).rows[0].id;
const filas = async (t) => (await db.query(`select to_jsonb(x) j from public.${t.replace(/[^a-z_]/g, '')} x`)).rows.map((r) => r.j);
const EMBEDS = {
  servicios: async (r) => ({ ...r, tarifas: (await filas('servicio_tarifas')).filter((t) => t.servicio_id === r.id) }),
  consultas: async (r) => ({ ...r, cliente: (await filas('clientes')).find((c) => c.id === r.cliente_id), servicio: (await filas('servicios')).find((s) => s.id === r.servicio_id) ?? null }),
  presupuesto_versiones: async (r) => ({ ...r, items: (await filas('presupuesto_items')).filter((i) => i.version_id === r.id) }),
};
async function rest(route) {
  const req = route.request(); const url = new URL(req.url()); const tabla = url.pathname.split('/').pop();
  if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 403, json: { code: '42501', message: 'solo lectura en la revisión visual' } });
  let rows = await filas(tabla);
  for (const [k, v] of url.searchParams) {
    const m = /^(eq|gte|lte)\.(.*)$/.exec(v); if (!m || ['select', 'order', 'limit'].includes(k)) continue;
    rows = rows.filter((r) => m[1] === 'eq' ? String(r[k]) === m[2] : m[1] === 'gte' ? r[k] >= m[2] : r[k] <= m[2]);
  }
  const ord = url.searchParams.get('order')?.split(',')[0]?.split('.');
  if (ord) rows.sort((a, b) => (a[ord[0]] > b[ord[0]] ? 1 : a[ord[0]] < b[ord[0]] ? -1 : 0) * (ord[1] === 'desc' ? -1 : 1));
  if (EMBEDS[tabla]) rows = await Promise.all(rows.map(EMBEDS[tabla]));
  const headers = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': `0-${rows.length}/${rows.length}` };
  if ((req.headers().accept || '').includes('vnd.pgrst.object')) return rows[0] ? route.fulfill({ json: rows[0], headers }) : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'sin filas' }, headers });
  return route.fulfill({ json: rows, headers });
}

const srv = await preview({ preview: { port: 4179, strictPort: true }, logLevel: 'silent' });
const base = 'http://localhost:4179';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const out = process.env.OUT || 'capturas'; mkdirSync(out, { recursive: true });
const problemas = [];
const ids = {
  orden: (await db.query('select id from public.ordenes limit 1')).rows[0]?.id,
  pre: (await db.query(`select id from public.presupuestos where estado = 'enviado' limit 1`)).rows[0]?.id,
  cli: (await db.query('select cliente_id id from public.ordenes limit 1')).rows[0]?.id,
};
const sesion = JSON.stringify({ access_token: 'x.' + Buffer.from(JSON.stringify({ sub: uid, exp: 4102444800 })).toString('base64url') + '.x', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: uid, email: 'socio1@zenix.test', aud: 'authenticated', role: 'authenticated' } });

async function recorrer(nombre, viewport, conSesion, rutas) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, locale: 'es-PY', timezoneId: 'America/Asuncion' });
  if (conSesion) await ctx.addInitScript((s) => localStorage.setItem('sb-mock-auth-token', s), sesion);
  await ctx.route('https://mock.supabase.co/rest/v1/**', rest);
  await ctx.route('https://mock.supabase.co/auth/v1/**', (r) => r.fulfill({ json: JSON.parse(sesion).user, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route('https://mock.supabase.co/storage/v1/**', (r) => r.fulfill({ json: [], headers: { 'access-control-allow-origin': '*' } }));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') problemas.push(`[${nombre}] consola: ${m.text()}`); });
  page.on('pageerror', (e) => problemas.push(`[${nombre}] excepción: ${e.message}`));
  for (const [archivo, ruta, accion] of rutas) {
    await page.goto(base + ruta, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    if (accion) { await accion(page); await page.waitForTimeout(400); }
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (desborde > 2) problemas.push(`[${nombre}] ${ruta}: desborde horizontal de ${desborde}px`);
    if (await page.getByText('No pudimos cargar').count()) problemas.push(`[${nombre}] ${ruta}: error de carga visible`);
    await page.screenshot({ path: `${out}/${nombre}-${archivo}.png`, fullPage: !accion });
  }
  await ctx.close();
}
const rutas = [
  ['inicio', '/'], ['clientes', '/clientes'], ['cliente', `/clientes/${ids.cli}`], ['consultas', '/consultas'], ['presupuestos', '/presupuestos'],
  ['presupuesto', `/presupuestos/${ids.pre}`], ['presupuesto-nuevo', '/presupuestos/nuevo'], ['taller', '/taller'], ['orden', `/taller/${ids.orden}`],
  ['orden-nueva', '/taller/nueva'], ['finanzas', '/finanzas'], ['contenido', '/contenido'], ['inventario', '/inventario'], ['ajustes', '/ajustes'],
];
await recorrer('escritorio', { width: 1366, height: 850 }, true, [...rutas,
  ['modal-cobro', `/taller/${ids.orden}`, (p) => p.getByRole('button', { name: 'Registrar cobro' }).click()],
  ['modal-mensaje', `/presupuestos/${ids.pre}`, (p) => p.getByRole('button', { name: /WhatsApp/ }).click()],
  ['modal-servicio', '/ajustes', (p) => p.getByRole('button', { name: 'Editar' }).first().click()]]);
await recorrer('celular', { width: 390, height: 844 }, true, [...rutas,
  ['mas', '/', (p) => p.getByRole('button', { name: 'Más' }).click()],
  ['idea', '/contenido?nueva=1', null], ['modal-idea', '/contenido', (p) => p.getByRole('button', { name: 'Guardar idea' }).click()]]);
await recorrer('sin-sesion', { width: 390, height: 844 }, false, [['ingreso', '/taller']]);
await browser.close(); await db.end(); await new Promise((r) => srv.httpServer.close(r));
console.log(problemas.length ? 'PROBLEMAS:\n' + [...new Set(problemas)].join('\n') : 'Sin errores de consola, de carga ni desbordes en ' + (rutas.length * 2 + 7) + ' pantallas.');
process.exit(problemas.length ? 1 : 0);
