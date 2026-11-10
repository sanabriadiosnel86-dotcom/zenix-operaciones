import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Ban, BadgeCheck, ChevronRight, FileText, History, MessageCircle, Pencil, Plus, Send, Wrench } from 'lucide-react';
import { api, nuevaClave, tarifaVigente, useAccion, useClientes, useConfig, useEquipos, useNombreSocio, usePresupuesto, usePresupuestos, useServicios, useSocios } from '../lib/api';
import { useAuth } from '../auth';
import { MEDIOS_APROBACION, PRESUPUESTO, equipoTexto } from '../lib/etiquetas';
import { enlaceWhatsApp, fecha, fechaHora, gs, hoyISO, nOrden, nPresupuesto, plantilla, sumarDias } from '../lib/format';
import type { Concepto, Config, PresupuestoResumen, PresupuestoVersion, Servicio } from '../lib/types';
import { ConceptosEditor, EquipoModal, conceptoVacio, errorConceptos, totalConceptos } from '../forms';
import { Area, Boton, Buscador, Cargando, Dato, Demo, Encabezado, ErrorCarga, Filtros, Importe, Insignia, Modal, Seccion, Selector, Tarjeta, Texto, Vacio } from '../ui';

const volverCls = 'mb-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-strong hover:underline';
type F = 'pendientes' | 'aprobados' | 'cerrados' | 'todos';
const GRUPO: Record<F, string[]> = { pendientes: ['borrador', 'enviado'], aprobados: ['aprobado'], cerrados: ['convertido', 'rechazado', 'cancelado'], todos: [] };

