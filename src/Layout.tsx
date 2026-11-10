import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Banknote, ChartColumn, Ellipsis, FileText, House, Lightbulb, LogOut, MessageCircleQuestion, Package, Plus, Settings, Users, WifiOff, Wrench, type LucideIcon } from 'lucide-react';
import { useAuth } from './auth';
import { supabase } from './lib/supabase';
import { useConfig, useHayDemo } from './lib/api';
import { ROLES } from './lib/etiquetas';
import { Boton, Modal, cx } from './ui';

type Item = { a: string; t: string; i: LucideIcon; pronto?: string };
const NAV: Item[] = [
  { a: '/', t: 'Inicio', i: House },
  { a: '/clientes', t: 'Clientes', i: Users },
  { a: '/consultas', t: 'Consultas', i: MessageCircleQuestion },
  { a: '/presupuestos', t: 'Presupuestos', i: FileText },
  { a: '/taller', t: 'Taller', i: Wrench },
  { a: '/contenido', t: 'Contenido', i: Lightbulb },
  { a: '/finanzas', t: 'Finanzas', i: Banknote },
  { a: '/inventario', t: 'Inventario', i: Package, pronto: 'Fase 2' },
  { a: '/informes', t: 'Informes', i: ChartColumn, pronto: 'Fase 3' },
  { a: '/ajustes', t: 'Ajustes', i: Settings },
];
const BARRA = ['/', '/clientes', '/taller', '/contenido'];

export function Marca({ grande }: { grande?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <img src="/logo-z.png" alt="" className={grande ? 'size-11' : 'size-8'} />
      <span className={cx('font-extrabold tracking-tight text-deep', grande ? 'text-3xl' : 'text-2xl')}>zenix</span>
    </span>
  );
}

function useConexion() {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  useEffect(() => {
    const si = () => setEnLinea(true); const no = () => setEnLinea(false);
    window.addEventListener('online', si); window.addEventListener('offline', no);
    return () => { window.removeEventListener('online', si); window.removeEventListener('offline', no); };
  }, []);
  return enLinea;
}

export function Layout({ children }: { children: ReactNode }) {
  const { perfil } = useAuth();
  const enLinea = useConexion();
  const hayDemo = useHayDemo().data;
  const negocio = useConfig().data?.negocio.valor.nombre;
  const [mas, setMas] = useState(false);
  const [rapidas, setRapidas] = useState(false);
  const { pathname } = useLocation();
  const ir = useNavigate();
  useEffect(() => { setMas(false); setRapidas(false); window.scrollTo(0, 0); }, [pathname]);
  const salir = async () => { if (window.confirm('¿Cerrar sesión en este dispositivo?')) await supabase.auth.signOut({ scope: 'local' }); };
  const enlace = (n: Item, compacto = false) => (
    <NavLink key={n.a} to={n.a} end={n.a === '/'}
      className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 font-semibold transition-colors', compacto ? 'min-h-12 text-[15px]' : 'min-h-11 text-[15px]', isActive ? 'bg-mint-2 text-deep' : 'text-ink hover:bg-mint')}>
      <n.i className="size-5 shrink-0" aria-hidden /><span className="flex-1">{n.t}</span>
      {n.pronto && <span className="rounded-full bg-[#eef1f0] px-2 py-0.5 text-[11px] font-bold text-muted">{n.pronto}</span>}
    </NavLink>
  );
  const usuario = (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-mint-2 text-sm font-bold text-deep" aria-hidden>{perfil?.nombre.slice(0, 2).toUpperCase()}</span>
      <span className="min-w-0 flex-1 leading-tight"><span className="block truncate text-sm font-bold text-deep">{perfil?.nombre}</span><span className="block text-xs text-muted">{ROLES[perfil?.rol ?? 'operador']}</span></span>
      <button type="button" onClick={salir} aria-label="Cerrar sesión" title="Cerrar sesión" className="grid size-10 place-items-center rounded-full text-muted hover:bg-mint"><LogOut className="size-5" aria-hidden /></button>
    </div>
  );
  return (
    <div className="lg:flex">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Saltar al contenido</a>
      {/* Escritorio: navegación lateral */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <div className="px-2 pb-5"><Marca /></div>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1 overflow-y-auto">{NAV.map((n) => enlace(n))}</nav>
        <div className="border-t border-line pt-4">{usuario}</div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Celular: barra superior */}
        <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <Marca /><span className="max-w-[45%] truncate text-xs font-semibold text-muted">{perfil?.nombre}</span>
        </div>
        {!enLinea && <div role="alert" className="flex items-center justify-center gap-2 bg-warn-soft px-4 py-2 text-sm font-semibold text-warn"><WifiOff className="size-4" aria-hidden />Sin conexión. Podés ver lo ya cargado, pero no se guardará nada hasta que vuelva internet.</div>}
        {hayDemo && <div className="bg-warn-soft px-4 py-2 text-center text-sm font-semibold text-warn">Hay datos de demostración cargados y se suman a los totales. Borralos desde Ajustes → Datos antes de trabajar con clientes reales.</div>}
        <main id="contenido" className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pt-8">{children}</main>
      </div>

      {/* Celular: acciones rápidas y navegación compacta con "Más" */}
      <button type="button" onClick={() => setRapidas(true)} aria-label="Acciones rápidas" className="fixed bottom-20 right-4 z-30 grid size-14 place-items-center rounded-full bg-brand-strong text-white shadow-lg lg:hidden"><Plus className="size-6" aria-hidden /></button>
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.filter((n) => BARRA.includes(n.a)).map((n) => (
          <NavLink key={n.a} to={n.a} end={n.a === '/'} className={({ isActive }) => cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-brand-strong' : 'text-muted')}>
            <n.i className="size-5" aria-hidden />{n.t}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMas(true)} aria-haspopup="dialog" className={cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', BARRA.includes('/' + pathname.split('/')[1]) || pathname === '/' ? 'text-muted' : 'text-brand-strong')}>
          <Ellipsis className="size-5" aria-hidden />Más
        </button>
      </nav>
      <Modal titulo="Más" abierto={mas} onCerrar={() => setMas(false)}>
        <nav aria-label="Más secciones" className="flex flex-col gap-1">{NAV.filter((n) => !BARRA.includes(n.a)).map((n) => enlace(n, true))}</nav>
        <div className="mt-4 border-t border-line pt-4">{usuario}</div>
        {negocio && <p className="mt-3 text-center text-xs text-muted">{negocio} · Centro de operaciones</p>}
      </Modal>
      <Modal titulo="Acciones rápidas" abierto={rapidas} onCerrar={() => setRapidas(false)}>
        <div className="grid gap-2">
          {ACCIONES.map(([t, a, I]) => <Boton key={a} variante="suave" icono={I} className="justify-start" onClick={() => ir(a)}>{t}</Boton>)}
        </div>
      </Modal>
    </div>
  );
}

export const ACCIONES: [string, string, LucideIcon][] = [
  ['Nueva consulta', '/consultas?nueva=1', MessageCircleQuestion],
  ['Nuevo cliente', '/clientes?nuevo=1', Users],
  ['Nueva orden', '/taller/nueva', Wrench],
  ['Registrar movimiento', '/finanzas?nuevo=cobro', Banknote],
  ['Guardar idea', '/contenido?nueva=1', Lightbulb],
];
