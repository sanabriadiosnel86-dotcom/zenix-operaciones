import { useState } from 'react';
import { Database, Download, KeyRound, Lock, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabase';
import { api, tarifaVigente, useAccion, useConfig, useHayDemo, useServicios, useSocios } from '../lib/api';
import { ROLES } from '../lib/etiquetas';
import { aCSV, descargar, fechaHora, gs, hoyISO } from '../lib/format';
import type { Config, Perfil, Servicio } from '../lib/types';
import { useForm } from '../forms';
import { Area, Boton, Cargando, Encabezado, ErrorCarga, Filtros, Importe, Insignia, Modal, Seccion, Selector, Texto, mensajeError, useAvisos } from '../ui';

type Tab = 'catalogo' | 'negocio' | 'socios' | 'comercial' | 'plantillas' | 'datos' | 'cuenta';
const lineas = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export default function Ajustes({ esAdmin }: { esAdmin: boolean }) {
  const [tab, setTab] = useState<Tab>('catalogo');
  const config = useConfig();
  return (
    <>
      <Encabezado titulo="Ajustes" detalle="Todo lo que se configura acá se guarda en la base de datos: no hace falta tocar código ni volver a desplegar." />
      {!esAdmin && <p className="mb-4 flex items-center gap-2 rounded-xl bg-info-soft px-3 py-2 text-sm font-semibold text-info"><Lock className="size-4" aria-hidden />Tu rol es Socio operador: podés consultar los ajustes, pero solo un Administrador puede modificarlos.</p>}
      <div className="mb-5"><Filtros etiqueta="Sección de ajustes" valor={tab} onCambio={setTab} opciones={[['catalogo', 'Catálogo y tarifas'], ['negocio', 'Negocio'], ['socios', 'Socios y roles'], ['comercial', 'Condiciones y reparto'], ['plantillas', 'Mensajes'], ['datos', 'Datos'], ['cuenta', 'Mi cuenta']]} /></div>
      {tab === 'catalogo' && <Catalogo esAdmin={esAdmin} />}
      {tab === 'socios' && <Socios esAdmin={esAdmin} />}
      {tab === 'datos' && <Datos esAdmin={esAdmin} />}
      {tab === 'cuenta' && <Cuenta />}
      {['negocio', 'comercial', 'plantillas'].includes(tab) && (config.isLoading ? <Cargando /> : config.error || !config.data ? <ErrorCarga error={config.error} reintentar={() => void config.refetch()} /> : (
        <>
          {tab === 'negocio' && <Negocio key={config.data.negocio.version} c={config.data} esAdmin={esAdmin} />}
          {tab === 'comercial' && <Comercial key={`${config.data.comercial.version}-${config.data.reparto.version}`} c={config.data} esAdmin={esAdmin} />}
          {tab === 'plantillas' && <Plantillas key={config.data.plantillas.version} c={config.data} esAdmin={esAdmin} />}
        </>
      ))}
    </>
  );
}

// ───────────── Catálogo de servicios y versiones de tarifa ─────────────
function Catalogo({ esAdmin }: { esAdmin: boolean }) {
  const q = useServicios();
  const [modal, setModal] = useState<{ s?: Servicio } | null>(null);
  if (q.isLoading) return <Cargando />;
  if (q.error) return <ErrorCarga error={q.error} reintentar={() => void q.refetch()} />;
  return (
    <Seccion titulo="Servicios y productos" accion={esAdmin && <Boton chico icono={Plus} onClick={() => setModal({})}>Nuevo</Boton>}>
      <p className="mb-3 text-sm text-muted">Cambiar una tarifa crea una versión nueva: se aplica a los próximos presupuestos. Los presupuestos y órdenes existentes conservan lo acordado.</p>
      <ul className="divide-y divide-line">
        {(q.data ?? []).map((s) => {
          const t = tarifaVigente(s);
          return (
            <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-bold text-deep">{s.nombre}{!s.activo && <Insignia tono="neutro">Inactivo</Insignia>}{t?.precio == null && <Insignia tono="ambar">A cotizar</Insignia>}</p>
                {s.descripcion && <p className="text-sm text-muted">{s.descripcion}</p>}
                <p className="mt-1 text-xs text-ink">{t && t.inclusiones.length > 0 ? <><b>Incluye:</b> {t.inclusiones.join(' · ')}</> : <span className="font-semibold text-warn">Inclusiones pendientes de configurar</span>}</p>
                {t && t.exclusiones.length > 0 && <p className="text-xs text-ink"><b>No incluye:</b> {t.exclusiones.join(' · ')}</p>}
                <p className="mt-1 text-xs text-muted">Tarifa vigente desde {fechaHora(t?.vigente_desde)} · {s.tarifas.length} {s.tarifas.length === 1 ? 'versión' : 'versiones'}</p>
              </div>
              <div className="flex items-center gap-3"><b className="whitespace-nowrap text-lg text-deep">{gs(t?.precio)}</b>{esAdmin && <Boton chico variante="secundario" icono={Pencil} onClick={() => setModal({ s })}>Editar</Boton>}</div>
            </li>
          );
        })}
      </ul>
      {modal && <ServicioModal s={modal.s} onCerrar={() => setModal(null)} />}
    </Seccion>
  );
}

function ServicioModal({ s, onCerrar }: { s?: Servicio; onCerrar: () => void }) {
  const t = s ? tarifaVigente(s) : null;
  const f = useForm({ nombre: s?.nombre ?? '', tipo: s?.tipo ?? 'servicio', descripcion: s?.descripcion ?? '', activo: s?.activo ?? true, precio: (t?.precio ?? null) as number | null, inclusiones: (t?.inclusiones ?? []).join('\n'), exclusiones: (t?.exclusiones ?? []).join('\n'), checklist: (t?.checklist ?? []).join('\n'), condiciones: t?.condiciones ?? '' });
  const ok = useAccion(() => api.guardarServicio({ id: s?.id ?? null, nombre: f.v.nombre, tipo: f.v.tipo, descripcion: f.v.descripcion, activo: f.v.activo, precio: f.v.precio, inclusiones: lineas(f.v.inclusiones), exclusiones: lineas(f.v.exclusiones), checklist: lineas(f.v.checklist), condiciones: f.v.condiciones, version: s?.version ?? null }), 'Catálogo actualizado. Los presupuestos anteriores no cambian.');
  const cambiaPrecio = s && t && t.precio !== f.v.precio;
  const historial = s ? [...s.tarifas].sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde)) : [];
  return (
    <Modal titulo={s ? 'Editar servicio' : 'Nuevo servicio o producto'} ancho="max-w-2xl" abierto onCerrar={onCerrar} sucio={f.sucio} pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton type="submit" form="f" cargando={ok.isPending} disabled={f.v.nombre.trim().length < 2}>Guardar</Boton></>}>
      <form id="f" className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); ok.mutate(undefined, { onSuccess: onCerrar }); }}>
        <Texto className="sm:col-span-2" etiqueta="Nombre" required maxLength={120} valor={f.v.nombre} onCambio={(x) => f.set('nombre', x)} />
        <Selector etiqueta="Tipo" opciones={{ servicio: 'Servicio', producto: 'Producto' }} valor={f.v.tipo} onCambio={(x) => f.set('tipo', x as 'servicio' | 'producto')} />
        <Importe etiqueta="Precio" valor={f.v.precio} onCambio={(x) => f.set('precio', x)} ayuda="Dejalo vacío si se cotiza aparte en cada caso." />
        {cambiaPrecio && <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-warn sm:col-span-2">La tarifa pasa de {gs(t.precio)} a {gs(f.v.precio)} desde ahora. Solo afecta a presupuestos nuevos.</p>}
        <Area className="sm:col-span-2" etiqueta="Descripción" maxLength={2000} filas={2} valor={f.v.descripcion} onCambio={(x) => f.set('descripcion', x)} />
        <Area etiqueta="Inclusiones (una por línea)" filas={5} valor={f.v.inclusiones} onCambio={(x) => f.set('inclusiones', x)} />
        <Area etiqueta="Exclusiones (una por línea)" filas={5} valor={f.v.exclusiones} onCambio={(x) => f.set('exclusiones', x)} />
        <Area className="sm:col-span-2" etiqueta="Checklist del taller (una tarea por línea)" filas={4} ayuda="Se copia a cada orden nueva de este servicio." valor={f.v.checklist} onCambio={(x) => f.set('checklist', x)} />
        <Area className="sm:col-span-2" etiqueta="Condiciones del servicio" filas={2} maxLength={2000} valor={f.v.condiciones} onCambio={(x) => f.set('condiciones', x)} />
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-deep sm:col-span-2"><input type="checkbox" className="size-5 accent-[#0a7d5c]" checked={f.v.activo} onChange={(e) => f.set('activo', e.target.checked)} />Activo (se puede elegir en presupuestos y órdenes nuevas)</label>
      </form>
      {historial.length > 0 && (
        <details className="mt-5 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-bold text-deep">Historial de tarifas ({historial.length})</summary>
          <ul className="mt-2 space-y-1 text-sm">{historial.map((h) => <li key={h.id} className="flex justify-between gap-3"><span className="text-muted">{fechaHora(h.vigente_desde)} → {h.vigente_hasta ? fechaHora(h.vigente_hasta) : 'vigente'}</span><b>{gs(h.precio)}</b></li>)}</ul>
        </details>
      )}
    </Modal>
  );
}

