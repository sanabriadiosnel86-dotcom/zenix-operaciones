import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Banknote, Camera, Check, ChevronRight, ClipboardCheck, ClipboardList, History, Laptop, Link2, MessageCircle, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { api, nuevaClave, useAccion, useClientes, useConfig, useEquipos, useFirmadas, useNombreSocio, useOrden, useOrdenes, useServicios, useSocios } from '../lib/api';
import { useAuth } from '../auth';
import { ESTADOS_ORDEN, MEDIOS_APROBACION, MEDIOS_PAGO, ORDEN, equipoTexto } from '../lib/etiquetas';
import { enlaceWhatsApp, fecha, fechaHora, fechaRelativa, gs, hoyISO, nOrden, plantilla, vacioANull } from '../lib/format';
import type { Concepto, Orden, OrdenResumen } from '../lib/types';
import { ConceptosEditor, EquipoModal, MovimientoModal, conceptoVacio, errorConceptos, totalConceptos, useForm } from '../forms';
import { Area, Boton, Buscador, Cargando, Dato, Demo, Encabezado, ErrorCarga, Filtros, Importe, Insignia, Modal, Seccion, Selector, Tarjeta, Texto, Vacio, cx } from '../ui';

const volverCls = 'mb-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-strong hover:underline';
type F = 'activas' | 'listo' | 'cerradas' | 'todas';

