import { Link, useNavigate } from 'react-router-dom';
import { Banknote, CalendarCheck, CircleCheck, ChevronRight, Lightbulb, MessageCircleQuestion, PackageSearch, Wrench } from 'lucide-react';
import { useAuth } from '../auth';
import { ACCIONES } from '../Layout';
import { useConsultas, useIdeas, useNombreSocio, useOrdenes, usePendientes } from '../lib/api';
import { CONSULTA, ORDEN, PRESUPUESTO } from '../lib/etiquetas';
import { fechaRelativa, gs, hoyISO, nOrden, nPresupuesto } from '../lib/format';
import type { Pendiente } from '../lib/types';
import { Boton, Cargando, Demo, Encabezado, ErrorCarga, Insignia, Seccion, Tarjeta, Vacio, cx } from '../ui';

const RUTA = { consulta: '/consultas', presupuesto: '/presupuestos', orden: '/taller' } as const;
const TITULO: Record<string, string> = { seguimiento: 'Seguimiento', presupuesto_pendiente: 'Presupuesto sin respuesta', presupuesto_aprobado: 'Convertir en orden', entrega: 'Entrega prevista', listo: 'Listo para entregar', cobro: 'Cobro pendiente' };

function Fila({ p, nombre }: { p: Pendiente; nombre: (id: string | null) => string }) {
  const hoy = hoyISO();
  const est = (p.ref_tipo === 'orden' ? ORDEN : p.ref_tipo === 'presupuesto' ? PRESUPUESTO : CONSULTA)[p.estado];
  const ref = p.ref_tipo === 'orden' ? nOrden(p.numero!) : p.ref_tipo === 'presupuesto' ? nPresupuesto(p.numero!) : null;
  const vencido = p.fecha < hoy && p.tipo !== 'cobro';
  return (
    <li>
      <Link to={p.ref_tipo === 'consulta' ? `/consultas?ver=${p.ref_id}` : `${RUTA[p.ref_tipo]}/${p.ref_id}`} className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-mint">
        <span className={cx('w-16 shrink-0 text-center text-xs font-bold', vencido ? 'text-danger' : 'text-deep')}>{fechaRelativa(p.fecha)}{vencido && <span className="block font-semibold">Atrasado</span>}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 text-sm font-bold text-deep">{TITULO[p.tipo]}{ref && <span className="font-semibold text-muted">{ref}</span>}<Demo si={p.es_demo} /></span>
          <span className="block truncate text-sm text-ink">{p.cliente_nombre} · {p.detalle}{p.monto ? ` · ${p.tipo === 'cobro' || p.tipo === 'listo' ? 'saldo ' : ''}${gs(p.monto)}` : ''}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted"><Insignia tono={est?.tono}>{est?.t ?? p.estado}</Insignia>{nombre(p.responsable_id)}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );
}

export default function Inicio() {
  const { perfil } = useAuth();
  const ir = useNavigate();
  const nombre = useNombreSocio();
  const pend = usePendientes();
  const ordenes = useOrdenes();
  const consultas = useConsultas();
  const ideas = useIdeas();
  const hoy = hoyISO();
  const abiertas = (ordenes.data ?? []).filter((o) => !['entregado', 'cancelado'].includes(o.estado));
  const porCobrar = (ordenes.data ?? []).filter((o) => o.estado !== 'cancelado' && o.saldo > 0);
  const kpis = [
    { t: 'Equipos en taller', v: String(abiertas.filter((o) => o.estado !== 'listo').length), i: Wrench, a: '/taller' },
    { t: 'Listos para entregar', v: String(abiertas.filter((o) => o.estado === 'listo').length), i: CircleCheck, a: '/taller?f=listo' },
    { t: 'Por cobrar', v: gs(porCobrar.reduce((s, o) => s + o.saldo, 0)), i: Banknote, a: '/finanzas' },
    { t: 'Consultas abiertas', v: String((consultas.data ?? []).filter((c) => ['consulta', 'presupuesto_enviado'].includes(c.estado)).length), i: MessageCircleQuestion, a: '/consultas' },
  ];
  const lista = pend.data ?? [];
  const deHoy = lista.filter((p) => p.fecha <= hoy);
  const proximos = lista.filter((p) => p.fecha > hoy).slice(0, 8);
  const ideasPend = (ideas.data ?? []).filter((i) => !['publicado', 'descartada'].includes(i.estado));
  return (
    <>
      <Encabezado titulo="Tu día, en orden." detalle={`Hola, ${perfil?.nombre}. Pendientes y movimientos de Zenix al ${fechaRelativa(hoy).toLowerCase() === 'hoy' ? 'día de hoy' : hoy}.`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.t} to={k.a} className="rounded-2xl border border-line bg-surface p-4 shadow-card hover:border-brand">
            <span className="flex items-center gap-2 text-sm font-semibold text-muted"><k.i className="size-5 text-brand-strong" aria-hidden />{k.t}</span>
            <span className="mt-2 block text-2xl font-extrabold text-deep">{ordenes.isLoading ? '…' : k.v}</span>
          </Link>
        ))}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Seccion titulo="Hoy y atrasados" icono={CalendarCheck} className="lg:col-span-2">
          {pend.isLoading ? <Cargando /> : pend.error ? <ErrorCarga error={pend.error} reintentar={() => void pend.refetch()} /> : deHoy.length === 0 ? (
            <Vacio icono={CalendarCheck} titulo="Nada pendiente para hoy">Acá aparecen los seguimientos, entregas, presupuestos sin respuesta y cobros que vencen hoy o están atrasados.</Vacio>
          ) : <ul className="divide-y divide-line">{deHoy.map((p) => <Fila key={p.tipo + p.ref_id} p={p} nombre={nombre} />)}</ul>}
          {proximos.length > 0 && <>
            <h3 className="mb-1 mt-5 text-sm font-bold text-muted">Próximos</h3>
            <ul className="divide-y divide-line">{proximos.map((p) => <Fila key={p.tipo + p.ref_id} p={p} nombre={nombre} />)}</ul>
          </>}
        </Seccion>
        <div className="space-y-5">
          <Tarjeta className="hidden p-4 lg:block">
            <h2 className="mb-3 text-base font-bold text-deep">Acciones rápidas</h2>
            <div className="grid gap-2">{ACCIONES.map(([t, a, I], n) => <Boton key={a} variante={n === 2 ? 'primario' : 'secundario'} icono={I} className="justify-start" onClick={() => ir(a)}>{t}</Boton>)}</div>
          </Tarjeta>
          <Seccion titulo="Contenido por preparar" icono={Lightbulb} accion={<Link to="/contenido" className="text-sm font-semibold text-brand-strong hover:underline">Ver ideas</Link>}>
            {ideasPend.length === 0 ? <p className="text-sm text-muted">No hay ideas pendientes. Guardá la próxima apenas se te ocurra.</p> : (
              <ul className="space-y-2">{ideasPend.slice(0, 4).map((i) => <li key={i.id} className="truncate text-sm"><span className="font-semibold text-deep">{i.titulo}</span> <span className="text-muted">· {nombre(i.responsable_id)}</span></li>)}</ul>
            )}
            {ideasPend.length > 4 && <p className="mt-2 text-xs text-muted">y {ideasPend.length - 4} más</p>}
          </Seccion>
          <Seccion titulo="Alertas de stock" icono={PackageSearch}>
            <p className="text-sm text-muted">Todavía no disponible: llega con el inventario en la fase 2.</p>
          </Seccion>
        </div>
      </div>
    </>
  );
}