// ───────────── Configuración general ─────────────
function BloqueConfig({ titulo, esAdmin, guardando, onGuardar, sucio, children }: { titulo: string; esAdmin: boolean; guardando: boolean; onGuardar: () => void; sucio: boolean; children: React.ReactNode }) {
  return (
    <Seccion titulo={titulo}>
      <form onSubmit={(e) => { e.preventDefault(); onGuardar(); }}>
        <fieldset disabled={!esAdmin} className="grid gap-4 sm:grid-cols-2">{children}</fieldset>
        {esAdmin && <div className="mt-4 flex items-center gap-3"><Boton type="submit" cargando={guardando} disabled={!sucio}>Guardar cambios</Boton>{sucio && <span className="text-xs font-semibold text-warn">Hay cambios sin guardar</span>}</div>}
      </form>
    </Seccion>
  );
}
type P = { c: Config; esAdmin: boolean };
function Negocio({ c, esAdmin }: P) {
  const v = c.negocio.valor;
  const f = useForm({ nombre: String(v.nombre ?? ''), telefono: String(v.telefono ?? ''), email: String(v.email ?? ''), direccion: String(v.direccion ?? ''), redes: String(v.redes ?? '') });
  const ok = useAccion(() => api.guardarConfig({ clave: 'negocio', valor: f.v, version: c.negocio.version }), 'Datos del negocio guardados.');
  return (
    <BloqueConfig titulo="Datos del negocio" esAdmin={esAdmin} guardando={ok.isPending} onGuardar={() => ok.mutate(undefined)} sucio={f.sucio}>
      <Texto etiqueta="Nombre comercial" required maxLength={80} valor={f.v.nombre} onCambio={(x) => f.set('nombre', x)} />
      <Texto etiqueta="Teléfono de contacto" type="tel" valor={f.v.telefono} onCambio={(x) => f.set('telefono', x)} />
      <Texto etiqueta="Correo" type="email" valor={f.v.email} onCambio={(x) => f.set('email', x)} />
      <Texto etiqueta="Redes" placeholder="@zenix" valor={f.v.redes} onCambio={(x) => f.set('redes', x)} />
      <Texto className="sm:col-span-2" etiqueta="Dirección" valor={f.v.direccion} onCambio={(x) => f.set('direccion', x)} />
      <p className="text-xs text-muted sm:col-span-2">El logo incluido es el archivo de Zenix que nos pasaron. Cambiarlo desde esta pantalla se suma junto con las plantillas de documentos (fase 2).</p>
    </BloqueConfig>
  );
}
function Comercial({ c, esAdmin }: P) {
  const v = c.comercial.valor; const r = c.reparto.valor;
  const f = useForm({ vigencia_dias: String(v.vigencia_dias ?? 7), anticipo_pct: String(v.anticipo_pct ?? 0), condiciones: String(v.condiciones ?? '') });
  const g = useForm({ socio1_pct: String(r.socio1_pct ?? 50), reserva_pct: String(r.reserva_pct ?? 0) });
  const ok = useAccion(() => api.guardarConfig({ clave: 'comercial', valor: { vigencia_dias: Number(f.v.vigencia_dias), anticipo_pct: Number(f.v.anticipo_pct), condiciones: f.v.condiciones }, version: c.comercial.version }), 'Condiciones comerciales guardadas.');
  const s1 = Math.max(0, Math.min(100, Number(g.v.socio1_pct) || 0));
  const ok2 = useAccion(() => api.guardarConfig({ clave: 'reparto', valor: { socio1_pct: s1, socio2_pct: 100 - s1, reserva_pct: Number(g.v.reserva_pct) || 0 }, version: c.reparto.version }), 'Reparto guardado.');
  return (
    <div className="space-y-5">
      <BloqueConfig titulo="Condiciones comerciales" esAdmin={esAdmin} guardando={ok.isPending} onGuardar={() => ok.mutate(undefined)} sucio={f.sucio}>
        <Texto etiqueta="Vigencia de presupuestos (días)" type="number" inputMode="numeric" min={1} max={365} valor={f.v.vigencia_dias} onCambio={(x) => f.set('vigencia_dias', x)} />
        <Texto etiqueta="Anticipo sugerido (%)" type="number" inputMode="numeric" min={0} max={100} ayuda="Referencia para ustedes; el anticipo de cada presupuesto se escribe a mano." valor={f.v.anticipo_pct} onCambio={(x) => f.set('anticipo_pct', x)} />
        <Area className="sm:col-span-2" etiqueta="Condiciones que se copian a cada presupuesto nuevo" filas={4} maxLength={4000} valor={f.v.condiciones} onCambio={(x) => f.set('condiciones', x)} />
      </BloqueConfig>
      <BloqueConfig titulo="Reparto entre socios y reserva" esAdmin={esAdmin} guardando={ok2.isPending} onGuardar={() => ok2.mutate(undefined)} sucio={g.sucio}>
        <Texto etiqueta="Socio 1 (%)" type="number" inputMode="numeric" min={0} max={100} valor={g.v.socio1_pct} onCambio={(x) => g.set('socio1_pct', x)} ayuda={`Socio 2: ${100 - s1} %`} />
        <Texto etiqueta="Reserva del negocio (%)" type="number" inputMode="numeric" min={0} max={100} valor={g.v.reserva_pct} onCambio={(x) => g.set('reserva_pct', x)} />
        <p className="text-xs text-muted sm:col-span-2">Estos porcentajes quedan guardados, pero el cálculo de "disponible para repartir" todavía no existe: llega con Finanzas completas en la fase 2.</p>
      </BloqueConfig>
    </div>
  );
}
function Plantillas({ c, esAdmin }: P) {
  const v = c.plantillas.valor;
  const f = useForm({ whatsapp_presupuesto: String(v.whatsapp_presupuesto ?? ''), whatsapp_listo: String(v.whatsapp_listo ?? '') });
  const ok = useAccion(() => api.guardarConfig({ clave: 'plantillas', valor: f.v, version: c.plantillas.version }), 'Plantillas guardadas.');
  return (
    <BloqueConfig titulo="Mensajes de WhatsApp" esAdmin={esAdmin} guardando={ok.isPending} onGuardar={() => ok.mutate(undefined)} sucio={f.sucio}>
      <Area className="sm:col-span-2" etiqueta="Presupuesto" filas={9} ayuda="Variables: {cliente} {numero} {negocio} {detalle} {total} {vigencia} {condiciones}" valor={f.v.whatsapp_presupuesto} onCambio={(x) => f.set('whatsapp_presupuesto', x)} />
      <Area className="sm:col-span-2" etiqueta="Equipo listo" filas={4} ayuda="Variables: {cliente} {orden} {saldo} {negocio}" valor={f.v.whatsapp_listo} onCambio={(x) => f.set('whatsapp_listo', x)} />
      <p className="text-xs text-muted sm:col-span-2">Los mensajes nunca se envían solos: Zenix abre WhatsApp con el texto y el socio lo revisa y envía. Las plantillas de documentos PDF llegan con la fase 2.</p>
    </BloqueConfig>
  );
}

