import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, guardarFila, nuevaClave, tarifaVigente, useAccion, useClientes, useOrdenes, useServicios, useSocios } from './lib/api';
import { useAuth } from './auth';
import { CANALES_CONTENIDO, CANALES_ORIGEN, CATEGORIAS_GASTO, CONSULTA, FORMATOS, IDEA, MEDIOS_PAGO, PRIORIDADES, TIPOS_EQUIPO } from './lib/etiquetas';
import { gs, hoyISO, nOrden, vacioANull } from './lib/format';
import type { Cliente, Concepto, Consulta, Equipo, Idea, Movimiento, OrdenResumen, Servicio } from './lib/types';
import { Area, Boton, Importe, Modal, Selector, Texto } from './ui';

export function useForm<T extends object>(inicial: T) {
  const [v, setV] = useState(inicial);
  const [base] = useState(() => JSON.stringify(inicial));
  const set = <K extends keyof T>(k: K, val: T[K]) => setV((a) => ({ ...a, [k]: val }));
  return { v, set, setV, sucio: JSON.stringify(v) !== base };
}
const Pie = ({ onCerrar, cargando, texto = 'Guardar', deshabilitado }: { onCerrar: () => void; cargando: boolean; texto?: string; deshabilitado?: boolean }) => (
  <><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton type="submit" form="f" cargando={cargando} disabled={deshabilitado}>{texto}</Boton></>
);
const TEL = /^[0-9+() -]{6,25}$/;

// ───────────── Cliente ─────────────
export function ClienteModal({ cliente, onCerrar, alGuardar }: { cliente?: Cliente | null; onCerrar: () => void; alGuardar?: (c: Cliente) => void }) {
  const f = useForm({ nombre: cliente?.nombre ?? '', telefono: cliente?.telefono ?? '', email: cliente?.email ?? '', direccion: cliente?.direccion ?? '', canal_origen: cliente?.canal_origen ?? '', observaciones: cliente?.observaciones ?? '' });
  const [tocado, setTocado] = useState(false);
  const errTel = f.v.telefono.trim() && !TEL.test(f.v.telefono.trim()) ? 'Usá solo números, espacios, + o guiones (mínimo 6 dígitos).' : null;
  const errMail = f.v.email.trim() && !/^\S+@\S+\.\S+$/.test(f.v.email.trim()) ? 'El correo no parece válido.' : null;
  const errNombre = !f.v.nombre.trim() ? 'El nombre es obligatorio.' : null;
  const guardar = useAccion(() => guardarFila<Cliente>('clientes', { nombre: f.v.nombre.trim(), telefono: vacioANull(f.v.telefono), email: vacioANull(f.v.email), direccion: vacioANull(f.v.direccion), canal_origen: vacioANull(f.v.canal_origen), observaciones: vacioANull(f.v.observaciones) }, cliente), cliente ? 'Cliente actualizado.' : 'Cliente guardado.');
  const enviar = (e: React.FormEvent) => { e.preventDefault(); setTocado(true); if (errNombre || errTel || errMail) return; guardar.mutate(undefined, { onSuccess: (c) => { alGuardar?.(c); onCerrar(); } }); };
  return (
    <Modal titulo={cliente ? 'Editar cliente' : 'Nuevo cliente'} abierto onCerrar={onCerrar} sucio={f.sucio} pie={<Pie onCerrar={onCerrar} cargando={guardar.isPending} />}>
      <form id="f" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Texto className="sm:col-span-2" etiqueta="Nombre" required maxLength={120} valor={f.v.nombre} onCambio={(x) => f.set('nombre', x)} error={tocado ? errNombre : null} />
        <Texto etiqueta="Teléfono" type="tel" inputMode="tel" placeholder="0981 123 456" valor={f.v.telefono} onCambio={(x) => f.set('telefono', x)} error={errTel} />
        <Selector etiqueta="Canal de origen" vacio="Sin indicar" opciones={CANALES_ORIGEN} valor={f.v.canal_origen} onCambio={(x) => f.set('canal_origen', x)} />
        <Texto etiqueta="Correo (opcional)" type="email" valor={f.v.email} onCambio={(x) => f.set('email', x)} error={errMail} />
        <Texto etiqueta="Dirección (opcional)" maxLength={300} valor={f.v.direccion} onCambio={(x) => f.set('direccion', x)} />
        <Area className="sm:col-span-2" etiqueta="Observaciones" maxLength={2000} valor={f.v.observaciones} onCambio={(x) => f.set('observaciones', x)} />
      </form>
    </Modal>
  );
}

