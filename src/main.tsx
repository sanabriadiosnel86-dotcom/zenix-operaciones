import { StrictMode, lazy, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KeyRound, LogIn, ShieldAlert } from 'lucide-react';
import './index.css';
import { AuthProvider, useAuth } from './auth';
import { configurado, supabase } from './lib/supabase';
import { Avisos, Boton, Cargando, Tarjeta, Texto } from './ui';
import { Layout, Marca } from './Layout';
import Inicio from './pages/Inicio';
import { Clientes, ClienteFicha } from './pages/Clientes';
import Consultas from './pages/Consultas';
import { Presupuestos, PresupuestoEditor, PresupuestoDetalle } from './pages/Presupuestos';
import { Taller, OrdenDetalle, OrdenNueva } from './pages/Taller';
import Finanzas from './pages/Finanzas';
import Contenido from './pages/Contenido';
import Proximamente from './pages/Proximamente';

const Ajustes = lazy(() => import('./pages/Ajustes'));

// Los datos viven solo en memoria mientras hay sesión; al salir se vacían.
const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true } } });
const limpiar = () => qc.clear();

function Pantalla({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Marca grande /></div>
        {children}
      </div>
    </main>
  );
}

function Ingreso() {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const entrar = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave });
    setEnviando(false);
    if (!error) return;
    if (!navigator.onLine || /fetch/i.test(error.message)) setError('No pudimos conectar. Revisá tu conexión e intentá de nuevo.');
    else if (error.status === 429) setError('Demasiados intentos. Esperá unos minutos antes de volver a probar.');
    else setError('Correo o contraseña incorrectos.');
  };
  return (
    <Pantalla>
      <Tarjeta className="p-6">
        <h1 className="text-xl font-extrabold text-deep">Centro de operaciones</h1>
        <p className="mt-1 text-sm text-muted">Acceso privado para los socios de Zenix.</p>
        <form onSubmit={entrar} className="mt-5 space-y-4" noValidate>
          <Texto etiqueta="Correo" type="email" autoComplete="username" required valor={email} onCambio={setEmail} />
          <Texto etiqueta="Contraseña" type="password" autoComplete="current-password" required valor={clave} onCambio={setClave} />
          {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
          <Boton type="submit" icono={LogIn} cargando={enviando} disabled={!email || !clave} className="w-full">Ingresar</Boton>
        </form>
        <p className="mt-4 flex items-start gap-2 text-xs text-muted"><KeyRound className="mt-0.5 size-3.5 shrink-0" aria-hidden />No hay registro público. Las cuentas las crea un Administrador.</p>
      </Tarjeta>
    </Pantalla>
  );
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Pantalla>
      <Tarjeta className="p-6 text-sm text-ink">
        <h1 className="flex items-center gap-2 text-lg font-extrabold text-deep"><ShieldAlert className="size-5 text-warn" aria-hidden />{titulo}</h1>
        <div className="mt-3 space-y-3">{children}</div>
      </Tarjeta>
    </Pantalla>
  );
}

function App() {
  const { cargando, sesion, perfil, errorPerfil, esAdmin, recargarPerfil } = useAuth();
  if (!configurado) return <Aviso titulo="Falta conectar la base de datos"><p>Definí <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> (ver <code>.env.example</code> y <code>docs/DESPLIEGUE.md</code>) y volvé a compilar.</p></Aviso>;
  if (cargando) return <Pantalla><Cargando texto="Abriendo Zenix…" /></Pantalla>;
  if (!sesion) return <Ingreso />;
  if (!perfil) return (
    <Aviso titulo={errorPerfil ? 'No pudimos verificar tu cuenta' : 'Tu cuenta no está habilitada'}>
      <p>{errorPerfil ? 'Revisá tu conexión y reintentá.' : 'Ingresaste correctamente, pero esta cuenta no figura como socio activo de Zenix. Pedile a un Administrador que la habilite.'}</p>
      <div className="flex gap-2">{errorPerfil && <Boton chico onClick={() => void recargarPerfil()}>Reintentar</Boton>}<Boton chico variante="secundario" onClick={() => void supabase.auth.signOut()}>Cerrar sesión</Boton></div>
    </Aviso>
  );
  return (
    <Layout>
      <Suspense fallback={<Cargando />}>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/clientes/:id" element={<ClienteFicha />} />
          <Route path="/consultas" element={<Consultas />} />
          <Route path="/presupuestos" element={<Presupuestos />} />
          <Route path="/presupuestos/nuevo" element={<PresupuestoEditor />} />
          <Route path="/presupuestos/:id" element={<PresupuestoDetalle />} />
          <Route path="/presupuestos/:id/revisar" element={<PresupuestoEditor />} />
          <Route path="/taller" element={<Taller />} />
          <Route path="/taller/nueva" element={<OrdenNueva />} />
          <Route path="/taller/:id" element={<OrdenDetalle />} />
          <Route path="/finanzas" element={<Finanzas />} />
          <Route path="/contenido" element={<Contenido />} />
          <Route path="/inventario" element={<Proximamente modulo="Inventario" fase={2} detalle="Productos, insumos, herramientas, compras, consumo por orden y alertas de stock." />} />
          <Route path="/informes" element={<Proximamente modulo="Informes técnicos" fase={3} detalle="Mediciones antes y después con metodología, catálogo de componentes y exportación en PDF." />} />
          <Route path="/ajustes" element={<Ajustes esAdmin={esAdmin} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <Avisos>
        <AuthProvider alCerrar={limpiar}>
          <BrowserRouter><App /></BrowserRouter>
        </AuthProvider>
      </Avisos>
    </QueryClientProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