// ───────────── Socios y roles ─────────────
function Socios({ esAdmin }: { esAdmin: boolean }) {
  const q = useSocios();
  const { perfil, recargarPerfil } = useAuth();
  const [edit, setEdit] = useState<Perfil | null>(null);
  if (q.isLoading) return <Cargando />;
  if (q.error) return <ErrorCarga error={q.error} />;
  return (
    <div className="space-y-5">
      <Seccion titulo="Socios" icono={ShieldCheck}>
        <ul className="divide-y divide-line">
          {(q.data ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3">
              <span><b className="text-deep">{s.nombre}</b>{s.id === perfil?.id && <span className="text-sm text-muted"> (vos)</span>}<span className="mt-1 flex gap-2"><Insignia tono={s.rol === 'admin' ? 'verde' : 'azul'}>{ROLES[s.rol]}</Insignia>{!s.activo && <Insignia tono="rojo">Sin acceso</Insignia>}</span></span>
              {esAdmin && <Boton chico variante="secundario" icono={Pencil} onClick={() => setEdit(s)}>Editar</Boton>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Las cuentas nuevas no se crean desde acá (el registro público está deshabilitado): se dan de alta en el panel de Supabase siguiendo docs/DESPLIEGUE.md.</p>
      </Seccion>
      <Seccion titulo="Qué puede hacer cada rol">
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div><p className="font-bold text-deep">Administrador</p><ul className="mt-1 list-disc space-y-1 pl-5"><li>Todo lo del Socio operador.</li><li>Modificar ajustes, catálogo y tarifas.</li><li>Cambiar nombres, roles y accesos.</li><li>Anular cobros y gastos.</li><li>Reabrir órdenes entregadas o canceladas.</li><li>Exportar datos y manejar la demostración.</li></ul></div>
          <div><p className="font-bold text-deep">Socio operador</p><ul className="mt-1 list-disc space-y-1 pl-5"><li>Clientes, equipos y consultas.</li><li>Presupuestos: crear, versionar, aprobar y convertir.</li><li>Órdenes: estados, checklist, fotos y adicionales.</li><li>Registrar cobros y gastos.</li><li>Ideas de contenido.</li><li>Consultar (sin modificar) los ajustes.</li></ul></div>
        </div>
        <p className="mt-3 text-xs text-muted">Los dos socios pueden ser Administradores. Siempre debe quedar al menos uno activo. Los permisos se verifican en el servidor, no solo en la pantalla.</p>
      </Seccion>
      {edit && <SocioModal s={edit} onCerrar={() => { setEdit(null); void recargarPerfil(); }} />}
    </div>
  );
}
function SocioModal({ s, onCerrar }: { s: Perfil; onCerrar: () => void }) {
  const f = useForm({ nombre: s.nombre, rol: s.rol, activo: s.activo });
  const ok = useAccion(() => api.guardarSocio({ id: s.id, ...f.v, version: s.version }), 'Socio actualizado.');
  return (
    <Modal titulo="Editar socio" abierto onCerrar={onCerrar} sucio={f.sucio} pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton cargando={ok.isPending} disabled={!f.v.nombre.trim()} onClick={() => { if (!f.v.activo && !window.confirm(`${s.nombre} va a perder el acceso al sistema. ¿Continuar?`)) return; ok.mutate(undefined, { onSuccess: onCerrar }); }}>Guardar</Boton></>}>
      <div className="grid gap-4">
        <Texto etiqueta="Nombre" required maxLength={80} valor={f.v.nombre} onCambio={(x) => f.set('nombre', x)} />
        <Selector etiqueta="Rol" opciones={ROLES} valor={f.v.rol} onCambio={(x) => f.set('rol', x as Perfil['rol'])} />
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-deep"><input type="checkbox" className="size-5 accent-[#0a7d5c]" checked={f.v.activo} onChange={(e) => f.set('activo', e.target.checked)} />Con acceso al sistema</label>
      </div>
    </Modal>
  );
}

// ───────────── Datos: exportación y demostración ─────────────
function Datos({ esAdmin }: { esAdmin: boolean }) {
  const avisos = useAvisos();
  const hayDemo = useHayDemo().data;
  const [bajando, setBajando] = useState<string | null>(null);
  const cargar = useAccion(api.demoCargar, 'Datos de demostración cargados (marcados como DEMO).');
  const borrar = useAccion(api.demoBorrar, 'Datos de demostración borrados.');
  const exportar = async (formato: 'json' | string) => {
    setBajando(formato);
    try {
      const d = await api.exportar();
      const sello = hoyISO();
      if (formato === 'json') descargar(`zenix-exportacion-${sello}.json`, JSON.stringify(d, null, 2), 'application/json');
      else if (!d.tablas[formato]?.length) { avisos.error(`La tabla "${formato}" está vacía: no hay nada para exportar.`); return; }
      else descargar(`zenix-${formato}-${sello}.csv`, aCSV(d.tablas[formato]), 'text/csv;charset=utf-8');
      avisos.ok('Exportación descargada. Guardala en un lugar seguro: contiene datos privados.');
    } catch (e) { avisos.error(mensajeError(e, 'No se pudo generar la exportación.')); } finally { setBajando(null); }
  };
  if (!esAdmin) return <Seccion titulo="Datos" icono={Database}><p className="text-sm text-muted">La exportación y los datos de demostración están reservados al Administrador.</p></Seccion>;
  return (
    <div className="space-y-5">
      <Seccion titulo="Exportación" icono={Download}>
        <p className="mb-3 text-sm text-muted">El plan gratuito de Supabase no hace copias automáticas. Descargá la exportación completa al menos una vez por semana y guardala fuera del sistema. Para una copia restaurable completa, seguí docs/COPIAS-Y-RECUPERACION.md.</p>
        <div className="flex flex-wrap gap-2">
          <Boton icono={Download} cargando={bajando === 'json'} onClick={() => void exportar('json')}>Todo (JSON)</Boton>
          {['clientes', 'ordenes', 'movimientos', 'presupuestos', 'ideas'].map((t) => <Boton key={t} variante="secundario" icono={Download} cargando={bajando === t} onClick={() => void exportar(t)}>{t[0].toUpperCase() + t.slice(1)} (CSV)</Boton>)}
        </div>
        <p className="mt-3 text-xs text-muted">Las fotos del almacenamiento no viajan en esta exportación: figuran por su ruta. La copia y restauración completas con manifiesto de archivos llegan con la fase 3.</p>
      </Seccion>
      <Seccion titulo="Datos de demostración" icono={Database}>
        <p className="mb-3 text-sm text-muted">Sirven para probar el sistema sin tocar datos reales. Se crean marcados como DEMO y se borran todos juntos. No uses clientes demo para trabajos reales.</p>
        {hayDemo
          ? <Boton variante="peligro" icono={Trash2} cargando={borrar.isPending} onClick={() => { if (window.confirm('¿Borrar todos los datos de demostración? Los datos reales no se tocan.')) borrar.mutate(undefined); }}>Borrar datos de demostración</Boton>
          : <Boton variante="secundario" icono={Plus} cargando={cargar.isPending} onClick={() => cargar.mutate(undefined)}>Cargar datos de demostración</Boton>}
      </Seccion>
    </div>
  );
}

// ───────────── Mi cuenta ─────────────
function Cuenta() {
  const avisos = useAvisos();
  const { sesion } = useAuth();
  const [clave, setClave] = useState(''); const [repetir, setRepetir] = useState(''); const [ocupado, setOcupado] = useState(false);
  const corta = clave.length > 0 && clave.length < 10; const distinta = repetir.length > 0 && clave !== repetir;
  const cambiar = async (e: React.FormEvent) => {
    e.preventDefault(); setOcupado(true);
    const { error } = await supabase.auth.updateUser({ password: clave });
    setOcupado(false);
    if (error) avisos.error(/same|different/i.test(error.message) ? 'La contraseña nueva debe ser distinta de la actual.' : /weak|least|characters/i.test(error.message) ? 'La contraseña es demasiado débil.' : mensajeError(error, 'No se pudo cambiar la contraseña.'));
    else { setClave(''); setRepetir(''); avisos.ok('Contraseña actualizada.'); }
  };
  return (
    <div className="space-y-5">
      <Seccion titulo="Cambiar mi contraseña" icono={KeyRound}>
        <form onSubmit={cambiar} className="grid max-w-md gap-4">
          <p className="text-sm text-muted">Sesión iniciada como <b>{sesion?.user.email}</b>.</p>
          <Texto etiqueta="Contraseña nueva" type="password" autoComplete="new-password" minLength={10} valor={clave} onCambio={setClave} error={corta ? 'Usá al menos 10 caracteres.' : null} />
          <Texto etiqueta="Repetir contraseña" type="password" autoComplete="new-password" valor={repetir} onCambio={setRepetir} error={distinta ? 'No coincide.' : null} />
          <Boton type="submit" cargando={ocupado} disabled={clave.length < 10 || clave !== repetir} className="w-fit">Actualizar contraseña</Boton>
        </form>
      </Seccion>
      <Seccion titulo="Sesiones" icono={Lock}>
        <p className="mb-3 text-sm text-muted">Si perdiste un dispositivo o dejaste la sesión abierta en otro lado, cerrá todas las sesiones. Vas a tener que volver a ingresar en cada equipo.</p>
        <Boton variante="peligro" onClick={() => { if (window.confirm('¿Cerrar tu sesión en todos los dispositivos?')) void supabase.auth.signOut({ scope: 'global' }); }}>Cerrar sesión en todos los dispositivos</Boton>
      </Seccion>
    </div>
  );
}