// ───────────── Equipo ─────────────
export function EquipoModal({ clienteId, equipo, onCerrar, alGuardar }: { clienteId: string; equipo?: Equipo | null; onCerrar: () => void; alGuardar?: (e: Equipo) => void }) {
  const f = useForm({ tipo: equipo?.tipo ?? 'laptop', marca: equipo?.marca ?? '', modelo: equipo?.modelo ?? '', serie: equipo?.serie ?? '', notas: equipo?.notas ?? '' });
  const guardar = useAccion(() => guardarFila<Equipo>('equipos', { ...(equipo ? {} : { cliente_id: clienteId }), tipo: f.v.tipo, marca: vacioANull(f.v.marca), modelo: vacioANull(f.v.modelo), serie: vacioANull(f.v.serie), notas: vacioANull(f.v.notas) }, equipo), 'Equipo guardado.');
  return (
    <Modal titulo={equipo ? 'Editar equipo' : 'Nuevo equipo'} abierto onCerrar={onCerrar} sucio={f.sucio} pie={<Pie onCerrar={onCerrar} cargando={guardar.isPending} />}>
      <form id="f" onSubmit={(e) => { e.preventDefault(); guardar.mutate(undefined, { onSuccess: (x) => { alGuardar?.(x); onCerrar(); } }); }} className="grid gap-4 sm:grid-cols-2">
        <Selector etiqueta="Tipo" required opciones={TIPOS_EQUIPO} valor={f.v.tipo} onCambio={(x) => f.set('tipo', x)} />
        <Texto etiqueta="Marca" maxLength={80} valor={f.v.marca} onCambio={(x) => f.set('marca', x)} />
        <Texto etiqueta="Modelo" maxLength={120} valor={f.v.modelo} onCambio={(x) => f.set('modelo', x)} />
        <Texto etiqueta="N.º de serie (opcional)" maxLength={80} valor={f.v.serie} onCambio={(x) => f.set('serie', x)} />
        <Area className="sm:col-span-2" etiqueta="Notas" maxLength={1000} ayuda="No anotes acá contraseñas ni PIN del equipo." valor={f.v.notas} onCambio={(x) => f.set('notas', x)} />
      </form>
    </Modal>
  );
}

