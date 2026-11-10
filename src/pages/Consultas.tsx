import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, MessageCircleQuestion, Pencil, Plus } from 'lucide-react';
import { useConsultas, useNombreSocio } from '../lib/api';
import { CONSULTA } from '../lib/etiquetas';
import { fechaRelativa, hoyISO } from '../lib/format';
import type { Consulta } from '../lib/types';
import { ConsultaModal } from '../forms';
import { Boton, Buscador, Cargando, Demo, Encabezado, ErrorCarga, Filtros, Insignia, Tarjeta, Vacio } from '../ui';

type F = 'abiertas' | 'todas' | 'cerradas';
export default function Consultas() {
  const q = useConsultas();
  const nombre = useNombreSocio();
  const [sp, setSp] = useSearchParams();
  const [filtro, setFiltro] = useState<F>('abiertas');
  const [texto, setTexto] = useState('');
  const [modal, setModal] = useState<{ c?: Consulta } | null>(sp.get('nueva') ? {} : null);
  useEffect(() => { // enlace directo desde Inicio
    const ver = sp.get('ver'); const c = ver && q.data?.find((x) => x.id === ver);
    if (c) { setModal({ c }); setFiltro('todas'); }
  }, [sp, q.data]);
  const cerrar = () => { setModal(null); if (sp.size) setSp({}, { replace: true }); };
  const lista = useMemo(() => (q.data ?? []).filter((c) => {
    const abierta = ['consulta', 'presupuesto_enviado', 'aprobado'].includes(c.estado);
    if (filtro === 'abiertas' && !abierta) return false;
    if (filtro === 'cerradas' && abierta) return false;
    const t = texto.trim().toLowerCase();
    return !t || `${c.cliente?.nombre} ${c.detalle} ${c.servicio?.nombre ?? ''}`.toLowerCase().includes(t);
  }), [q.data, filtro, texto]);
  const hoy = hoyISO();
  return (
    <>
      <Encabezado titulo="Consultas" detalle="Pedidos de clientes y su seguimiento hasta convertirse en trabajo." acciones={<Boton icono={Plus} onClick={() => setModal({})}>Nueva consulta</Boton>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Filtros etiqueta="Filtrar consultas" valor={filtro} onCambio={setFiltro} opciones={[['abiertas', 'Abiertas'], ['cerradas', 'Cerradas'], ['todas', 'Todas']]} />
        <Buscador valor={texto} onCambio={setTexto} placeholder="Buscar por cliente o detalle…" />
      </div>
      <Tarjeta>
        {q.isLoading ? <Cargando /> : q.error ? <ErrorCarga error={q.error} reintentar={() => void q.refetch()} /> : lista.length === 0 ? (
          <Vacio icono={MessageCircleQuestion} titulo={q.data?.length ? 'Ninguna consulta coincide con el filtro' : 'Todavía no hay consultas'} accion={!q.data?.length && <Boton icono={Plus} onClick={() => setModal({})}>Cargar la primera</Boton>}>
            {q.data?.length ? 'Probá con otro filtro o texto.' : 'Anotá cada pedido apenas llegue: quién pregunta, qué necesita y cuándo hay que responder.'}
          </Vacio>
        ) : (
          <ul className="divide-y divide-line">
            {lista.map((c) => {
              const atrasada = c.fecha_seguimiento && c.fecha_seguimiento < hoy && ['consulta', 'presupuesto_enviado'].includes(c.estado);
              return (
                <li key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2"><Link to={`/clientes/${c.cliente_id}`} className="font-bold text-deep hover:underline">{c.cliente?.nombre}</Link><Insignia tono={CONSULTA[c.estado]?.tono}>{CONSULTA[c.estado]?.t}</Insignia><Demo si={c.es_demo} /></p>
                    <p className="mt-1 text-sm text-ink">{c.servicio?.nombre && <b className="font-semibold">{c.servicio.nombre}: </b>}{c.detalle}</p>
                    <p className="mt-1 text-xs text-muted">Responsable: {nombre(c.responsable_id)}{c.fecha_seguimiento && <> · <span className={atrasada ? 'font-bold text-danger' : ''}>{c.proxima_actividad ?? 'Seguimiento'}: {fechaRelativa(c.fecha_seguimiento)}{atrasada ? ' (atrasado)' : ''}</span></>}{c.motivo_cierre && <> · Motivo: {c.motivo_cierre}</>}</p>
                  </div>
                  <div className="flex gap-2">
                    {c.estado === 'consulta' && <Link to={`/presupuestos/nuevo?cliente=${c.cliente_id}&consulta=${c.id}`} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-mint-2 px-3 text-sm font-semibold text-deep hover:bg-[#d3eddf]"><FileText className="size-4" aria-hidden />Presupuestar</Link>}
                    <Boton chico variante="secundario" icono={Pencil} onClick={() => setModal({ c })}>Editar</Boton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
      {modal && <ConsultaModal consulta={modal.c} onCerrar={cerrar} />}
    </>
  );
}