export function Taller() {
  const q = useOrdenes();
  const nombre = useNombreSocio();
  const [sp] = useSearchParams();
  const [filtro, setFiltro] = useState<F>(sp.get('f') === 'listo' ? 'listo' : 'activas');
  const [texto, setTexto] = useState('');
  const hoy = hoyISO();
  const lista = useMemo(() => (q.data ?? []).filter((o) => {
    const cerrada = ['entregado', 'cancelado'].includes(o.estado);
    if (filtro === 'activas' && cerrada) return false;
    if (filtro === 'listo' && o.estado !== 'listo') return false;
    if (filtro === 'cerradas' && !cerrada) return false;
    const t = texto.trim().toLowerCase();
    return !t || `${nOrden(o.numero)} ${o.cliente_nombre} ${equipoTexto(o)}`.toLowerCase().includes(t);
  }), [q.data, filtro, texto]);
  return (
    <>
      <Encabezado titulo="Taller" detalle="Cada equipo, bajo control." acciones={<Link to="/taller/nueva" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-strong px-4 text-[15px] font-semibold text-white hover:bg-deep"><Plus className="size-4" aria-hidden />Nueva orden</Link>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Filtros etiqueta="Filtrar órdenes" valor={filtro} onCambio={setFiltro} opciones={[['activas', 'En curso'], ['listo', 'Listas'], ['cerradas', 'Cerradas'], ['todas', 'Todas']]} />
        <Buscador valor={texto} onCambio={setTexto} placeholder="Buscar por orden, cliente o equipo…" />
      </div>
      {q.isLoading ? <Cargando /> : q.error ? <ErrorCarga error={q.error} reintentar={() => void q.refetch()} /> : lista.length === 0 ? (
        <Tarjeta><Vacio icono={Wrench} titulo={q.data?.length ? 'Ninguna orden en este filtro' : 'Todavía no hay órdenes'}>{q.data?.length ? 'Cambiá el filtro o la búsqueda.' : 'Creá una orden al recibir un equipo, o convertí un presupuesto aprobado.'}</Vacio></Tarjeta>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {lista.map((o) => {
            const atrasada = o.entrega_prevista && o.entrega_prevista < hoy && !['entregado', 'cancelado'].includes(o.estado);
            return (
              <li key={o.id}>
                <Link to={`/taller/${o.id}`} className="block rounded-2xl border border-line bg-surface p-4 shadow-card hover:border-brand">
                  <span className="flex flex-wrap items-center gap-2"><b className="text-deep">{nOrden(o.numero)}</b><Insignia tono={ORDEN[o.estado]?.tono}>{ORDEN[o.estado]?.t}</Insignia><Demo si={o.es_demo} /><ChevronRight className="ml-auto size-4 text-muted" aria-hidden /></span>
                  <span className="mt-1 block truncate text-sm font-semibold text-ink">{o.cliente_nombre} · {equipoTexto(o)}</span>
                  <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>{nombre(o.responsable_id)}</span>
                    {o.checklist_total > 0 && <span>Checklist {o.checklist_hechos}/{o.checklist_total}</span>}
                    {o.entrega_prevista && <span className={atrasada ? 'font-bold text-danger' : ''}>Entrega: {fechaRelativa(o.entrega_prevista)}{atrasada ? ' (atrasada)' : ''}</span>}
                    <span className={o.saldo > 0 ? 'font-bold text-warn' : ''}>{o.saldo > 0 ? `Saldo ${gs(o.saldo)}` : o.total > 0 ? 'Pagado' : 'Sin importe'}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ───────────── Nueva orden directa ─────────────
export function OrdenNueva() {
  const ir = useNavigate();
  const { perfil } = useAuth();
  const [sp] = useSearchParams();
  const [clave] = useState(nuevaClave);
  const clientes = useClientes(); const servicios = useServicios(); const socios = (useSocios().data ?? []).filter((s) => s.activo);
  const f = useForm({ cliente: sp.get('cliente') ?? '', equipo: '', responsable: perfil?.id ?? '', problema: '', condicion: '', accesorios: '', entrega: '' });
  const equipos = useEquipos(f.v.cliente || null);
  const [items, setItems] = useState<Concepto[]>([conceptoVacio()]);
  const [tocado, setTocado] = useState(false); const [nuevoEquipo, setNuevoEquipo] = useState(false);
  const errores = [!f.v.cliente && 'Elegí el cliente.', !f.v.equipo && 'Elegí o cargá el equipo.', errorConceptos(items)].filter(Boolean) as string[];
  const crear = useAccion(() => api.crearOrden({ clave, clienteId: f.v.cliente, equipoId: f.v.equipo, responsableId: f.v.responsable || null, problema: f.v.problema, condicion: f.v.condicion, accesorios: f.v.accesorios, entrega: f.v.entrega || null, items }), 'Orden creada.');
  if (clientes.isLoading || servicios.isLoading) return <Cargando />;
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); setTocado(true); if (errores.length) return; crear.mutate(undefined, { onSuccess: (id) => ir(`/taller/${id}`, { replace: true }) }); }}>
      <Encabezado titulo="Nueva orden" detalle="Para equipos que ingresan sin presupuesto previo. Si ya hay uno aprobado, convertilo desde Presupuestos."
        volver={<button type="button" className={volverCls} onClick={() => { if (!f.sucio || window.confirm('¿Descartar esta orden sin guardar?')) ir('/taller'); }}><ArrowLeft className="size-4" aria-hidden />Taller</button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Seccion titulo="Ingreso del equipo" icono={Laptop}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Selector etiqueta="Cliente" required vacio="Elegí un cliente…" opciones={(clientes.data ?? []).map((c): [string, string] => [c.id, c.nombre])} valor={f.v.cliente} onCambio={(x) => f.setV((a) => ({ ...a, cliente: x, equipo: '' }))} ayuda={clientes.data?.length === 0 ? 'Primero cargá el cliente en Clientes.' : undefined} />
              <div>
                <Selector etiqueta="Equipo" required disabled={!f.v.cliente} vacio={f.v.cliente ? 'Elegí el equipo…' : 'Elegí primero el cliente'} opciones={(equipos.data ?? []).map((e): [string, string] => [e.id, equipoTexto(e)])} valor={f.v.equipo} onCambio={(x) => f.set('equipo', x)} />
                {f.v.cliente && <Boton chico variante="suave" icono={Plus} className="mt-2" onClick={() => setNuevoEquipo(true)}>Cargar equipo nuevo</Boton>}
              </div>
              <Selector etiqueta="Responsable" opciones={socios.map((s): [string, string] => [s.id, s.nombre])} valor={f.v.responsable} onCambio={(x) => f.set('responsable', x)} />
              <Texto etiqueta="Entrega prevista" type="date" min={hoyISO()} valor={f.v.entrega} onCambio={(x) => f.set('entrega', x)} />
              <Area className="sm:col-span-2" etiqueta="Problema informado" maxLength={2000} valor={f.v.problema} onCambio={(x) => f.set('problema', x)} />
              <Area className="sm:col-span-2" etiqueta="Condición al recibirlo" maxLength={2000} placeholder="Golpes, rayones, faltantes…" valor={f.v.condicion} onCambio={(x) => f.set('condicion', x)} />
              <Texto className="sm:col-span-2" etiqueta="Accesorios entregados" maxLength={500} valor={f.v.accesorios} onCambio={(x) => f.set('accesorios', x)} />
            </div>
          </Seccion>
          <Seccion titulo="Trabajo acordado" icono={ClipboardList}><ConceptosEditor items={items} onCambio={setItems} servicios={servicios.data ?? []} /></Seccion>
        </div>
        <Tarjeta className="h-fit p-5">
          <p className="flex items-baseline justify-between text-sm text-muted">Total <span className="text-2xl font-extrabold text-deep">{gs(totalConceptos(items))}</span></p>
          <p className="mt-2 text-xs text-muted">El precio y las inclusiones se copian del catálogo de hoy y quedan fijos en la orden.</p>
          {tocado && errores.length > 0 && <ul role="alert" className="mt-3 space-y-1 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{errores.map((e) => <li key={e}>{e}</li>)}</ul>}
          <Boton type="submit" className="mt-4 w-full" cargando={crear.isPending}>Crear orden</Boton>
        </Tarjeta>
      </div>
      {nuevoEquipo && <EquipoModal clienteId={f.v.cliente} onCerrar={() => setNuevoEquipo(false)} alGuardar={(e) => f.set('equipo', e.id)} />}
    </form>
  );
}

// ───────────── Detalle de la orden ─────────────
type Dlg = null | 'editar' | 'estado' | 'cobro' | 'adicional' | 'enlace';
export function OrdenDetalle() {
  const { id } = useParams();
  const q = useOrden(id);
  const nombre = useNombreSocio();
  const config = useConfig().data;
  const { esAdmin } = useAuth();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [destino, setDestino] = useState('');
  const estado = useAccion(api.cambiarEstadoOrden, 'Estado actualizado.');
  if (q.isLoading) return <Cargando />;
  if (q.error || !q.data) return <ErrorCarga error={q.error} reintentar={() => void q.refetch()} />;
  const { orden: o, resumen: r, items, checklist, eventos, movimientos, adjuntos } = q.data;
  const cerrada = ['entregado', 'cancelado'].includes(o.estado);
  const pos = ESTADOS_ORDEN.indexOf(o.estado as (typeof ESTADOS_ORDEN)[number]);
  const siguiente = pos >= 0 && pos < ESTADOS_ORDEN.length - 1 ? ESTADOS_ORDEN[pos + 1] : null;
  const avanzar = () => {
    if (!siguiente) return;
    if (siguiente === 'entregado' && r.saldo > 0 && !window.confirm(`La orden tiene un saldo de ${gs(r.saldo)}. ¿Marcarla como entregada igual? Quedará en "por cobrar".`)) return;
    if (siguiente === 'listo' && r.checklist_hechos < r.checklist_total && !window.confirm(`Quedan ${r.checklist_total - r.checklist_hechos} tareas del checklist sin marcar. ¿Pasar a Listo igual?`)) return;
    estado.mutate({ id: o.id, estado: siguiente, version: o.version });
  };
  const aviso = config && r.cliente_telefono ? enlaceWhatsApp(r.cliente_telefono, plantilla(String(config.plantillas.valor.whatsapp_listo ?? ''), { cliente: r.cliente_nombre.split(' ')[0], orden: nOrden(o.numero), saldo: gs(r.saldo), negocio: String(config.negocio.valor.nombre ?? 'Zenix') })) : null;
  return (
    <>
      <Encabezado titulo={`${nOrden(o.numero)} · ${equipoTexto(r)}`} volver={<Link to="/taller" className={volverCls}><ArrowLeft className="size-4" aria-hidden />Taller</Link>}
        detalle={<span className="flex flex-wrap items-center gap-2"><Insignia tono={ORDEN[o.estado]?.tono}>{ORDEN[o.estado]?.t}</Insignia><Link className="font-semibold text-brand-strong hover:underline" to={`/clientes/${r.cliente_id}`}>{r.cliente_nombre}</Link>· Responsable: {nombre(o.responsable_id)}<Demo si={r.es_demo} /></span>}
        acciones={<>
          {siguiente && !cerrada && <Boton icono={Check} cargando={estado.isPending} onClick={avanzar}>Pasar a {ORDEN[siguiente].t}</Boton>}
          {(!cerrada || esAdmin) && <Boton variante="secundario" onClick={() => { setDestino(''); setDlg('estado'); }}>{cerrada ? 'Reabrir' : 'Otro estado'}</Boton>}
        </>} />

      {/* Recorrido de estados: número, texto y marca, no solo color */}
      <Tarjeta className="mb-5 overflow-x-auto p-4">
        <ol className="flex min-w-[560px] items-start">
          {ESTADOS_ORDEN.map((e, n) => (
            <li key={e} className="flex flex-1 flex-col items-center gap-1 text-center" aria-current={e === o.estado ? 'step' : undefined}>
              <span className="flex w-full items-center">
                <span className={cx('h-0.5 flex-1', n === 0 ? 'invisible' : pos >= n ? 'bg-brand' : 'bg-line')} />
                <span className={cx('grid size-8 shrink-0 place-items-center rounded-full border-2 text-xs font-bold', pos > n ? 'border-brand bg-brand text-white' : pos === n ? 'border-brand-strong bg-surface text-brand-strong ring-4 ring-mint-2' : 'border-line bg-surface text-muted')}>{pos > n ? <Check className="size-4" aria-label="completado" /> : n + 1}</span>
                <span className={cx('h-0.5 flex-1', n === ESTADOS_ORDEN.length - 1 ? 'invisible' : pos > n ? 'bg-brand' : 'bg-line')} />
              </span>
              <span className={cx('px-1 text-xs', pos === n ? 'font-bold text-deep' : 'text-muted')}>{ORDEN[e].t}</span>
            </li>
          ))}
        </ol>
        {pos < 0 && <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">{ORDEN[o.estado]?.t}: {r.motivo_estado}</p>}
      </Tarjeta>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Seccion titulo="Ingreso y diagnóstico" icono={Laptop} accion={!cerrada && <Boton chico variante="suave" icono={Pencil} onClick={() => setDlg('editar')}>Editar</Boton>}>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Dato etiqueta="Ingreso">{fechaHora(r.fecha_ingreso)}</Dato><Dato etiqueta="Entrega prevista">{o.entrega_prevista && fecha(o.entrega_prevista)}</Dato>
              <Dato etiqueta="Problema informado">{o.problema}</Dato><Dato etiqueta="Condición al recibirlo">{o.condicion_recepcion}</Dato>
              <Dato etiqueta="Accesorios">{o.accesorios}</Dato><Dato etiqueta="Diagnóstico">{o.diagnostico}</Dato>
              <Dato etiqueta="Trabajo aprobado">{o.trabajo_aprobado}</Dato><Dato etiqueta="Observaciones">{o.observaciones}</Dato>
              <Dato etiqueta="Recomendaciones al cliente">{o.recomendaciones}</Dato>{r.entregado_en && <Dato etiqueta="Entregado">{fechaHora(r.entregado_en)}</Dato>}
            </dl>
          </Seccion>

          <Seccion titulo={`Checklist (${r.checklist_hechos}/${r.checklist_total})`} icono={ClipboardCheck}>
            <Checklist ordenId={o.id} lista={checklist} bloqueado={cerrada} nombre={nombre} />
          </Seccion>

          <Seccion titulo="Trabajo y precios acordados" icono={ClipboardList} accion={!cerrada && <Boton chico variante="suave" icono={Plus} onClick={() => setDlg('adicional')}>Adicional</Boton>}>
            <ul className="divide-y divide-line">
              {items.map((i) => (
                <li key={i.id} className="py-3">
                  <p className="flex justify-between gap-3 text-sm"><span className="font-semibold text-deep">{i.cantidad} × {i.descripcion}{i.origen === 'adicional' && <span className="ml-2 rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-bold text-info">Adicional</span>}</span><b className="whitespace-nowrap text-deep">{gs(i.total)}</b></p>
                  {i.descuento > 0 && <p className="text-xs text-muted">Descuento {gs(i.descuento)}</p>}
                  {i.origen === 'adicional' && <p className="text-xs text-muted">Aprobado por {MEDIOS_APROBACION[i.aprobado_medio ?? ''] ?? '—'}{i.aprobado_nota && `: ${i.aprobado_nota}`}</p>}
                  {i.inclusiones.length > 0 && <p className="mt-1 text-xs"><b>Incluye:</b> {i.inclusiones.join(' · ')}</p>}
                  {i.exclusiones.length > 0 && <p className="text-xs"><b>No incluye:</b> {i.exclusiones.join(' · ')}</p>}
                </li>
              ))}
            </ul>
            {o.condiciones && <p className="mt-2 border-t border-line pt-2 text-xs text-muted"><b>Condiciones acordadas:</b> {o.condiciones}</p>}
            {r.presupuesto_id && <p className="mt-2 text-xs"><Link className="font-semibold text-brand-strong hover:underline" to={`/presupuestos/${r.presupuesto_id}`}>Ver presupuesto de origen</Link></p>}
          </Seccion>

          <Fotos ordenId={o.id} adjuntos={adjuntos} bloqueado={cerrada} onEnlace={() => setDlg('enlace')} />
        </div>

        <div className="space-y-5">
          <Seccion titulo="Cobros y saldo" icono={Banknote}>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Total del trabajo</dt><dd className="font-semibold">{gs(r.total)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Cobrado</dt><dd className="font-semibold">{gs(r.cobrado)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base"><dt className="font-bold text-deep">Saldo</dt><dd className={cx('font-extrabold', r.saldo > 0 ? 'text-warn' : 'text-deep')}>{gs(r.saldo)}</dd></div>
            </dl>
            {r.saldo > 0 && o.estado !== 'cancelado' ? <Boton className="mt-3 w-full" icono={Banknote} onClick={() => setDlg('cobro')}>Registrar cobro</Boton> : r.total > 0 && r.saldo === 0 && <p className="mt-3"><Insignia tono="verde">Pagado por completo</Insignia></p>}
            {o.estado === 'listo' && aviso && <a href={aviso} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-mint-2 px-4 font-semibold text-deep hover:bg-[#d3eddf]"><MessageCircle className="size-4" aria-hidden />Avisar por WhatsApp que está listo</a>}
            {movimientos.length > 0 && (
              <ul className="mt-4 divide-y divide-line border-t border-line">
                {movimientos.map((m) => (
                  <li key={m.id} className="py-2 text-sm">
                    <p className={cx('flex justify-between gap-2', m.anulado_en && 'text-muted line-through')}><span>{fecha(m.fecha)} · {MEDIOS_PAGO[m.medio]}</span><b>{m.tipo === 'gasto' ? '− ' : ''}{gs(m.monto)}</b></p>
                    <p className="text-xs text-muted">{m.concepto} · {nombre(m.created_by)}{m.anulado_en && ` · ANULADO: ${m.anulado_motivo}`}</p>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
          <Seccion titulo="Historial" icono={History}>
            <ol className="space-y-3">
              {eventos.map((e) => (
                <li key={e.id} className="border-l-2 border-mint-2 pl-3 text-sm">
                  <p className="font-semibold text-deep">{e.a_estado ? (e.de_estado ? `${ORDEN[e.de_estado]?.t} → ${ORDEN[e.a_estado]?.t}` : ORDEN[e.a_estado]?.t) : 'Nota'}</p>
                  {e.nota && <p className="text-ink">{e.nota}</p>}
                  <p className="text-xs text-muted">{fechaHora(e.created_at)} · {nombre(e.autor)}</p>
                </li>
              ))}
            </ol>
          </Seccion>
        </div>
      </div>

      {dlg === 'editar' && <EditarOrden o={o} onCerrar={() => setDlg(null)} />}
      {dlg === 'cobro' && <MovimientoModal tipo="cobro" orden={r} onCerrar={() => setDlg(null)} />}
      {dlg === 'adicional' && <AdicionalModal ordenId={o.id} onCerrar={() => setDlg(null)} />}
      {dlg === 'enlace' && <EnlaceModal ordenId={o.id} onCerrar={() => setDlg(null)} />}
      {dlg === 'estado' && <EstadoModal o={o} r={r} destino={destino} setDestino={setDestino} onCerrar={() => setDlg(null)} />}
    </>
  );
}

function Checklist({ ordenId, lista, bloqueado, nombre }: { ordenId: string; lista: { id: string; texto: string; hecho: boolean; hecho_por: string | null; hecho_en: string | null; posicion: number }[]; bloqueado: boolean; nombre: (id: string | null) => string }) {
  const marcar = useAccion(api.marcarTarea);
  const agregar = useAccion(api.agregarTarea);
  const [texto, setTexto] = useState('');
  return (
    <>
      {lista.length === 0 && <p className="text-sm text-muted">Este servicio no tiene checklist configurado. Podés agregar tareas acá o definirlo en Ajustes → Catálogo.</p>}
      <ul className="space-y-1">
        {lista.map((t) => (
          <li key={t.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-mint">
              <input type="checkbox" className="size-5 accent-[#0a7d5c]" checked={t.hecho} disabled={bloqueado || marcar.isPending} onChange={(e) => marcar.mutate({ id: t.id, hecho: e.target.checked })} />
              <span className="flex-1 text-sm"><span className={t.hecho ? 'text-muted line-through' : 'font-semibold text-ink'}>{t.texto}</span>{t.hecho && <span className="block text-xs text-muted">Hecho por {nombre(t.hecho_por)} · {fechaHora(t.hecho_en)}</span>}</span>
            </label>
          </li>
        ))}
      </ul>
      {!bloqueado && (
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!texto.trim()) return; agregar.mutate({ ordenId, texto: texto.trim(), posicion: (lista.at(-1)?.posicion ?? 0) + 1 }, { onSuccess: () => setTexto('') }); }}>
          <input aria-label="Nueva tarea" placeholder="Agregar tarea…" maxLength={200} className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <Boton type="submit" chico variante="suave" icono={Plus} cargando={agregar.isPending} disabled={!texto.trim()}>Agregar</Boton>
        </form>
      )}
    </>
  );
}

const ETIQUETAS = { recepcion: 'Recepción', antes: 'Antes', despues: 'Después', otro: 'Otra' };
function Fotos({ ordenId, adjuntos, bloqueado, onEnlace }: { ordenId: string; adjuntos: import('../lib/types').Adjunto[]; bloqueado: boolean; onEnlace: () => void }) {
  const firmadas = useFirmadas(adjuntos);
  const [etiqueta, setEtiqueta] = useState('antes');
  const entrada = useRef<HTMLInputElement>(null);
  const subir = useAccion(api.subirFoto, 'Foto guardada en el almacenamiento privado.');
  const quitar = useAccion(api.quitarAdjunto, 'Adjunto quitado.');
  return (
    <Seccion titulo="Fotos y enlaces" icono={Camera}>
      {adjuntos.length === 0 ? <p className="text-sm text-muted">Sin fotos. Sacá una al recibir el equipo y otra al terminar.</p> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {adjuntos.map((a) => {
            const url = (a.origen === 'archivo' ? firmadas.data?.[a.storage_path!] : a.enlace) ?? undefined;
            return (
              <li key={a.id} className="overflow-hidden rounded-xl border border-line">
                {a.origen === 'archivo'
                  ? (url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Foto ${ETIQUETAS[a.etiqueta as keyof typeof ETIQUETAS]}`} className="aspect-[4/3] w-full object-cover" loading="lazy" /></a> : <div className="grid aspect-[4/3] place-items-center bg-mint text-xs text-muted">Cargando…</div>)
                  : <a href={url} target="_blank" rel="noreferrer noopener" className="grid aspect-[4/3] place-items-center gap-1 bg-info-soft p-2 text-center text-xs font-semibold text-info"><Link2 className="size-5" aria-hidden />Enlace externo</a>}
                <div className="flex items-center justify-between gap-1 px-2 py-1 text-xs">
                  <span className="font-semibold text-deep">{ETIQUETAS[a.etiqueta as keyof typeof ETIQUETAS]} · {a.origen === 'archivo' ? 'Archivo privado' : 'Enlace'}</span>
                  {!bloqueado && <button type="button" aria-label="Quitar adjunto" className="grid size-8 place-items-center rounded-full text-danger hover:bg-danger-soft" onClick={() => { if (window.confirm('¿Quitar este adjunto? No se puede deshacer.')) quitar.mutate(a); }}><Trash2 className="size-4" aria-hidden /></button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!bloqueado && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <Selector className="w-36" etiqueta="Momento" opciones={ETIQUETAS} valor={etiqueta} onCambio={setEtiqueta} />
          <input ref={entrada} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Elegir foto" onChange={(e) => { const archivo = e.target.files?.[0]; e.target.value = ''; if (archivo) subir.mutate({ ordenId, etiqueta, archivo }); }} />
          <Boton icono={Camera} variante="suave" cargando={subir.isPending} onClick={() => entrada.current?.click()}>Subir foto</Boton>
          <Boton icono={Link2} variante="secundario" onClick={onEnlace}>Registrar enlace</Boton>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Las fotos se guardan en un almacenamiento privado y solo se ven con sesión de socio. No están autorizadas para publicar: el registro de permiso del cliente llega con la fase 2.</p>
    </Seccion>
  );
}

function EnlaceModal({ ordenId, onCerrar }: { ordenId: string; onCerrar: () => void }) {
  const [enlace, setEnlace] = useState(''); const [etiqueta, setEtiqueta] = useState('otro');
  const valido = /^https?:\/\/\S+$/.test(enlace.trim());
  const ok = useAccion(() => api.agregarEnlace({ ordenId, etiqueta, enlace: enlace.trim() }), 'Enlace registrado.');
  return (
    <Modal titulo="Registrar enlace externo" abierto onCerrar={onCerrar} sucio={enlace !== ''} pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton cargando={ok.isPending} disabled={!valido} onClick={() => ok.mutate(undefined, { onSuccess: onCerrar })}>Guardar enlace</Boton></>}>
      <div className="grid gap-4">
        <Texto etiqueta="Enlace" type="url" inputMode="url" placeholder="https://…" valor={enlace} onCambio={setEnlace} error={enlace && !valido ? 'Debe empezar con http:// o https://' : null} ayuda="Zenix solo guarda la dirección. La privacidad del archivo depende de dónde esté alojado." />
        <Selector etiqueta="Momento" opciones={ETIQUETAS} valor={etiqueta} onCambio={setEtiqueta} />
      </div>
    </Modal>
  );
}

function EditarOrden({ o, onCerrar }: { o: Orden; onCerrar: () => void }) {
  const socios = (useSocios().data ?? []).filter((s) => s.activo);
  const f = useForm({ responsable_id: o.responsable_id ?? '', entrega_prevista: o.entrega_prevista ?? '', problema: o.problema ?? '', condicion_recepcion: o.condicion_recepcion ?? '', accesorios: o.accesorios ?? '', diagnostico: o.diagnostico ?? '', trabajo_aprobado: o.trabajo_aprobado ?? '', observaciones: o.observaciones ?? '', recomendaciones: o.recomendaciones ?? '' });
  const ok = useAccion(() => api.editarOrden({ id: o.id, version: o.version, datos: Object.fromEntries(Object.entries(f.v).map(([k, x]) => [k, vacioANull(x)])) }), 'Orden actualizada.');
  const area = (k: keyof typeof f.v, etiqueta: string, ayuda?: string) => <Area className="sm:col-span-2" etiqueta={etiqueta} ayuda={ayuda} maxLength={2000} valor={f.v[k]} onCambio={(x) => f.set(k, x)} />;
  return (
    <Modal titulo="Editar datos de la orden" ancho="max-w-2xl" abierto onCerrar={onCerrar} sucio={f.sucio} pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton type="submit" form="f" cargando={ok.isPending}>Guardar</Boton></>}>
      <form id="f" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); ok.mutate(undefined, { onSuccess: onCerrar }); }}>
        <Selector etiqueta="Responsable" vacio="Sin asignar" opciones={socios.map((s): [string, string] => [s.id, s.nombre])} valor={f.v.responsable_id} onCambio={(x) => f.set('responsable_id', x)} />
        <Texto etiqueta="Entrega prevista" type="date" valor={f.v.entrega_prevista} onCambio={(x) => f.set('entrega_prevista', x)} />
        {area('problema', 'Problema informado')}{area('condicion_recepcion', 'Condición al recibirlo')}
        <Texto className="sm:col-span-2" etiqueta="Accesorios entregados" maxLength={500} valor={f.v.accesorios} onCambio={(x) => f.set('accesorios', x)} />
        {area('diagnostico', 'Diagnóstico')}{area('trabajo_aprobado', 'Trabajo aprobado')}
        {area('observaciones', 'Observaciones internas', 'No anotes acá contraseñas ni PIN del equipo.')}{area('recomendaciones', 'Recomendaciones al cliente')}
      </form>
    </Modal>
  );
}

function AdicionalModal({ ordenId, onCerrar }: { ordenId: string; onCerrar: () => void }) {
  const [clave] = useState(nuevaClave);
  const f = useForm({ descripcion: '', cantidad: 1, precio: null as number | null, descuento: 0, medio: '', nota: '' });
  const total = f.v.cantidad * (f.v.precio ?? 0) - f.v.descuento;
  const listo = f.v.descripcion.trim() && f.v.precio != null && f.v.medio && total >= 0;
  const ok = useAccion(() => api.agregarAdicional({ clave, ordenId, descripcion: f.v.descripcion.trim(), cantidad: f.v.cantidad, precio: f.v.precio!, descuento: f.v.descuento, medio: f.v.medio, nota: f.v.nota }), 'Trabajo adicional agregado.');
  return (
    <Modal titulo="Trabajo o repuesto adicional" abierto onCerrar={onCerrar} sucio={f.sucio} pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton cargando={ok.isPending} disabled={!listo} onClick={() => ok.mutate(undefined, { onSuccess: onCerrar })}>Agregar · {gs(total)}</Boton></>}>
      <p className="mb-4 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">Los adicionales necesitan la aprobación del cliente. Lo ya acordado en la orden no se modifica.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Texto className="sm:col-span-2" etiqueta="Descripción" required maxLength={300} placeholder="Ej.: cambio de cooler" valor={f.v.descripcion} onCambio={(x) => f.set('descripcion', x)} />
        <Texto etiqueta="Cantidad" type="number" inputMode="numeric" min={1} max={999} valor={String(f.v.cantidad)} onCambio={(x) => f.set('cantidad', Math.max(1, Math.min(999, Number(x) || 1)))} />
        <Importe etiqueta="Precio unitario" required valor={f.v.precio} onCambio={(x) => f.set('precio', x)} />
        <Importe etiqueta="Descuento" valor={f.v.descuento || null} onCambio={(x) => f.set('descuento', x ?? 0)} error={total < 0 ? 'Supera el importe.' : null} />
        <Selector etiqueta="¿Cómo lo aprobó el cliente?" required vacio="Elegí…" opciones={MEDIOS_APROBACION} valor={f.v.medio} onCambio={(x) => f.set('medio', x)} />
        <Texto className="sm:col-span-2" etiqueta="Nota de la aprobación (opcional)" maxLength={500} valor={f.v.nota} onCambio={(x) => f.set('nota', x)} />
      </div>
    </Modal>
  );
}

function EstadoModal({ o, r, destino, setDestino, onCerrar }: { o: Orden; r: OrdenResumen; destino: string; setDestino: (s: string) => void; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const pideMotivo = ['en_espera', 'cancelado'].includes(destino);
  const ok = useAccion(api.cambiarEstadoOrden, 'Estado actualizado.');
  return (
    <Modal titulo="Cambiar estado de la orden" abierto onCerrar={onCerrar} sucio={motivo !== ''} pie={<><Boton variante="secundario" onClick={onCerrar}>Volver</Boton><Boton variante={destino === 'cancelado' ? 'peligro' : 'primario'} cargando={ok.isPending} disabled={!destino || (pideMotivo && !motivo.trim())} onClick={() => ok.mutate({ id: o.id, estado: destino, motivo, version: o.version }, { onSuccess: onCerrar })}>Confirmar</Boton></>}>
      <div className="grid gap-4">
        <Selector etiqueta="Nuevo estado" vacio="Elegí…" opciones={Object.entries(ORDEN).filter(([k]) => k !== o.estado).map(([k, x]): [string, string] => [k, x.t])} valor={destino} onCambio={setDestino} />
        {pideMotivo && <Area etiqueta="Motivo" required maxLength={500} placeholder={destino === 'en_espera' ? 'Ej.: esperando repuesto' : 'Ej.: el cliente retiró el equipo sin reparar'} valor={motivo} onCambio={setMotivo} />}
        {destino === 'cancelado' && r.cobrado > 0 && <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">Esta orden tiene {gs(r.cobrado)} cobrados. Cancelarla no devuelve el dinero ni anula los cobros: si corresponde, un Administrador debe anularlos en Finanzas.</p>}
        <p className="text-xs text-muted">El cambio queda en el historial con tu nombre y la hora.</p>
      </div>
    </Modal>
  );
}