// ───────────── Consulta (permite cargar el cliente en el mismo paso) ─────────────
export function ConsultaModal({ consulta, clienteId, onCerrar }: { consulta?: Consulta | null; clienteId?: string; onCerrar: () => void }) {
  const { perfil } = useAuth();
  const clientes = useClientes().data ?? [];
  const servicios = (useServicios().data ?? []).filter((s) => s.activo || s.id === consulta?.servicio_id);
  const socios = (useSocios().data ?? []).filter((s) => s.activo);
  const f = useForm({ cliente_id: consulta?.cliente_id ?? clienteId ?? '', nuevoNombre: '', nuevoTel: '', servicio_id: consulta?.servicio_id ?? '', detalle: consulta?.detalle ?? '', responsable_id: consulta?.responsable_id ?? perfil?.id ?? '', estado: consulta?.estado ?? 'consulta', proxima_actividad: consulta?.proxima_actividad ?? '', fecha_seguimiento: consulta?.fecha_seguimiento ?? '', motivo_cierre: consulta?.motivo_cierre ?? '' });
  const [tocado, setTocado] = useState(false);
  const esNuevo = f.v.cliente_id === '__nuevo';
  const cierra = ['rechazado', 'cancelado'].includes(f.v.estado);
  const errores = {
    cliente: !f.v.cliente_id ? 'Elegí un cliente.' : esNuevo && !f.v.nuevoNombre.trim() ? 'Escribí el nombre del cliente.' : null,
    tel: esNuevo && f.v.nuevoTel.trim() && !TEL.test(f.v.nuevoTel.trim()) ? 'Teléfono inválido.' : null,
    detalle: !f.v.detalle.trim() ? 'Contá qué pidió el cliente.' : null,
    motivo: cierra && !f.v.motivo_cierre.trim() ? 'Indicá el motivo de cierre.' : null,
  };
  const guardar = useAccion(async () => {
    let cid = f.v.cliente_id;
    if (esNuevo) cid = (await guardarFila<Cliente>('clientes', { nombre: f.v.nuevoNombre.trim(), telefono: vacioANull(f.v.nuevoTel) })).id;
    return guardarFila<Consulta>('consultas', { ...(consulta ? {} : { cliente_id: cid }), servicio_id: vacioANull(f.v.servicio_id), detalle: f.v.detalle.trim(), responsable_id: vacioANull(f.v.responsable_id), estado: f.v.estado, proxima_actividad: vacioANull(f.v.proxima_actividad), fecha_seguimiento: vacioANull(f.v.fecha_seguimiento), motivo_cierre: cierra ? f.v.motivo_cierre.trim() : null }, consulta);
  }, consulta ? 'Consulta actualizada.' : 'Consulta guardada.');
  const enviar = (e: React.FormEvent) => { e.preventDefault(); setTocado(true); if (Object.values(errores).some(Boolean)) return; guardar.mutate(undefined, { onSuccess: onCerrar }); };
  return (
    <Modal titulo={consulta ? 'Editar consulta' : 'Nueva consulta'} abierto onCerrar={onCerrar} sucio={f.sucio} pie={<Pie onCerrar={onCerrar} cargando={guardar.isPending} />}>
      <form id="f" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2" noValidate>
        {!consulta && !clienteId && (
          <Selector className="sm:col-span-2" etiqueta="Cliente" required vacio="Elegí un cliente…" opciones={[['__nuevo', '＋ Cliente nuevo'], ...clientes.map((c): [string, string] => [c.id, c.nombre + (c.telefono ? ` · ${c.telefono}` : '')])]} valor={f.v.cliente_id} onCambio={(x) => f.set('cliente_id', x)} error={tocado && !esNuevo ? errores.cliente : null} />
        )}
        {esNuevo && <>
          <Texto etiqueta="Nombre del cliente" required maxLength={120} valor={f.v.nuevoNombre} onCambio={(x) => f.set('nuevoNombre', x)} error={tocado ? errores.cliente : null} />
          <Texto etiqueta="Teléfono" type="tel" inputMode="tel" valor={f.v.nuevoTel} onCambio={(x) => f.set('nuevoTel', x)} error={errores.tel} />
        </>}
        <Selector className="sm:col-span-2" etiqueta="Servicio o producto solicitado" vacio="Sin definir" opciones={servicios.map((s): [string, string] => [s.id, s.nombre])} valor={f.v.servicio_id} onCambio={(x) => f.set('servicio_id', x)} />
        <Area className="sm:col-span-2" etiqueta="Detalle" required maxLength={2000} valor={f.v.detalle} onCambio={(x) => f.set('detalle', x)} error={tocado ? errores.detalle : null} />
        <Selector etiqueta="Responsable" vacio="Sin asignar" opciones={socios.map((s): [string, string] => [s.id, s.nombre])} valor={f.v.responsable_id} onCambio={(x) => f.set('responsable_id', x)} />
        {consulta && <Selector etiqueta="Estado" opciones={Object.entries(CONSULTA).map(([k, x]): [string, string] => [k, x.t])} valor={f.v.estado} onCambio={(x) => f.set('estado', x)} />}
        <Texto etiqueta="Próxima actividad" maxLength={200} placeholder="Ej.: enviar presupuesto, retirar equipo" valor={f.v.proxima_actividad} onCambio={(x) => f.set('proxima_actividad', x)} />
        <Texto etiqueta="Fecha de seguimiento" type="date" valor={f.v.fecha_seguimiento} onCambio={(x) => f.set('fecha_seguimiento', x)} />
        {cierra && <Area className="sm:col-span-2" etiqueta="Motivo de cierre o pérdida" required maxLength={500} valor={f.v.motivo_cierre} onCambio={(x) => f.set('motivo_cierre', x)} error={tocado ? errores.motivo : null} />}
      </form>
    </Modal>
  );
}

