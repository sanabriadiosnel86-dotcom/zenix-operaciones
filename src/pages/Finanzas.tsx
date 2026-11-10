import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Ban, Banknote, HandCoins, Info, Plus, Scale } from 'lucide-react';
import { useAuth } from '../auth';
import { api, useAccion, useMovimientos, useNombreSocio, useOrdenes } from '../lib/api';
import { CATEGORIAS_GASTO, MEDIOS_PAGO } from '../lib/etiquetas';
import { fecha, gs, hoyISO, nOrden } from '../lib/format';
import type { Movimiento } from '../lib/types';
import { MovimientoModal } from '../forms';
import { Area, Boton, Cargando, Demo, Encabezado, ErrorCarga, Filtros, Insignia, Modal, Seccion, Tarjeta, Texto, Vacio, cx } from '../ui';

export default function Finanzas() {
  const { esAdmin } = useAuth();
  const nombre = useNombreSocio();
  const [sp, setSp] = useSearchParams();
  const [mes, setMes] = useState(hoyISO().slice(0, 7));
  const [filtro, setFiltro] = useState<'todos' | 'cobro' | 'gasto'>('todos');
  const n = sp.get('nuevo');
  const [nuevo, setNuevo] = useState<null | 'cobro' | 'gasto'>(n === 'cobro' || n === 'gasto' ? n : null);
  const [anular, setAnular] = useState<Movimiento | null>(null);
  const [y, m] = mes.split('-').map(Number);
  const hasta = `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const q = useMovimientos(`${mes}-01`, hasta);
  const ordenes = useOrdenes();
  const vigentes = (q.data ?? []).filter((x) => !x.anulado_en);
  const cobrado = vigentes.filter((x) => x.tipo === 'cobro').reduce((s, x) => s + x.monto, 0);
  const gastado = vigentes.filter((x) => x.tipo === 'gasto').reduce((s, x) => s + x.monto, 0);
  const deudores = (ordenes.data ?? []).filter((o) => o.estado !== 'cancelado' && o.saldo > 0);
  const lista = useMemo(() => (q.data ?? []).filter((x) => filtro === 'todos' || x.tipo === filtro), [q.data, filtro]);
  const kpi = [
    { t: 'Cobrado en el mes', v: gs(cobrado), i: ArrowDownLeft }, { t: 'Gastos pagados en el mes', v: gs(gastado), i: ArrowUpRight },
    { t: 'Cobros menos gastos', v: (cobrado - gastado < 0 ? '− ' : '') + gs(Math.abs(cobrado - gastado)), i: Scale }, { t: 'Por cobrar (todas las órdenes)', v: gs(deudores.reduce((s, o) => s + o.saldo, 0)), i: HandCoins },
  ];
  return (
    <>
      <Encabezado titulo="Finanzas" detalle="Cobros y gastos básicos. Los importes anulados no se suman." acciones={<><Boton icono={Plus} onClick={() => setNuevo('cobro')}>Registrar cobro</Boton><Boton variante="secundario" icono={Plus} onClick={() => setNuevo('gasto')}>Registrar gasto</Boton></>} />
      <div className="mb-4 max-w-[220px]"><Texto etiqueta="Mes" type="month" max={hoyISO().slice(0, 7)} valor={mes} onCambio={(x) => x && setMes(x)} /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpi.map((k) => <Tarjeta key={k.t} className="p-4"><p className="flex items-center gap-2 text-sm font-semibold text-muted"><k.i className="size-5 shrink-0 text-brand-strong" aria-hidden />{k.t}</p><p className="mt-2 text-xl font-extrabold text-deep sm:text-2xl">{q.isLoading ? '…' : k.v}</p></Tarjeta>)}
      </div>
      <p className="mt-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-info"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />"Cobros menos gastos" no es la ganancia ni el saldo de caja: todavía no se registran aportes, retiros, compras de stock ni costos por trabajo. Caja, resultado y reparto entre socios llegan con la fase 2.</p>
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Seccion titulo="Movimientos del mes" icono={Banknote} className="lg:col-span-2" accion={<Filtros etiqueta="Tipo de movimiento" valor={filtro} onCambio={setFiltro} opciones={[['todos', 'Todos'], ['cobro', 'Cobros'], ['gasto', 'Gastos']]} />}>
          {q.isLoading ? <Cargando /> : q.error ? <ErrorCarga error={q.error} reintentar={() => void q.refetch()} /> : lista.length === 0 ? (
            <Vacio icono={Banknote} titulo="Sin movimientos en este período">Registrá cada cobro y gasto cuando ocurre, tenga o no comprobante.</Vacio>
          ) : (
            <ul className="divide-y divide-line">
              {lista.map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className={cx('flex flex-wrap items-center gap-2 text-sm font-semibold', x.anulado_en ? 'text-muted line-through' : 'text-deep')}>{x.concepto}<Demo si={x.es_demo} /></span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Insignia tono={x.anulado_en ? 'rojo' : x.tipo === 'cobro' ? 'verde' : 'ambar'} icono={x.anulado_en ? Ban : x.tipo === 'cobro' ? ArrowDownLeft : ArrowUpRight}>{x.anulado_en ? 'Anulado' : x.tipo === 'cobro' ? 'Cobro' : `Gasto · ${CATEGORIAS_GASTO[x.categoria ?? 'otro']}`}</Insignia>
                      {fecha(x.fecha)} · {MEDIOS_PAGO[x.medio]} · {x.comprobante ? `Comp. ${x.comprobante}` : 'Sin comprobante'} · {nombre(x.created_by)}
                      {x.orden_id && <Link className="font-semibold text-brand-strong hover:underline" to={`/taller/${x.orden_id}`}>Ver orden</Link>}
                    </span>
                    {x.anulado_en && <span className="block text-xs text-danger">Motivo: {x.anulado_motivo}</span>}
                  </span>
                  <span className="text-right"><b className={cx('block whitespace-nowrap', x.anulado_en ? 'text-muted line-through' : x.tipo === 'gasto' ? 'text-danger' : 'text-deep')}>{x.tipo === 'gasto' ? '− ' : ''}{gs(x.monto)}</b>
                    {esAdmin && !x.anulado_en && <button type="button" className="mt-1 text-xs font-semibold text-danger hover:underline" onClick={() => setAnular(x)}>Anular</button>}</span>
                </li>
              ))}
            </ul>
          )}
        </Seccion>
        <Seccion titulo="Nos deben" icono={HandCoins}>
          {deudores.length === 0 ? <p className="text-sm text-muted">No hay saldos pendientes.</p> : (
            <ul className="divide-y divide-line">{deudores.map((o) => <li key={o.id}><Link to={`/taller/${o.id}`} className="flex justify-between gap-2 py-2 text-sm hover:bg-mint"><span><b className="text-deep">{nOrden(o.numero)}</b> · {o.cliente_nombre}</span><b className="whitespace-nowrap text-warn">{gs(o.saldo)}</b></Link></li>)}</ul>
          )}
        </Seccion>
      </div>
      {nuevo && <MovimientoModal tipo={nuevo} onCerrar={() => { setNuevo(null); if (sp.size) setSp({}, { replace: true }); }} />}
      {anular && <AnularModal m={anular} onCerrar={() => setAnular(null)} />}
    </>
  );
}

function AnularModal({ m, onCerrar }: { m: Movimiento; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const ok = useAccion(() => api.anularMovimiento({ id: m.id, motivo }), 'Movimiento anulado. Queda en el historial.');
  return (
    <Modal titulo="Anular movimiento" abierto onCerrar={onCerrar} sucio={motivo !== ''} pie={<><Boton variante="secundario" onClick={onCerrar}>Volver</Boton><Boton variante="peligro" icono={Ban} cargando={ok.isPending} disabled={!motivo.trim()} onClick={() => ok.mutate(undefined, { onSuccess: onCerrar })}>Anular {gs(m.monto)}</Boton></>}>
      <p className="mb-3 text-sm">Vas a anular <b>{m.concepto}</b> del {fecha(m.fecha)}. No se borra: queda tachado con tu nombre, la fecha y el motivo, y deja de sumar en los totales y en el saldo de la orden.</p>
      <Area etiqueta="Motivo" required maxLength={500} valor={motivo} onCambio={setMotivo} />
    </Modal>
  );
}
