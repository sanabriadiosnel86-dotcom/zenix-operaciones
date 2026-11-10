import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Ban, Check, CircleAlert, CircleCheck, CircleDot, Clock, LoaderCircle, X, type LucideIcon } from 'lucide-react';
import type { Tono } from './lib/etiquetas';
import { miles, soloDigitos } from './lib/format';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ───────────── Botones ─────────────
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' | 'suave' | 'peligro'; icono?: LucideIcon; cargando?: boolean; chico?: boolean };
export function Boton({ variante = 'primario', icono: Icono, cargando, chico, className, children, disabled, type = 'button', ...p }: BtnProps) {
  const estilos = {
    primario: 'bg-brand-strong text-white hover:bg-deep shadow-sm',
    secundario: 'bg-surface text-deep border border-line hover:bg-mint',
    suave: 'bg-mint-2 text-deep hover:bg-[#d3eddf]',
    peligro: 'bg-surface text-danger border border-[#f3c5c0] hover:bg-danger-soft',
  }[variante];
  return (
    <button type={type} disabled={disabled || cargando} aria-busy={cargando || undefined}
      className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed', chico ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4 text-[15px]', estilos, className)} {...p}>
      {cargando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : Icono ? <Icono className="size-4 shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}

// ───────────── Contenedores ─────────────
export function Tarjeta({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-2xl border border-line bg-surface shadow-card', className)} {...p}>{children}</div>;
}
export function Seccion({ titulo, icono: Icono, accion, children, className }: { titulo: string; icono?: LucideIcon; accion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Tarjeta className={cx('p-4 sm:p-5', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-deep">{Icono && <Icono className="size-5 text-brand-strong" aria-hidden />}{titulo}</h2>
        {accion}
      </div>
      {children}
    </Tarjeta>
  );
}
export function Encabezado({ titulo, detalle, acciones, volver }: { titulo: string; detalle?: ReactNode; acciones?: ReactNode; volver?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        {volver}
        <h1 className="text-2xl font-extrabold tracking-tight text-deep sm:text-[28px]">{titulo}</h1>
        {detalle && <div className="mt-1 text-sm text-muted">{detalle}</div>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </header>
  );
}

// ───────────── Estados: texto + ícono + color ─────────────
const TONOS: Record<Tono, { c: string; i: LucideIcon }> = {
  neutro: { c: 'bg-[#eef1f0] text-[#3d4a46]', i: CircleDot }, verde: { c: 'bg-mint-2 text-deep', i: CircleCheck },
  ambar: { c: 'bg-warn-soft text-warn', i: Clock }, azul: { c: 'bg-info-soft text-info', i: CircleDot }, rojo: { c: 'bg-danger-soft text-danger', i: Ban },
};
export function Insignia({ tono = 'neutro', children, icono }: { tono?: Tono; children: ReactNode; icono?: LucideIcon }) {
  const I = icono ?? TONOS[tono].i;
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', TONOS[tono].c)}><I className="size-3.5" aria-hidden />{children}</span>;
}
export const Demo = ({ si }: { si?: boolean }) => (si ? <span className="rounded-md border border-dashed border-warn px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-warn">Demo</span> : null);

export function Vacio({ icono: Icono, titulo, children, accion }: { icono: LucideIcon; titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-mint-2 text-brand-strong"><Icono className="size-6" aria-hidden /></span>
      <p className="font-bold text-deep">{titulo}</p>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}
export const Cargando = ({ texto = 'Cargando…' }: { texto?: string }) => (
  <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted"><LoaderCircle className="size-5 animate-spin" aria-hidden />{texto}</div>
);
export function ErrorCarga({ error, reintentar }: { error: unknown; reintentar?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-[#f3c5c0] bg-danger-soft px-4 py-8 text-center text-sm text-danger">
      <CircleAlert className="size-6" aria-hidden />
      <p className="font-semibold">{mensajeError(error, 'No pudimos cargar los datos.')}</p>
      {reintentar && <Boton variante="secundario" chico onClick={reintentar}>Reintentar</Boton>}
    </div>
  );
}

// ───────────── Campos de formulario ─────────────
const campoCls = 'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink placeholder:text-[#8a9893] focus:border-brand-strong focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-mint';
export function Campo({ etiqueta, ayuda, error, obligatorio, children, className }: { etiqueta: string; ayuda?: string; error?: string | null; obligatorio?: boolean; children: (p: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode; className?: string }) {
  const id = useId();
  const desc = ayuda || error ? `${id}-d` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-deep">{etiqueta}{obligatorio && <span className="text-danger" aria-hidden> *</span>}</label>
      {children({ id, 'aria-describedby': desc, 'aria-invalid': error ? true : undefined })}
      {(error || ayuda) && <p id={desc} className={cx('mt-1 text-xs', error ? 'font-semibold text-danger' : 'text-muted')}>{error || ayuda}</p>}
    </div>
  );
}
type Base = { etiqueta: string; ayuda?: string; error?: string | null; className?: string };
export function Texto({ etiqueta, ayuda, error, className, valor, onCambio, ...p }: Base & { valor: string; onCambio: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <Campo etiqueta={etiqueta} ayuda={ayuda} error={error} obligatorio={p.required} className={className}>{(a) => <input {...a} {...p} className={campoCls} value={valor} onChange={(e) => onCambio(e.target.value)} />}</Campo>;
}
export function Area({ etiqueta, ayuda, error, className, valor, onCambio, filas = 3, ...p }: Base & { valor: string; onCambio: (v: string) => void; filas?: number } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  return <Campo etiqueta={etiqueta} ayuda={ayuda} error={error} obligatorio={p.required} className={className}>{(a) => <textarea {...a} {...p} rows={filas} className={campoCls} value={valor} onChange={(e) => onCambio(e.target.value)} />}</Campo>;
}
export function Selector({ etiqueta, ayuda, error, className, valor, onCambio, opciones, vacio, ...p }: Base & { valor: string; onCambio: (v: string) => void; opciones: Record<string, string> | [string, string][]; vacio?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  const lista = Array.isArray(opciones) ? opciones : Object.entries(opciones);
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error} obligatorio={p.required} className={className}>
      {(a) => (
        <select {...a} {...p} className={campoCls} value={valor} onChange={(e) => onCambio(e.target.value)}>
          {vacio !== undefined && <option value="">{vacio}</option>}
          {lista.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      )}
    </Campo>
  );
}
/** Importe en guaraníes: solo enteros, con separador de miles mientras se escribe. */
export function Importe({ etiqueta, ayuda, error, className, valor, onCambio, ...p }: Base & { valor: number | null; onCambio: (v: number | null) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error} obligatorio={p.required} className={className}>
      {(a) => (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted" aria-hidden>Gs.</span>
          <input {...a} {...p} inputMode="numeric" autoComplete="off" className={cx(campoCls, 'pl-11 text-right font-semibold')} value={valor == null ? '' : miles(valor)} onChange={(e) => onCambio(soloDigitos(e.target.value))} />
        </div>
      )}
    </Campo>
  );
}
export function Buscador({ valor, onCambio, placeholder }: { valor: string; onCambio: (v: string) => void; placeholder: string }) {
  return <input type="search" aria-label={placeholder} placeholder={placeholder} className={cx(campoCls, 'sm:max-w-xs')} value={valor} onChange={(e) => onCambio(e.target.value)} />;
}
export function Filtros<T extends string>({ valor, onCambio, opciones, etiqueta }: { valor: T; onCambio: (v: T) => void; opciones: [T, string][]; etiqueta: string }) {
  return (
    <div role="group" aria-label={etiqueta} className="flex gap-1.5 overflow-x-auto pb-1">
      {opciones.map(([v, t]) => (
        <button key={v} type="button" aria-pressed={valor === v} onClick={() => onCambio(v)}
          className={cx('min-h-9 whitespace-nowrap rounded-full border px-3 text-sm font-semibold', valor === v ? 'border-brand-strong bg-brand-strong text-white' : 'border-line bg-surface text-deep hover:bg-mint')}>{t}</button>
      ))}
    </div>
  );
}
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-muted">{etiqueta}</dt><dd className="mt-0.5 break-words text-sm text-ink">{children || '—'}</dd></div>;
}

// ───────────── Diálogo modal (hoja completa en celular) ─────────────
export function Modal({ titulo, abierto, onCerrar, sucio, children, pie, ancho = 'max-w-lg' }: { titulo: string; abierto: boolean; onCerrar: () => void; sucio?: boolean; children: ReactNode; pie?: ReactNode; ancho?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const cerrar = useCallback(() => {
    if (sucio && !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
    onCerrar();
  }, [sucio, onCerrar]);
  useEffect(() => {
    if (!abierto) return;
    const previo = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => (ref.current?.querySelector<HTMLElement>('[data-foco], input, select, textarea') ?? ref.current)?.focus(), 30);
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } };
    document.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); document.removeEventListener('keydown', tecla); document.body.style.overflow = ''; previo?.focus?.(); };
  }, [abierto, cerrar]);
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-deep/40 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} className={cx('flex max-h-[94dvh] w-full flex-col rounded-t-3xl bg-surface shadow-xl sm:rounded-3xl', ancho)}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-deep">{titulo}</h2>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="grid size-10 place-items-center rounded-full text-muted hover:bg-mint"><X className="size-5" aria-hidden /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {pie && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{pie}</div>}
      </div>
    </div>
  );
}

// ───────────── Avisos ─────────────
type Aviso = { id: number; tipo: 'ok' | 'error'; texto: string };
const AvisosCtx = createContext<{ ok: (t: string) => void; error: (t: string) => void }>({ ok: () => {}, error: () => {} });
export const useAvisos = () => useContext(AvisosCtx);
export function Avisos({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Aviso[]>([]);
  const poner = useCallback((tipo: Aviso['tipo'], texto: string) => {
    const id = Date.now() + Math.random();
    setLista((l) => [...l.slice(-2), { id, tipo, texto }]);
    setTimeout(() => setLista((l) => l.filter((a) => a.id !== id)), tipo === 'ok' ? 3500 : 8000);
  }, []);
  const api = useRef({ ok: (t: string) => poner('ok', t), error: (t: string) => poner('error', t) }).current;
  return (
    <AvisosCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {lista.map((a) => (
          <div key={a.id} role={a.tipo === 'error' ? 'alert' : 'status'} className={cx('pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg', a.tipo === 'ok' ? 'bg-deep text-white' : 'bg-danger text-white')}>
            {a.tipo === 'ok' ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
            <span>{a.texto}</span>
            <button type="button" aria-label="Cerrar aviso" className="ml-2 opacity-80 hover:opacity-100" onClick={() => setLista((l) => l.filter((x) => x.id !== a.id))}><X className="size-4" aria-hidden /></button>
          </div>
        ))}
      </div>
    </AvisosCtx.Provider>
  );
}

/** Traduce errores a mensajes claros, sin exponer detalles internos. */
export function mensajeError(e: unknown, generico = 'No se pudo completar la operación. No se guardó ningún cambio.'): string {
  const err = (e ?? {}) as { code?: string; message?: string; name?: string; status?: number };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Sin conexión. No se guardó nada; reintentá cuando vuelva internet.';
  if (err.code?.startsWith('ZX') && err.message) return err.message;
  if (/failed to fetch|networkerror|load failed/i.test(err.message ?? '')) return 'No pudimos conectar con el servidor. No se guardó nada; reintentá en unos segundos.';
  if (err.code === '23505') return 'Ya existe un registro con esos datos.';
  if (err.code === '23514' || err.code === '22P02' || err.code === '23502') return 'Hay un dato con formato inválido. Revisá los campos marcados.';
  if (err.code === '23503') return 'El registro está vinculado a otros datos y no se puede modificar así.';
  if (err.code === '42501' || err.code === 'PGRST116') return 'No tenés permiso para esta acción, o el registro ya no admite cambios.';
  if (err.code === 'PGRST301' || err.status === 401) return 'Tu sesión venció. Volvé a ingresar.';
  return generico;
}