// ───────────── Cobro o gasto (con clave anti-duplicado: reintentar no vuelve a cargarlo) ─────────────
export function MovimientoModal({ tipo: tipoInicial, orden, onCerrar }: { tipo: 'cobro' | 'gasto'; orden?: OrdenResumen | null; onCerrar: () => void }) {
  const [clave] = useState(nuevaClave); // una sola clave por formulario abierto
  const ordenes = (useOrdenes().data ?? []).filter((o) => o.saldo > 0 && o.estado !== 'cancelado');
  const f = useForm({ tipo: tipoInicial, monto: (orden ? orden.saldo : null) as number | null, fecha: hoyISO(), medio: 'efectivo', concepto: orden ? `Cobro orden ${nOrden(orden.numero)}` : '', categoria: '', comprobante: '', orden_id: orden?.id ?? '' });
  const [tocado, setTocado] = useState(false);
  const elegida = orden ?? ordenes.find((o) => o.id === f.v.orden_id) ?? null;
  const esCobro = f.v.tipo === 'cobro';
  const errores = {
    monto: !f.v.monto ? 'Ingresá un importe mayor que cero.' : esCobro && elegida && f.v.monto > elegida.saldo ? `Supera el saldo de la orden (${gs(elegida.saldo)}).` : null,
    concepto: !f.v.concepto.trim() ? 'Escribí el concepto.' : null,
    categoria: !esCobro && !f.v.categoria ? 'Elegí la categoría.' : null,
    fecha: !f.v.fecha || f.v.fecha > hoyISO() ? 'La fecha no puede ser futura.' : null,
  };
  const guardar = useAccion(() => api.registrarMovimiento({ clave, tipo: f.v.tipo, monto: f.v.monto!, fecha: f.v.fecha, medio: f.v.medio, concepto: f.v.concepto.trim(), categoria: esCobro ? null : f.v.categoria, ordenId: esCobro ? vacioANull(f.v.orden_id) : null, clienteId: null, comprobante: f.v.comprobante }),
    (m: Movimiento) => (m.duplicado ? 'Ese movimiento ya estaba registrado. No se duplicó.' : esCobro ? `Cobro de ${gs(m.monto)} registrado.` : `Gasto de ${gs(m.monto)} registrado.`));
  const enviar = (e: React.FormEvent) => { e.preventDefault(); setTocado(true); if (Object.values(errores).some(Boolean)) return; guardar.mutate(undefined, { onSuccess: onCerrar }); };
  return (
    <Modal titulo={orden ? `Registrar cobro · ${nOrden(orden.numero)}` : 'Registrar movimiento'} abierto onCerrar={onCerrar} sucio={f.sucio} pie={<Pie onCerrar={onCerrar} cargando={guardar.isPending} texto={esCobro ? 'Registrar cobro' : 'Registrar gasto'} />}>
      <form id="f" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2" noValidate>
        {!orden && <Selector etiqueta="Tipo" opciones={{ cobro: 'Cobro (entra dinero)', gasto: 'Gasto (sale dinero)' }} valor={f.v.tipo} onCambio={(x) => f.set('tipo', x as 'cobro' | 'gasto')} />}
        {!orden && esCobro && <Selector etiqueta="Orden (opcional)" vacio="Sin orden asociada" opciones={ordenes.map((o): [string, string] => [o.id, `${nOrden(o.numero)} · ${o.cliente_nombre} · saldo ${gs(o.saldo)}`])} valor={f.v.orden_id} onCambio={(x) => { const o = ordenes.find((y) => y.id === x); f.setV((a) => ({ ...a, orden_id: x, monto: o ? o.saldo : a.monto, concepto: o && !a.concepto ? `Cobro orden ${nOrden(o.numero)}` : a.concepto })); }} />}
        <Importe etiqueta="Importe" required valor={f.v.monto} onCambio={(x) => f.set('monto', x)} error={tocado ? errores.monto : null} ayuda={esCobro && elegida ? `Saldo de la orden: ${gs(elegida.saldo)}. Podés cobrar una parte.` : undefined} data-foco />
        <Texto etiqueta="Fecha" type="date" required max={hoyISO()} valor={f.v.fecha} onCambio={(x) => f.set('fecha', x)} error={tocado ? errores.fecha : null} />
        <Selector etiqueta="Medio" opciones={MEDIOS_PAGO} valor={f.v.medio} onCambio={(x) => f.set('medio', x)} />
        {!esCobro && <Selector etiqueta="Categoría" required vacio="Elegí…" opciones={CATEGORIAS_GASTO} valor={f.v.categoria} onCambio={(x) => f.set('categoria', x)} error={tocado ? errores.categoria : null} />}
        <Texto className="sm:col-span-2" etiqueta="Concepto" required maxLength={200} valor={f.v.concepto} onCambio={(x) => f.set('concepto', x)} error={tocado ? errores.concepto : null} />
        <Texto className="sm:col-span-2" etiqueta="Comprobante (opcional)" maxLength={80} placeholder="N.º de factura o referencia, si existe" ayuda="El movimiento se registra aunque no haya comprobante." valor={f.v.comprobante} onCambio={(x) => f.set('comprobante', x)} />
      </form>
    </Modal>
  );
}

