import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, FileText, Laptop, MessageCircle, MessageCircleQuestion, Pencil, Plus, Users, Wrench } from 'lucide-react';
import { useCliente, useClientes } from '../lib/api';
import { CANALES_ORIGEN, CONSULTA, ORDEN, PRESUPUESTO, equipoTexto } from '../lib/etiquetas';
import { enlaceWhatsApp, fecha, gs, nOrden, nPresupuesto } from '../lib/format';
import type { Cliente, Equipo } from '../lib/types';
import { ClienteModal, ConsultaModal, EquipoModal } from '../forms';
import { Boton, Buscador, Cargando, Dato, Demo, Encabezado, ErrorCarga, Insignia, Seccion, Tarjeta, Vacio } from '../ui';

export function Clientes() {
  const q = useClientes();
  const ir = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [texto, setTexto] = useState('');
  const [nuevo, setNuevo] = useState(Boolean(sp.get('nuevo')));
  const lista = useMemo(() => { const t = texto.trim().toLowerCase(); return (q.data ?? []).filter((c) => !t || `${c.nombre} ${c.telefono ?? ''} ${c.email ?? ''}`.toLowerCase().includes(t)); }, [q.data, texto]);
  return (
    <>
      <Encabezado titulo="Clientes" detalle="Cada cliente, con su historia." acciones={<Boton icono={Plus} onClick={() => setNuevo(true)}>Nuevo cliente</Boton>} />
      <div className="mb-4"><Buscador valor={texto} onCambio={setTexto} placeholder="Buscar por nombre, teléfono o correo…" /></div>
      <Tarjeta>
        {q.isLoading ? <Cargando /> : q.error ? <ErrorCarga error={q.error} reintentar={() => void q.refetch()} /> : lista.length === 0 ? (
          <Vacio icono={Users} titulo={q.data?.length ? 'Ningún cliente coincide' : 'Todavía no hay clientes'} accion={!q.data?.length && <Boton icono={Plus} onClick={() => setNuevo(true)}>Cargar el primero</Boton>}>
            {q.data?.length ? 'Revisá el texto de búsqueda.' : 'Cargá un cliente para registrar sus consultas, presupuestos y equipos.'}
          </Vacio>
        ) : (
          <ul className="divide-y divide-line">
            {lista.map((c) => (
              <li key={c.id}>
                <Link to={`/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-mint">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mint-2 text-sm font-bold text-deep" aria-hidden>{c.nombre.slice(0, 2).toUpperCase()}</span>
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-2 truncate font-bold text-deep">{c.nombre}<Demo si={c.es_demo} /></span><span className="block truncate text-sm text-muted">{c.telefono ?? 'Sin teléfono'}{c.canal_origen && ` · ${CANALES_ORIGEN[c.canal_origen]}`}</span></span>
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      {nuevo && <ClienteModal onCerrar={() => { setNuevo(false); if (sp.size) setSp({}, { replace: true }); }} alGuardar={(c: Cliente) => ir(`/clientes/${c.id}`)} />}
    </>
  );
}

export function ClienteFicha() {
  const { id } = useParams();
  const q = useCliente(id);
  const [modal, setModal] = useState<null | 'cliente' | 'consulta' | { equipo: Equipo | null }>(null);
  if (q.isLoading) return <Cargando />;
  if (q.error || !q.data) return <ErrorCarga error={q.error} reintentar={() => void q.refetch()} />;
  const { cliente: c, equipos, consultas, presupuestos, ordenes, movimientos } = q.data;
  const enlaceCls = 'inline-flex min-h-9 items-center gap-2 rounded-xl bg-mint-2 px-3 text-sm font-semibold text-deep hover:bg-[#d3eddf]';
  return (
    <>
      <Encabezado titulo={c.nombre} volver={<Link to="/clientes" className="mb-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-strong hover:underline"><ArrowLeft className="size-4" aria-hidden />Clientes</Link>}
        detalle={<span className="flex items-center gap-2">Cliente desde {fecha(c.created_at)}<Demo si={c.es_demo} /></span>}
        acciones={<>
          {c.telefono && <a className={enlaceCls} href={enlaceWhatsApp(c.telefono, '')} target="_blank" rel="noreferrer"><MessageCircle className="size-4" aria-hidden />WhatsApp</a>}
          <Boton chico variante="secundario" icono={Pencil} onClick={() => setModal('cliente')}>Editar</Boton>
        </>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Seccion titulo="Datos" icono={Users}>
            <dl className="grid gap-3"><Dato etiqueta="Teléfono">{c.telefono}</Dato><Dato etiqueta="Correo">{c.email}</Dato><Dato etiqueta="Dirección">{c.direccion}</Dato><Dato etiqueta="Canal de origen">{c.canal_origen && CANALES_ORIGEN[c.canal_origen]}</Dato><Dato etiqueta="Observaciones">{c.observaciones}</Dato></dl>
          </Seccion>
          <Seccion titulo="Equipos" icono={Laptop} accion={<Boton chico variante="suave" icono={Plus} onClick={() => setModal({ equipo: null })}>Agregar</Boton>}>
            {equipos.length === 0 ? <p className="text-sm text-muted">Sin equipos cargados.</p> : (
              <ul className="space-y-2">{equipos.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 rounded-xl bg-mint px-3 py-2 text-sm"><span><b className="text-deep">{equipoTexto(e)}</b>{e.serie && <span className="block text-xs text-muted">Serie: {e.serie}</span>}</span><button type="button" className="grid size-9 place-items-center rounded-full text-muted hover:bg-mint-2" aria-label={`Editar ${equipoTexto(e)}`} onClick={() => setModal({ equipo: e })}><Pencil className="size-4" aria-hidden /></button></li>
              ))}</ul>
            )}
          </Seccion>
        </div>
        <div className="space-y-5 lg:col-span-2">
          <Seccion titulo="Consultas" icono={MessageCircleQuestion} accion={<Boton chico variante="suave" icono={Plus} onClick={() => setModal('consulta')}>Nueva</Boton>}>
            {consultas.length === 0 ? <p className="text-sm text-muted">Sin consultas registradas.</p> : (
              <ul className="divide-y divide-line">{consultas.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><Link to={`/consultas?ver=${x.id}`} className="min-w-0 flex-1 truncate hover:underline">{x.servicio?.nombre && <b className="text-deep">{x.servicio.nombre}: </b>}{x.detalle}</Link><Insignia tono={CONSULTA[x.estado]?.tono}>{CONSULTA[x.estado]?.t}</Insignia></li>)}</ul>
            )}
          </Seccion>
          <Seccion titulo="Presupuestos" icono={FileText} accion={<Link className={enlaceCls} to={`/presupuestos/nuevo?cliente=${c.id}`}><Plus className="size-4" aria-hidden />Nuevo</Link>}>
            {presupuestos.length === 0 ? <p className="text-sm text-muted">Sin presupuestos.</p> : (
              <ul className="divide-y divide-line">{presupuestos.map((p) => <li key={p.id}><Link to={`/presupuestos/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm hover:bg-mint"><span><b className="text-deep">{nPresupuesto(p.numero)}</b> · v{p.version_actual} · {gs(p.total)}</span><Insignia tono={PRESUPUESTO[p.estado]?.tono}>{PRESUPUESTO[p.estado]?.t}</Insignia></Link></li>)}</ul>
            )}
          </Seccion>
          <Seccion titulo="Servicios (órdenes)" icono={Wrench} accion={<Link className={enlaceCls} to={`/taller/nueva?cliente=${c.id}`}><Plus className="size-4" aria-hidden />Nueva orden</Link>}>
            {ordenes.length === 0 ? <p className="text-sm text-muted">Sin órdenes de servicio.</p> : (
              <ul className="divide-y divide-line">{ordenes.map((o) => <li key={o.id}><Link to={`/taller/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm hover:bg-mint"><span><b className="text-deep">{nOrden(o.numero)}</b> · {equipoTexto(o)} · {gs(o.total)}{o.saldo > 0 && <span className="font-semibold text-warn"> · saldo {gs(o.saldo)}</span>}</span><Insignia tono={ORDEN[o.estado]?.tono}>{ORDEN[o.estado]?.t}</Insignia></Link></li>)}</ul>
            )}
          </Seccion>
          <Seccion titulo="Pagos recibidos">
            {movimientos.length === 0 ? <p className="text-sm text-muted">Sin pagos registrados.</p> : (
              <ul className="divide-y divide-line">{movimientos.map((m) => <li key={m.id} className="flex justify-between gap-2 py-2 text-sm"><span className={m.anulado_en ? 'text-muted line-through' : ''}>{fecha(m.fecha)} · {m.concepto}</span><b className={m.anulado_en ? 'text-muted line-through' : 'text-deep'}>{gs(m.monto)}</b></li>)}</ul>
            )}
            <p className="mt-2 text-xs text-muted">Las compras de productos se sumarán acá en la fase 2.</p>
          </Seccion>
        </div>
      </div>
      {modal === 'cliente' && <ClienteModal cliente={c} onCerrar={() => setModal(null)} />}
      {modal === 'consulta' && <ConsultaModal clienteId={c.id} onCerrar={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <EquipoModal clienteId={c.id} equipo={modal.equipo} onCerrar={() => setModal(null)} />}
    </>
  );
}