export function Presupuestos() {
  const q = usePresupuestos();
  const [filtro, setFiltro] = useState<F>('pendientes');
  const [texto, setTexto] = useState('');
  const hoy = hoyISO();
  const lista = useMemo(() => (q.data ?? []).filter((p) => (filtro === 'todos' || GRUPO[filtro].includes(p.estado)) && (!texto.trim() || `${p.cliente_nombre} ${nPresupuesto(p.numero)}`.toLowerCase().includes(texto.trim().toLowerCase()))), [q.data, filtro, texto]);
  return (
    <>
      <Encabezado titulo="Presupuestos" detalle="Cotizaciones con versiones, aprobación y conversión a orden." acciones={<Link to="/presupuestos/nuevo" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-strong px-4 text-[15px] font-semibold text-white hover:bg-deep"><Plus className="size-4" aria-hidden />Nuevo presupuesto</Link>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Filtros etiqueta="Filtrar presupuestos" valor={filtro} onCambio={setFiltro} opciones={[['pendientes', 'Pendientes'], ['aprobados', 'Aprobados'], ['cerrados', 'Cerrados'], ['todos', 'Todos']]} />
        <Buscador valor={texto} onCambio={setTexto} placeholder="Buscar por cliente o número…" />
      </div>
      <Tarjeta>
        {q.isLoading ? <Cargando /> : q.error ? <ErrorCarga error={q.error} reintentar={() => void q.refetch()} /> : lista.length === 0 ? (
          <Vacio icono={FileText} titulo={q.data?.length ? 'Ningún presupuesto en este filtro' : 'Todavía no hay presupuestos'}>{q.data?.length ? 'Cambiá el filtro para ver los demás.' : 'Creá uno desde una consulta o con el botón "Nuevo presupuesto".'}</Vacio>
        ) : (
          <ul className="divide-y divide-line">
            {lista.map((p) => (
              <li key={p.id}>
                <Link to={`/presupuestos/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-mint">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-bold text-deep">{nPresupuesto(p.numero)} · {p.cliente_nombre}<Insignia tono={PRESUPUESTO[p.estado]?.tono}>{PRESUPUESTO[p.estado]?.t}</Insignia><Demo si={p.es_demo} /></span>
                    <span className="block text-sm text-muted">Versión {p.version_actual} · {gs(p.total)}{p.vigencia_hasta && <> · <span className={p.vigencia_hasta < hoy && GRUPO.pendientes.includes(p.estado) ? 'font-bold text-danger' : ''}>vigente hasta {fecha(p.vigencia_hasta)}{p.vigencia_hasta < hoy && GRUPO.pendientes.includes(p.estado) ? ' (vencido)' : ''}</span></>}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

// ───────────── Editor: presupuesto nuevo o nueva versión ─────────────
export function PresupuestoEditor() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const config = useConfig(); const servicios = useServicios(); const clientes = useClientes(); const existente = usePresupuesto(id);
  if (config.isLoading || servicios.isLoading || clientes.isLoading || (id && existente.isLoading)) return <Cargando />;
  const error = config.error || servicios.error || clientes.error || existente.error;
  if (error || !config.data || !servicios.data) return <ErrorCarga error={error} />;
  const v = existente.data?.versiones[0];
  return <Formulario key={id ?? 'nuevo'} config={config.data} servicios={servicios.data} resumen={existente.data?.resumen} anterior={v}
    clienteInicial={sp.get('cliente') ?? ''} consultaId={sp.get('consulta')} clientes={(clientes.data ?? []).map((c): [string, string] => [c.id, c.nombre])} />;
}

function Formulario({ config, servicios, resumen, anterior, clienteInicial, consultaId, clientes }: { config: Config; servicios: Servicio[]; resumen?: PresupuestoResumen; anterior?: PresupuestoVersion; clienteInicial: string; consultaId: string | null; clientes: [string, string][] }) {
  const ir = useNavigate();
  const [clave] = useState(nuevaClave);
  const com = config.comercial.valor;
  const [clienteId, setClienteId] = useState(resumen?.cliente_id ?? clienteInicial);
  const [vigencia, setVigencia] = useState(sumarDias(hoyISO(), Number(com.vigencia_dias) || 7));
  const [anticipo, setAnticipo] = useState<number | null>(anterior?.anticipo || null);
  const [condiciones, setCondiciones] = useState(anterior?.condiciones ?? String(com.condiciones ?? ''));
  const [notas, setNotas] = useState(anterior?.notas ?? '');
  const [items, setItems] = useState<Concepto[]>(anterior ? anterior.items.map((i) => ({ servicio_id: i.servicio_id, descripcion: i.descripcion, cantidad: i.cantidad, precio_unitario: i.precio_unitario, descuento: i.descuento })) : [conceptoVacio()]);
  const [tocado, setTocado] = useState(false);
  const total = totalConceptos(items);
  // Aviso cuando la tarifa del catálogo cambió respecto de la versión anterior (no se actualiza sola).
  const desactualizados = anterior ? items.filter((i) => { const s = servicios.find((x) => x.id === i.servicio_id); const p = s && tarifaVigente(s)?.precio; return p != null && p !== i.precio_unitario; }) : [];
  const errores = [!clienteId && 'Elegí el cliente.', errorConceptos(items), (anticipo ?? 0) > total && 'El anticipo supera el total.'].filter(Boolean) as string[];
  const guardar = useAccion(() => api.guardarPresupuesto({ clave, presupuestoId: resumen?.id ?? null, clienteId: resumen ? null : clienteId, consultaId: resumen ? null : consultaId, vigencia: vigencia || null, anticipo: anticipo ?? 0, condiciones, notas, items, version: resumen?.version ?? null }), resumen ? 'Nueva versión guardada.' : 'Presupuesto guardado.');
  const enviar = (e: React.FormEvent) => { e.preventDefault(); setTocado(true); if (errores.length) return; guardar.mutate(undefined, { onSuccess: (pid) => ir(`/presupuestos/${pid}`, { replace: true }) }); };
  const salir = () => { if (!tocado && items.every((i) => !i.descripcion && !i.servicio_id) || window.confirm('¿Descartar este presupuesto sin guardar?')) ir(resumen ? `/presupuestos/${resumen.id}` : '/presupuestos'); };
  return (
    <form onSubmit={enviar} noValidate>
      <Encabezado titulo={resumen ? `${nPresupuesto(resumen.numero)} · versión ${resumen.version_actual + 1}` : 'Nuevo presupuesto'}
        detalle={resumen ? `La versión ${resumen.version_actual} queda guardada en el historial. ${resumen.cliente_nombre}.` : 'Los precios se copian del catálogo vigente y quedan fijos en este presupuesto.'}
        volver={<button type="button" onClick={salir} className={volverCls}><ArrowLeft className="size-4" aria-hidden />Volver</button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Seccion titulo="Conceptos" icono={FileText}>
            {desactualizados.length > 0 && <p className="mb-3 rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">El catálogo cambió desde la versión anterior en: {desactualizados.map((d) => d.descripcion).join(', ')}. Se mantiene el precio anterior; modificalo a mano si corresponde.</p>}
            <ConceptosEditor items={items} onCambio={setItems} servicios={servicios} />
          </Seccion>
        </div>
        <div className="space-y-5">
          <Seccion titulo="Datos">
            <div className="grid gap-4">
              {!resumen && <Selector etiqueta="Cliente" required vacio="Elegí un cliente…" opciones={clientes} valor={clienteId} onCambio={setClienteId} ayuda={clientes.length === 0 ? 'Primero cargá el cliente en Clientes.' : undefined} />}
              <Texto etiqueta="Vigente hasta" type="date" min={hoyISO()} valor={vigencia} onCambio={setVigencia} />
              <Importe etiqueta="Anticipo pedido (opcional)" valor={anticipo} onCambio={setAnticipo} />
              <Area etiqueta="Condiciones" filas={4} maxLength={4000} valor={condiciones} onCambio={setCondiciones} />
              <Area etiqueta="Notas internas" maxLength={2000} ayuda="No se incluyen en el mensaje al cliente." valor={notas} onCambio={setNotas} />
            </div>
          </Seccion>
          <Tarjeta className="p-5">
            <p className="flex items-baseline justify-between text-sm text-muted">Total <span className="text-2xl font-extrabold text-deep">{gs(total)}</span></p>
            {tocado && errores.length > 0 && <ul role="alert" className="mt-3 space-y-1 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{errores.map((e) => <li key={e}>{e}</li>)}</ul>}
            <Boton type="submit" className="mt-4 w-full" cargando={guardar.isPending}>{resumen ? 'Guardar nueva versión' : 'Guardar presupuesto'}</Boton>
          </Tarjeta>
        </div>
      </div>
    </form>
  );
}

// ───────────── Detalle ─────────────
function Conceptos({ v }: { v: PresupuestoVersion }) {
  return (
    <>
      <ul className="divide-y divide-line">
        {v.items.map((i) => (
          <li key={i.id} className="py-3">
            <p className="flex justify-between gap-3 text-sm"><span className="font-semibold text-deep">{i.cantidad} × {i.descripcion}</span><b className="whitespace-nowrap text-deep">{gs(i.total)}</b></p>
            <p className="text-xs text-muted">{gs(i.precio_unitario)} c/u{i.descuento > 0 && ` · descuento ${gs(i.descuento)}`}</p>
            {i.inclusiones.length > 0 && <p className="mt-1 text-xs text-ink"><b>Incluye:</b> {i.inclusiones.join(' · ')}</p>}
            {i.exclusiones.length > 0 && <p className="text-xs text-ink"><b>No incluye:</b> {i.exclusiones.join(' · ')}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-2 flex justify-between border-t border-line pt-3 text-base font-extrabold text-deep"><span>Total</span><span>{gs(v.total)}</span></p>
      {v.anticipo > 0 && <p className="flex justify-between text-sm text-muted"><span>Anticipo pedido</span><span>{gs(v.anticipo)}</span></p>}
    </>
  );
}

type Dialogo = null | 'mensaje' | 'aprobar' | 'convertir' | 'rechazado' | 'cancelado';
export function PresupuestoDetalle() {
  const { id } = useParams();
  const q = usePresupuesto(id);
  const config = useConfig().data;
  const nombre = useNombreSocio();
  const [dlg, setDlg] = useState<Dialogo>(null);
  if (q.isLoading) return <Cargando />;
  if (q.error || !q.data) return <ErrorCarga error={q.error} reintentar={() => void q.refetch()} />;
  const { resumen: p, extra, versiones } = q.data; const v = versiones[0];
  const abierto = ['borrador', 'enviado'].includes(p.estado);
  return (
    <>
      <Encabezado titulo={`${nPresupuesto(p.numero)} · ${p.cliente_nombre}`} volver={<Link to="/presupuestos" className={volverCls}><ArrowLeft className="size-4" aria-hidden />Presupuestos</Link>}
        detalle={<span className="flex flex-wrap items-center gap-2"><Insignia tono={PRESUPUESTO[p.estado]?.tono}>{PRESUPUESTO[p.estado]?.t}</Insignia>Versión {p.version_actual}{v.vigencia_hasta && ` · vigente hasta ${fecha(v.vigencia_hasta)}`}<Demo si={p.es_demo} /></span>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Seccion titulo={`Conceptos (versión ${v.numero_version})`} icono={FileText}><Conceptos v={v} /></Seccion>
          {v.condiciones && <Seccion titulo="Condiciones"><p className="whitespace-pre-line text-sm">{v.condiciones}</p></Seccion>}
          {versiones.length > 1 && (
            <Seccion titulo="Versiones anteriores" icono={History}>
              {versiones.slice(1).map((a) => (
                <details key={a.id} className="border-t border-line py-2 first:border-0">
                  <summary className="cursor-pointer text-sm font-semibold text-deep">Versión {a.numero_version} · {gs(a.total)} · {fechaHora(a.created_at)} · {nombre(a.created_by)}</summary>
                  <div className="mt-2 rounded-xl bg-mint px-3"><Conceptos v={a} /></div>
                </details>
              ))}
            </Seccion>
          )}
        </div>
        <div className="space-y-5">
          <Seccion titulo="Acciones">
            <div className="grid gap-2">
              {abierto && <Boton icono={MessageCircle} variante="suave" onClick={() => setDlg('mensaje')}>Preparar mensaje de WhatsApp</Boton>}
              {abierto && <Boton icono={BadgeCheck} onClick={() => setDlg('aprobar')}>Registrar aprobación</Boton>}
              {p.estado === 'aprobado' && <Boton icono={Wrench} onClick={() => setDlg('convertir')}>Convertir en orden</Boton>}
              {p.orden_id && <Link to={`/taller/${p.orden_id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-strong px-4 font-semibold text-white hover:bg-deep"><Wrench className="size-4" aria-hidden />Ver orden {nOrden(p.orden_numero!)}</Link>}
              {['borrador', 'enviado', 'rechazado'].includes(p.estado) && <Link to={`/presupuestos/${p.id}/revisar`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold text-deep hover:bg-mint"><Pencil className="size-4" aria-hidden />Revisar (nueva versión)</Link>}
              {abierto && <Boton variante="peligro" icono={Ban} onClick={() => setDlg('rechazado')}>El cliente lo rechazó</Boton>}
              {['borrador', 'enviado', 'aprobado', 'rechazado'].includes(p.estado) && <Boton variante="peligro" onClick={() => setDlg('cancelado')}>Cancelar presupuesto</Boton>}
            </div>
            {p.estado === 'aprobado' && <p className="mt-3 text-xs text-muted">Un presupuesto aprobado conserva su precio y condiciones aunque cambie el catálogo.</p>}
          </Seccion>
          <Seccion titulo="Registro">
            <dl className="grid gap-3">
              <Dato etiqueta="Cliente"><Link className="font-semibold text-brand-strong hover:underline" to={`/clientes/${p.cliente_id}`}>{p.cliente_nombre}</Link></Dato>
              <Dato etiqueta="Enviado">{p.enviado_en && fechaHora(p.enviado_en)}</Dato>
              <Dato etiqueta="Aprobación">{p.aprobado_en && `${fechaHora(p.aprobado_en)} · ${MEDIOS_APROBACION[p.aprobado_medio ?? ''] ?? ''} · registró ${nombre(extra.aprobado_por)}`}</Dato>
              {extra.aprobado_nota && <Dato etiqueta="Nota de aprobación">{extra.aprobado_nota}</Dato>}
              {extra.motivo_cierre && <Dato etiqueta="Motivo de cierre">{extra.motivo_cierre}</Dato>}
              {v.notas && <Dato etiqueta="Notas internas">{v.notas}</Dato>}
            </dl>
          </Seccion>
        </div>
      </div>
      {dlg === 'mensaje' && config && <MensajeModal p={p} v={v} config={config} onCerrar={() => setDlg(null)} />}
      {dlg === 'aprobar' && <AprobarModal p={p} onCerrar={() => setDlg(null)} />}
      {dlg === 'convertir' && <ConvertirModal p={p} onCerrar={() => setDlg(null)} />}
      {(dlg === 'rechazado' || dlg === 'cancelado') && <MotivoModal p={p} estado={dlg} onCerrar={() => setDlg(null)} />}
    </>
  );
}

function MensajeModal({ p, v, config, onCerrar }: { p: PresupuestoResumen; v: PresupuestoVersion; config: Config; onCerrar: () => void }) {
  const inicial = useMemo(() => plantilla(String(config.plantillas.valor.whatsapp_presupuesto ?? ''), {
    cliente: p.cliente_nombre.split(' ')[0], numero: nPresupuesto(p.numero), negocio: String(config.negocio.valor.nombre ?? 'Zenix'),
    detalle: v.items.map((i) => `• ${i.cantidad} × ${i.descripcion}: ${gs(i.total)}${i.inclusiones.length ? `\n   Incluye: ${i.inclusiones.join(', ')}` : ''}${i.exclusiones.length ? `\n   No incluye: ${i.exclusiones.join(', ')}` : ''}`).join('\n'),
    total: gs(v.total), vigencia: v.vigencia_hasta ? fecha(v.vigencia_hasta) : 'a confirmar', condiciones: v.condiciones ?? '',
  }), [p, v, config]);
  const [texto, setTexto] = useState(inicial);
  const marcar = useAccion(() => api.marcarPresupuesto({ id: p.id, estado: 'enviado', version: p.version }), 'Presupuesto marcado como enviado.');
  return (
    <Modal titulo="Mensaje para WhatsApp" abierto onCerrar={onCerrar} sucio={texto !== inicial} pie={<>
      <Boton variante="secundario" icono={Send} cargando={marcar.isPending} onClick={() => marcar.mutate(undefined, { onSuccess: onCerrar })}>Ya lo envié: marcar como enviado</Boton>
      {p.cliente_telefono ? <a href={enlaceWhatsApp(p.cliente_telefono, texto)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-strong px-4 font-semibold text-white hover:bg-deep"><MessageCircle className="size-4" aria-hidden />Abrir en WhatsApp</a>
        : <Boton icono={MessageCircle} onClick={() => void navigator.clipboard?.writeText(texto)}>Copiar texto</Boton>}
    </>}>
      <Area etiqueta="Texto (podés editarlo antes de abrir WhatsApp)" filas={12} valor={texto} onCambio={setTexto} />
      <p className="mt-2 text-xs text-muted">Zenix no envía mensajes por su cuenta: se abre WhatsApp con el texto y vos lo revisás y enviás. {!p.cliente_telefono && 'Este cliente no tiene teléfono cargado.'}</p>
    </Modal>
  );
}

function AprobarModal({ p, onCerrar }: { p: PresupuestoResumen; onCerrar: () => void }) {
  const ahora = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const [medio, setMedio] = useState('whatsapp'); const [cuando, setCuando] = useState(ahora); const [nota, setNota] = useState('');
  const futura = cuando > ahora();
  const ok = useAccion(() => api.aprobarPresupuesto({ id: p.id, medio, fecha: cuando ? new Date(cuando).toISOString() : null, nota, version: p.version }), 'Aprobación registrada.');
  return (
    <Modal titulo="Registrar aprobación del cliente" abierto onCerrar={onCerrar} sucio={nota !== ''} pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton icono={BadgeCheck} cargando={ok.isPending} disabled={futura} onClick={() => ok.mutate(undefined, { onSuccess: onCerrar })}>Registrar aprobación</Boton></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Selector etiqueta="¿Cómo aprobó?" opciones={MEDIOS_APROBACION} valor={medio} onCambio={setMedio} />
        <Texto etiqueta="¿Cuándo?" type="datetime-local" max={ahora()} valor={cuando} onCambio={setCuando} error={futura ? 'No puede ser una fecha futura.' : null} />
        <Area className="sm:col-span-2" etiqueta="Nota (opcional)" maxLength={500} placeholder="Ej.: confirmó por mensaje, deja el equipo mañana" valor={nota} onCambio={setNota} />
      </div>
      <p className="mt-3 text-sm text-muted">Se aprueba la versión {p.version_actual} por {gs(p.total)}. Desde ese momento el precio y las condiciones quedan fijos.</p>
    </Modal>
  );
}

function MotivoModal({ p, estado, onCerrar }: { p: PresupuestoResumen; estado: 'rechazado' | 'cancelado'; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const ok = useAccion(() => api.marcarPresupuesto({ id: p.id, estado, motivo, version: p.version }), estado === 'rechazado' ? 'Presupuesto marcado como rechazado.' : 'Presupuesto cancelado.');
  return (
    <Modal titulo={estado === 'rechazado' ? 'Registrar rechazo' : 'Cancelar presupuesto'} abierto onCerrar={onCerrar} sucio={motivo !== ''} pie={<><Boton variante="secundario" onClick={onCerrar}>Volver</Boton><Boton variante="peligro" cargando={ok.isPending} disabled={!motivo.trim()} onClick={() => ok.mutate(undefined, { onSuccess: onCerrar })}>Confirmar</Boton></>}>
      <Area etiqueta="Motivo" required maxLength={500} placeholder={estado === 'rechazado' ? 'Ej.: le pareció caro, eligió otro taller' : 'Ej.: se cargó por error'} valor={motivo} onCambio={setMotivo} />
      <p className="mt-2 text-xs text-muted">El presupuesto no se borra: queda en el historial con este motivo.</p>
    </Modal>
  );
}

function ConvertirModal({ p, onCerrar }: { p: PresupuestoResumen; onCerrar: () => void }) {
  const ir = useNavigate();
  const { perfil } = useAuth();
  const equipos = useEquipos(p.cliente_id);
  const socios = (useSocios().data ?? []).filter((s) => s.activo);
  const [equipoId, setEquipoId] = useState(''); const [responsable, setResponsable] = useState(perfil?.id ?? '');
  const [problema, setProblema] = useState(''); const [condicion, setCondicion] = useState(''); const [accesorios, setAccesorios] = useState(''); const [entrega, setEntrega] = useState('');
  const [nuevoEquipo, setNuevoEquipo] = useState(false);
  const ok = useAccion(() => api.convertirPresupuesto({ id: p.id, equipoId, responsableId: responsable || null, problema, condicion, accesorios, entrega: entrega || null }), 'Orden creada desde el presupuesto.');
  if (nuevoEquipo) return <EquipoModal clienteId={p.cliente_id} onCerrar={() => setNuevoEquipo(false)} alGuardar={(e) => setEquipoId(e.id)} />;
  return (
    <Modal titulo="Convertir en orden de servicio" abierto onCerrar={onCerrar} sucio={Boolean(problema || condicion || accesorios)} pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton icono={Wrench} cargando={ok.isPending} disabled={!equipoId} onClick={() => ok.mutate(undefined, { onSuccess: (oid) => ir(`/taller/${oid}`) })}>Crear orden</Boton></>}>
      <p className="mb-4 text-sm text-muted">Los conceptos, precios y condiciones se copian tal como fueron aprobados ({gs(p.total)}). Solo falta indicar el equipo.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Selector etiqueta="Equipo" required vacio={equipos.isLoading ? 'Cargando…' : 'Elegí el equipo…'} opciones={(equipos.data ?? []).map((e): [string, string] => [e.id, equipoTexto(e)])} valor={equipoId} onCambio={setEquipoId} />
          <Boton chico variante="suave" icono={Plus} className="mt-2" onClick={() => setNuevoEquipo(true)}>Cargar equipo nuevo</Boton>
        </div>
        <Selector etiqueta="Responsable" opciones={socios.map((s): [string, string] => [s.id, s.nombre])} valor={responsable} onCambio={setResponsable} />
        <Texto etiqueta="Entrega prevista" type="date" min={hoyISO()} valor={entrega} onCambio={setEntrega} />
        <Area className="sm:col-span-2" etiqueta="Problema informado" maxLength={2000} valor={problema} onCambio={setProblema} />
        <Area className="sm:col-span-2" etiqueta="Condición al recibirlo" maxLength={2000} placeholder="Golpes, rayones, faltantes…" valor={condicion} onCambio={setCondicion} />
        <Texto className="sm:col-span-2" etiqueta="Accesorios entregados" maxLength={500} placeholder="Cargador, funda…" valor={accesorios} onCambio={setAccesorios} />
      </div>
    </Modal>
  );
}