// ───────────── Idea de contenido ─────────────
export function IdeaModal({ idea, onCerrar }: { idea?: Idea | null; onCerrar: () => void }) {
  const servicios = useServicios().data ?? [];
  const socios = (useSocios().data ?? []).filter((s) => s.activo);
  const f = useForm({ titulo: idea?.titulo ?? '', nota: idea?.nota ?? '', enlace: idea?.enlace ?? '', servicio_id: idea?.servicio_id ?? '', objetivo: idea?.objetivo ?? '', canal: idea?.canal ?? '', formato: idea?.formato ?? '', responsable_id: idea?.responsable_id ?? '', prioridad: idea?.prioridad ?? 'media', estado: idea?.estado ?? 'idea' });
  const [tocado, setTocado] = useState(false);
  const errEnlace = f.v.enlace.trim() && !/^https?:\/\/\S+$/.test(f.v.enlace.trim()) ? 'El enlace debe empezar con http:// o https://' : null;
  const guardar = useAccion(() => guardarFila<Idea>('ideas', { titulo: f.v.titulo.trim(), nota: vacioANull(f.v.nota), enlace: vacioANull(f.v.enlace), servicio_id: vacioANull(f.v.servicio_id), objetivo: vacioANull(f.v.objetivo), canal: vacioANull(f.v.canal), formato: vacioANull(f.v.formato), responsable_id: vacioANull(f.v.responsable_id), prioridad: f.v.prioridad, estado: f.v.estado }, idea), idea ? 'Idea actualizada.' : 'Idea guardada.');
  const enviar = (e: React.FormEvent) => { e.preventDefault(); setTocado(true); if (!f.v.titulo.trim() || errEnlace) return; guardar.mutate(undefined, { onSuccess: onCerrar }); };
  return (
    <Modal titulo={idea ? 'Editar idea' : 'Guardar idea'} abierto onCerrar={onCerrar} sucio={f.sucio} pie={<Pie onCerrar={onCerrar} cargando={guardar.isPending} texto={idea ? 'Guardar' : 'Guardar idea'} />}>
      <form id="f" onSubmit={enviar} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Texto className="sm:col-span-2" etiqueta="Título" required maxLength={160} placeholder="Ej.: ¿Tu laptop calienta?" valor={f.v.titulo} onCambio={(x) => f.set('titulo', x)} error={tocado && !f.v.titulo.trim() ? 'Poné un título corto.' : null} />
        <Area className="sm:col-span-2" etiqueta="Nota" maxLength={4000} valor={f.v.nota} onCambio={(x) => f.set('nota', x)} />
        <Texto className="sm:col-span-2" etiqueta="Enlace de referencia (opcional)" type="url" inputMode="url" placeholder="https://…" valor={f.v.enlace} onCambio={(x) => f.set('enlace', x)} error={errEnlace} />
        <Selector etiqueta="Formato" vacio="Sin definir" opciones={FORMATOS} valor={f.v.formato} onCambio={(x) => f.set('formato', x)} />
        <Selector etiqueta="Canal" vacio="Sin definir" opciones={CANALES_CONTENIDO} valor={f.v.canal} onCambio={(x) => f.set('canal', x)} />
        <Selector etiqueta="Servicio relacionado" vacio="Ninguno" opciones={servicios.map((s): [string, string] => [s.id, s.nombre])} valor={f.v.servicio_id} onCambio={(x) => f.set('servicio_id', x)} />
        <Texto etiqueta="Objetivo" maxLength={200} placeholder="Ej.: generar consultas" valor={f.v.objetivo} onCambio={(x) => f.set('objetivo', x)} />
        <Selector etiqueta="Responsable" vacio="Sin asignar" opciones={socios.map((s): [string, string] => [s.id, s.nombre])} valor={f.v.responsable_id} onCambio={(x) => f.set('responsable_id', x)} />
        <Selector etiqueta="Prioridad" opciones={PRIORIDADES} valor={f.v.prioridad} onCambio={(x) => f.set('prioridad', x)} />
        {idea && <Selector className="sm:col-span-2" etiqueta="Estado" opciones={Object.entries(IDEA).map(([k, x]): [string, string] => [k, x.t])} valor={f.v.estado} onCambio={(x) => f.set('estado', x)} />}
      </form>
    </Modal>
  );
}

