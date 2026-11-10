import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, Lightbulb, Pencil, Plus } from 'lucide-react';
import { guardarFila, useAccion, useIdeas, useNombreSocio } from '../lib/api';
import { CANALES_CONTENIDO, FORMATOS, IDEA, PRIORIDADES } from '../lib/etiquetas';
import { fechaHora } from '../lib/format';
import type { Idea } from '../lib/types';
import { IdeaModal } from '../forms';
import { Boton, Buscador, Cargando, Demo, Encabezado, ErrorCarga, Filtros, Insignia, Tarjeta, Vacio } from '../ui';

type F = 'activas' | 'idea' | 'cerradas' | 'todas';
export default function Contenido() {
  const q = useIdeas();
  const nombre = useNombreSocio();
  const [sp, setSp] = useSearchParams();
  const [filtro, setFiltro] = useState<F>('activas');
  const [texto, setTexto] = useState('');
  const [rapida, setRapida] = useState('');
  const [modal, setModal] = useState<{ i?: Idea } | null>(sp.get('nueva') ? {} : null);
  const capturar = useAccion(() => guardarFila<Idea>('ideas', { titulo: rapida.trim() }), 'Idea guardada.');
  const mover = useAccion((a: { i: Idea; estado: string }) => guardarFila<Idea>('ideas', { estado: a.estado }, a.i), 'Estado de la idea actualizado.');
  const lista = useMemo(() => (q.data ?? []).filter((i) => {
    const cerrada = ['publicado', 'descartada'].includes(i.estado);
    if (filtro === 'activas' && cerrada) return false;
    if (filtro === 'idea' && i.estado !== 'idea') return false;
    if (filtro === 'cerradas' && !cerrada) return false;
    const t = texto.trim().toLowerCase();
    return !t || `${i.titulo} ${i.nota ?? ''}`.toLowerCase().includes(t);
  }), [q.data, filtro, texto]);
  return (
    <>
      <Encabezado titulo="Contenido" detalle="Capturá ideas apenas aparecen. Tablero, calendario, galería y campañas llegan con la fase 2." acciones={<Boton icono={Plus} onClick={() => setModal({})}>Guardar idea</Boton>} />
      <Tarjeta className="mb-4 p-4">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (rapida.trim()) capturar.mutate(undefined, { onSuccess: () => setRapida('') }); }}>
          <input aria-label="Idea rápida" placeholder="Escribí tu idea de contenido…" maxLength={160} className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2.5" value={rapida} onChange={(e) => setRapida(e.target.value)} />
          <Boton type="submit" icono={Lightbulb} cargando={capturar.isPending} disabled={!rapida.trim()}>Guardar rápido</Boton>
        </form>
        <p className="mt-2 text-xs text-muted">Se guarda solo el título; después podés completar nota, formato, canal y responsable.</p>
      </Tarjeta>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Filtros etiqueta="Filtrar ideas" valor={filtro} onCambio={setFiltro} opciones={[['activas', 'En curso'], ['idea', 'Solo ideas'], ['cerradas', 'Publicadas o descartadas'], ['todas', 'Todas']]} />
        <Buscador valor={texto} onCambio={setTexto} placeholder="Buscar ideas…" />
      </div>
      <Tarjeta>
        {q.isLoading ? <Cargando /> : q.error ? <ErrorCarga error={q.error} reintentar={() => void q.refetch()} /> : lista.length === 0 ? (
          <Vacio icono={Lightbulb} titulo={q.data?.length ? 'Ninguna idea en este filtro' : 'Todavía no hay ideas guardadas'}>{q.data?.length ? 'Probá con otro filtro.' : 'Usá el campo de arriba para anotar la primera en segundos, también desde el celular.'}</Vacio>
        ) : (
          <ul className="divide-y divide-line">
            {lista.map((i) => (
              <li key={i.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-bold text-deep">{i.titulo}<Insignia tono={IDEA[i.estado]?.tono}>{IDEA[i.estado]?.t}</Insignia>{i.prioridad === 'alta' && <Insignia tono="rojo">Prioridad alta</Insignia>}<Demo si={i.es_demo} /></p>
                  {i.nota && <p className="mt-1 line-clamp-2 text-sm text-ink">{i.nota}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">{[i.formato && FORMATOS[i.formato], i.canal && CANALES_CONTENIDO[i.canal], `Prioridad ${PRIORIDADES[i.prioridad].toLowerCase()}`, nombre(i.responsable_id), fechaHora(i.created_at)].filter(Boolean).join(' · ')}
                    {i.enlace && <a href={i.enlace} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-brand-strong hover:underline"><ExternalLink className="size-3.5" aria-hidden />Referencia</a>}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select aria-label={`Estado de ${i.titulo}`} className="min-h-9 rounded-xl border border-line bg-surface px-2 text-sm font-semibold text-deep" value={i.estado} disabled={mover.isPending} onChange={(e) => mover.mutate({ i, estado: e.target.value })}>
                    {Object.entries(IDEA).map(([k, x]) => <option key={k} value={k}>{x.t}</option>)}
                  </select>
                  <Boton chico variante="secundario" icono={Pencil} onClick={() => setModal({ i })}>Editar</Boton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      {modal && <IdeaModal idea={modal.i} onCerrar={() => { setModal(null); if (sp.size) setSp({}, { replace: true }); }} />}
    </>
  );
}