// ───────────── Editor de conceptos (presupuestos y órdenes directas) ─────────────
export const conceptoVacio = (): Concepto => ({ servicio_id: null, descripcion: '', cantidad: 1, precio_unitario: null, descuento: 0 });
export const totalConceptos = (items: Concepto[]) => items.reduce((s, i) => s + i.cantidad * (i.precio_unitario ?? 0) - i.descuento, 0);
export const errorConceptos = (items: Concepto[]): string | null => {
  if (!items.length) return 'Agregá al menos un concepto.';
  for (const i of items) {
    if (!i.servicio_id && !i.descripcion.trim()) return 'Cada concepto libre necesita una descripción.';
    if (i.precio_unitario == null) return 'Falta el precio de un concepto. Los servicios "a cotizar" necesitan un importe acordado.';
    if (i.cantidad < 1 || i.cantidad > 999) return 'La cantidad debe estar entre 1 y 999.';
    if (i.descuento > i.cantidad * i.precio_unitario) return 'Un descuento supera el importe de su concepto.';
  }
  return null;
};
export function ConceptosEditor({ items, onCambio, servicios }: { items: Concepto[]; onCambio: (i: Concepto[]) => void; servicios: Servicio[] }) {
  const activos = useMemo(() => servicios.filter((s) => s.activo), [servicios]);
  const cambiar = (n: number, p: Partial<Concepto>) => onCambio(items.map((it, i) => (i === n ? { ...it, ...p } : it)));
  const elegir = (n: number, id: string) => {
    const s = activos.find((x) => x.id === id);
    cambiar(n, s ? { servicio_id: s.id, descripcion: s.nombre, precio_unitario: tarifaVigente(s)?.precio ?? null } : { servicio_id: null });
  };
  return (
    <div className="space-y-3">
      {items.map((it, n) => {
        const t = it.servicio_id ? tarifaVigente(servicios.find((s) => s.id === it.servicio_id) ?? ({ tarifas: [] } as unknown as Servicio)) : null;
        return (
          <fieldset key={n} className="rounded-2xl border border-line bg-mint/60 p-3">
            <legend className="sr-only">Concepto {n + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-6">
              <Selector className="sm:col-span-3" etiqueta="Servicio del catálogo" vacio="Concepto libre (repuesto u otro)" opciones={activos.map((s): [string, string] => [s.id, `${s.nombre} · ${gs(tarifaVigente(s)?.precio)}`])} valor={it.servicio_id ?? ''} onCambio={(x) => elegir(n, x)} />
              <Texto className="sm:col-span-3" etiqueta="Descripción" maxLength={300} valor={it.descripcion} onCambio={(x) => cambiar(n, { descripcion: x })} />
              <Texto className="sm:col-span-1" etiqueta="Cant." type="number" inputMode="numeric" min={1} max={999} valor={String(it.cantidad)} onCambio={(x) => cambiar(n, { cantidad: Math.max(1, Math.min(999, Number(x) || 1)) })} />
              <Importe className="sm:col-span-2" etiqueta="Precio unitario" valor={it.precio_unitario} onCambio={(x) => cambiar(n, { precio_unitario: x })} ayuda={t && t.precio == null ? 'Servicio a cotizar: ingresá el importe acordado.' : undefined} />
              <Importe className="sm:col-span-2" etiqueta="Descuento" valor={it.descuento || null} onCambio={(x) => cambiar(n, { descuento: x ?? 0 })} />
              <div className="flex items-end justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end">
                <span className="text-sm font-bold text-deep">{gs(it.cantidad * (it.precio_unitario ?? 0) - it.descuento)}</span>
                <Boton chico variante="peligro" icono={Trash2} aria-label={`Quitar concepto ${n + 1}`} onClick={() => onCambio(items.filter((_, i) => i !== n))} disabled={items.length === 1}>Quitar</Boton>
              </div>
            </div>
            {t && (t.inclusiones.length > 0 || t.exclusiones.length > 0) && (
              <p className="mt-2 text-xs text-muted">
                {t.inclusiones.length > 0 && <><b className="text-deep">Incluye:</b> {t.inclusiones.join(' · ')}. </>}
                {t.exclusiones.length > 0 && <><b className="text-deep">No incluye:</b> {t.exclusiones.join(' · ')}.</>}
              </p>
            )}
          </fieldset>
        );
      })}
      <Boton variante="suave" chico icono={Plus} onClick={() => onCambio([...items, conceptoVacio()])} disabled={items.length >= 50}>Agregar concepto</Boton>
    </div>
  );
}
