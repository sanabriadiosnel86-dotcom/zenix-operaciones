// Capa de datos: todo se lee y escribe en Supabase (PostgreSQL). No hay persistencia en localStorage.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BUCKET, supabase } from './supabase';
import { mensajeError, useAvisos } from '../ui';
import type { Adjunto, ChecklistItem, Cliente, Concepto, Config, Consulta, Equipo, Idea, Movimiento, Orden, OrdenEvento, OrdenItem, OrdenResumen, Pendiente, Perfil, Presupuesto, PresupuestoResumen, PresupuestoVersion, Servicio } from './types';

type Resp<T> = { data: T | null; error: unknown };
async function ok<T>(p: PromiseLike<Resp<T>>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}
const porPos = <T extends { posicion: number }>(a: T[]) => [...a].sort((x, y) => x.posicion - y.posicion);
export const nuevaClave = () => crypto.randomUUID();

// ───────────── Lecturas ─────────────
export const useSocios = () => useQuery({ queryKey: ['socios'], queryFn: () => ok<Perfil[]>(supabase.from('perfiles').select('id,nombre,rol,activo,version').order('nombre')), staleTime: 60_000 });
export const useNombreSocio = () => {
  const { data } = useSocios();
  return (id: string | null | undefined) => data?.find((s) => s.id === id)?.nombre ?? (id ? 'Socio' : 'Sin asignar');
};
export const useConfig = () => useQuery({
  queryKey: ['config'], staleTime: 60_000,
  queryFn: async () => Object.fromEntries((await ok<{ clave: string; valor: object; version: number }[]>(supabase.from('configuracion').select('clave,valor,version'))).map((f) => [f.clave, { valor: f.valor, version: f.version }])) as Config,
});
export const tarifaVigente = (s: Servicio) => s.tarifas.find((t) => t.vigente_hasta === null) ?? null;
export const useServicios = () => useQuery({
  queryKey: ['servicios'],
  queryFn: () => ok<Servicio[]>(supabase.from('servicios').select('id,nombre,tipo,descripcion,activo,version,tarifas:servicio_tarifas(*)').order('nombre')),
});
export const useClientes = () => useQuery({ queryKey: ['clientes'], queryFn: () => ok<Cliente[]>(supabase.from('clientes').select('*').eq('archivado', false).order('nombre').limit(1000)) });
export const useCliente = (id: string | undefined) => useQuery({
  queryKey: ['cliente', id], enabled: Boolean(id),
  queryFn: async () => {
    const [cliente, equipos, consultas, presupuestos, ordenes, movimientos] = await Promise.all([
      ok<Cliente>(supabase.from('clientes').select('*').eq('id', id!).single()),
      ok<Equipo[]>(supabase.from('equipos').select('*').eq('cliente_id', id!).order('created_at')),
      ok<Consulta[]>(supabase.from('consultas').select('*, servicio:servicios(nombre)').eq('cliente_id', id!).order('created_at', { ascending: false })),
      ok<PresupuestoResumen[]>(supabase.from('presupuestos_resumen').select('*').eq('cliente_id', id!).order('numero', { ascending: false })),
      ok<OrdenResumen[]>(supabase.from('ordenes_resumen').select('*').eq('cliente_id', id!).order('numero', { ascending: false })),
      ok<Movimiento[]>(supabase.from('movimientos').select('*').eq('cliente_id', id!).eq('tipo', 'cobro').order('fecha', { ascending: false })),
    ]);
    return { cliente, equipos, consultas, presupuestos, ordenes, movimientos };
  },
});
export const useEquipos = (clienteId: string | null) => useQuery({ queryKey: ['equipos', clienteId], enabled: Boolean(clienteId), queryFn: () => ok<Equipo[]>(supabase.from('equipos').select('*').eq('cliente_id', clienteId!).order('created_at')) });
export const useConsultas = () => useQuery({ queryKey: ['consultas'], queryFn: () => ok<Consulta[]>(supabase.from('consultas').select('*, cliente:clientes(id,nombre,telefono), servicio:servicios(nombre)').order('created_at', { ascending: false }).limit(500)) });
export const usePresupuestos = () => useQuery({ queryKey: ['presupuestos'], queryFn: () => ok<PresupuestoResumen[]>(supabase.from('presupuestos_resumen').select('*').order('numero', { ascending: false }).limit(500)) });
export const usePresupuesto = (id: string | undefined) => useQuery({
  queryKey: ['presupuesto', id], enabled: Boolean(id),
  queryFn: async () => {
    const [resumen, extra, versiones] = await Promise.all([
      ok<PresupuestoResumen>(supabase.from('presupuestos_resumen').select('*').eq('id', id!).single()),
      ok<Presupuesto>(supabase.from('presupuestos').select('id,aprobado_nota,aprobado_por,motivo_cierre').eq('id', id!).single()),
      ok<PresupuestoVersion[]>(supabase.from('presupuesto_versiones').select('*, items:presupuesto_items(*)').eq('presupuesto_id', id!).order('numero_version', { ascending: false })),
    ]);
    return { resumen, extra, versiones: versiones.map((v) => ({ ...v, items: porPos(v.items) })) };
  },
});
export const useOrdenes = () => useQuery({ queryKey: ['ordenes'], queryFn: () => ok<OrdenResumen[]>(supabase.from('ordenes_resumen').select('*').order('numero', { ascending: false }).limit(500)) });
export const useOrden = (id: string | undefined) => useQuery({
  queryKey: ['orden', id], enabled: Boolean(id),
  queryFn: async () => {
    const [orden, resumen, items, checklist, eventos, movimientos, adjuntos] = await Promise.all([
      ok<Orden>(supabase.from('ordenes').select('*').eq('id', id!).single()),
      ok<OrdenResumen>(supabase.from('ordenes_resumen').select('*').eq('id', id!).single()),
      ok<OrdenItem[]>(supabase.from('orden_items').select('*').eq('orden_id', id!)),
      ok<ChecklistItem[]>(supabase.from('orden_checklist').select('*').eq('orden_id', id!)),
      ok<OrdenEvento[]>(supabase.from('orden_eventos').select('*').eq('orden_id', id!).order('id', { ascending: false })),
      ok<Movimiento[]>(supabase.from('movimientos').select('*').eq('orden_id', id!).order('created_at', { ascending: false })),
      ok<Adjunto[]>(supabase.from('adjuntos').select('*').eq('entidad', 'orden').eq('entidad_id', id!).order('created_at')),
    ]);
    return { orden, resumen, items: porPos(items), checklist: porPos(checklist), eventos, movimientos, adjuntos };
  },
});
export const useMovimientos = (desde: string, hasta: string) => useQuery({
  queryKey: ['movimientos', desde, hasta],
  queryFn: () => ok<Movimiento[]>(supabase.from('movimientos').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(1000)),
});
export const useIdeas = () => useQuery({ queryKey: ['ideas'], queryFn: () => ok<Idea[]>(supabase.from('ideas').select('*').order('created_at', { ascending: false }).limit(500)) });
export const usePendientes = () => useQuery({ queryKey: ['pendientes'], queryFn: () => ok<Pendiente[]>(supabase.from('pendientes').select('*').order('fecha').limit(300)), refetchInterval: 120_000 });
export const useHayDemo = () => useQuery({ queryKey: ['hay-demo'], staleTime: 30_000, queryFn: async () => ((await supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('es_demo', true)).count ?? 0) > 0 });
export const useFirmadas = (adjuntos: Adjunto[] | undefined) => {
  const rutas = (adjuntos ?? []).filter((a) => a.origen === 'archivo').map((a) => a.storage_path!);
  return useQuery({
    queryKey: ['firmadas', rutas.join('|')], enabled: rutas.length > 0, staleTime: 30 * 60_000,
    queryFn: async () => Object.fromEntries(((await ok(supabase.storage.from(BUCKET).createSignedUrls(rutas, 3600))) ?? []).map((u) => [u.path ?? '', u.signedUrl])),
  });
};

// ───────────── Escrituras ─────────────
/** Ejecuta una operación; solo avisa "guardado" si el servidor confirmó. Ante error, muestra el motivo y no simula éxito. */
export function useAccion<A, R = unknown>(fn: (a: A) => Promise<R>, exito?: string | ((r: R) => string)) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  return useMutation({
    mutationFn: fn, retry: false,
    onSuccess: async (r) => { await qc.invalidateQueries(); if (exito) avisos.ok(typeof exito === 'function' ? exito(r) : exito); },
    onError: (e) => { avisos.error(mensajeError(e)); if ((e as { code?: string }).code === 'ZX409') void qc.invalidateQueries(); },
  });
}
type ConVersion = { id: string; version: number };
/** Alta o edición simple. En edición envía la versión leída: si otro socio guardó antes, el servidor rechaza (ZX409). */
export const guardarFila = <T,>(tabla: 'clientes' | 'equipos' | 'consultas' | 'ideas', datos: Record<string, unknown>, existente?: ConVersion | null) =>
  existente
    ? ok<T>(supabase.from(tabla).update({ ...datos, version: existente.version }).eq('id', existente.id).select().single())
    : ok<T>(supabase.from(tabla).insert(datos).select().single());

export const api = {
  guardarServicio: (a: { id: string | null; nombre: string; tipo: string; descripcion: string; activo: boolean; precio: number | null; inclusiones: string[]; exclusiones: string[]; checklist: string[]; condiciones: string; version: number | null }) =>
    ok<string>(supabase.rpc('guardar_servicio', { p_id: a.id, p_nombre: a.nombre, p_tipo: a.tipo, p_descripcion: a.descripcion, p_activo: a.activo, p_precio: a.precio, p_inclusiones: a.inclusiones, p_exclusiones: a.exclusiones, p_checklist: a.checklist, p_condiciones: a.condiciones, p_version: a.version })),
  guardarPresupuesto: (a: { clave: string; presupuestoId: string | null; clienteId: string | null; consultaId: string | null; vigencia: string | null; anticipo: number; condiciones: string; notas: string; items: Concepto[]; version: number | null }) =>
    ok<string>(supabase.rpc('guardar_presupuesto', { p_clave: a.clave, p_presupuesto_id: a.presupuestoId, p_cliente_id: a.clienteId, p_consulta_id: a.consultaId, p_vigencia_hasta: a.vigencia, p_anticipo: a.anticipo, p_condiciones: a.condiciones, p_notas: a.notas, p_items: a.items, p_version: a.version })),
  marcarPresupuesto: (a: { id: string; estado: 'enviado' | 'rechazado' | 'cancelado'; motivo?: string; version: number }) =>
    ok(supabase.rpc('marcar_presupuesto', { p_id: a.id, p_estado: a.estado, p_motivo: a.motivo ?? null, p_version: a.version })),
  aprobarPresupuesto: (a: { id: string; medio: string; fecha: string | null; nota: string; version: number }) =>
    ok(supabase.rpc('aprobar_presupuesto', { p_id: a.id, p_medio: a.medio, p_fecha: a.fecha, p_nota: a.nota, p_version: a.version })),
  convertirPresupuesto: (a: { id: string; equipoId: string; responsableId: string | null; problema: string; condicion: string; accesorios: string; entrega: string | null }) =>
    ok<string>(supabase.rpc('convertir_presupuesto', { p_id: a.id, p_equipo_id: a.equipoId, p_responsable_id: a.responsableId, p_problema: a.problema, p_condicion: a.condicion, p_accesorios: a.accesorios, p_entrega_prevista: a.entrega })),
  crearOrden: (a: { clave: string; clienteId: string; equipoId: string; responsableId: string | null; problema: string; condicion: string; accesorios: string; entrega: string | null; items: Concepto[] }) =>
    ok<string>(supabase.rpc('crear_orden', { p_clave: a.clave, p_cliente_id: a.clienteId, p_equipo_id: a.equipoId, p_responsable_id: a.responsableId, p_problema: a.problema, p_condicion: a.condicion, p_accesorios: a.accesorios, p_entrega_prevista: a.entrega, p_items: a.items })),
  cambiarEstadoOrden: (a: { id: string; estado: string; motivo?: string; version: number }) =>
    ok(supabase.rpc('cambiar_estado_orden', { p_id: a.id, p_estado: a.estado, p_motivo: a.motivo ?? null, p_version: a.version })),
  editarOrden: (a: { id: string; version: number; datos: Record<string, unknown> }) =>
    ok<Orden>(supabase.from('ordenes').update({ ...a.datos, version: a.version }).eq('id', a.id).select().single()),
  agregarAdicional: (a: { clave: string; ordenId: string; descripcion: string; cantidad: number; precio: number; descuento: number; medio: string; nota: string }) =>
    ok<string>(supabase.rpc('agregar_adicional', { p_clave: a.clave, p_orden_id: a.ordenId, p_descripcion: a.descripcion, p_cantidad: a.cantidad, p_precio: a.precio, p_descuento: a.descuento, p_medio: a.medio, p_nota: a.nota })),
  marcarTarea: (a: { id: string; hecho: boolean }) => ok(supabase.from('orden_checklist').update({ hecho: a.hecho }).eq('id', a.id).select('id').single()),
  agregarTarea: (a: { ordenId: string; texto: string; posicion: number }) => ok(supabase.from('orden_checklist').insert({ orden_id: a.ordenId, texto: a.texto, posicion: a.posicion }).select('id').single()),
  registrarMovimiento: (a: { clave: string; tipo: 'cobro' | 'gasto'; monto: number; fecha: string; medio: string; concepto: string; categoria: string | null; ordenId: string | null; clienteId: string | null; comprobante: string }) =>
    ok<Movimiento>(supabase.rpc('registrar_movimiento', { p_clave: a.clave, p_tipo: a.tipo, p_monto: a.monto, p_fecha: a.fecha, p_medio: a.medio, p_concepto: a.concepto, p_categoria: a.categoria, p_orden_id: a.ordenId, p_cliente_id: a.clienteId, p_comprobante: a.comprobante })),
  anularMovimiento: (a: { id: string; motivo: string }) => ok(supabase.rpc('anular_movimiento', { p_id: a.id, p_motivo: a.motivo })),
  guardarConfig: (a: { clave: string; valor: object; version: number }) =>
    ok(supabase.from('configuracion').update({ valor: a.valor, version: a.version }).eq('clave', a.clave).select('clave').single()),
  guardarSocio: (a: { id: string; nombre: string; rol: string; activo: boolean; version: number }) =>
    ok(supabase.from('perfiles').update({ nombre: a.nombre, rol: a.rol, activo: a.activo, version: a.version }).eq('id', a.id).select('id').single()),
  exportar: () => ok<{ tablas: Record<string, Record<string, unknown>[]>; generado_en: string }>(supabase.rpc('exportar_datos')),
  demoCargar: () => ok(supabase.rpc('demo_cargar')),
  demoBorrar: () => ok(supabase.rpc('demo_borrar')),
  /** Sube una foto al bucket privado y registra el adjunto. Si el registro falla, borra el archivo para no dejar huérfanos. */
  subirFoto: async (a: { ordenId: string; etiqueta: string; archivo: File }) => {
    const blob = await reducirImagen(a.archivo);
    const ruta = `ordenes/${a.ordenId}/${crypto.randomUUID()}.jpg`;
    await ok(supabase.storage.from(BUCKET).upload(ruta, blob, { contentType: 'image/jpeg', upsert: false }));
    try {
      return await ok(supabase.from('adjuntos').insert({ entidad: 'orden', entidad_id: a.ordenId, etiqueta: a.etiqueta, origen: 'archivo', storage_path: ruta, nombre: a.archivo.name.slice(0, 200), mime: 'image/jpeg', tamano: blob.size }).select('id').single());
    } catch (e) { await supabase.storage.from(BUCKET).remove([ruta]); throw e; }
  },
  agregarEnlace: (a: { ordenId: string; etiqueta: string; enlace: string }) =>
    ok(supabase.from('adjuntos').insert({ entidad: 'orden', entidad_id: a.ordenId, etiqueta: a.etiqueta, origen: 'enlace', enlace: a.enlace }).select('id').single()),
  quitarAdjunto: async (a: Adjunto) => {
    await ok(supabase.from('adjuntos').delete().eq('id', a.id).select('id').single());
    if (a.storage_path) await supabase.storage.from(BUCKET).remove([a.storage_path]);
  },
};

/** Reduce la foto a 1600 px y JPEG para cuidar la cuota gratuita de almacenamiento (1 GB). */
async function reducirImagen(archivo: File): Promise<Blob> {
  if (!archivo.type.startsWith('image/')) throw { code: 'ZX422', message: 'Solo se pueden subir imágenes (JPG, PNG o WebP).' };
  if (archivo.size > 20 * 1024 * 1024) throw { code: 'ZX422', message: 'La imagen pesa más de 20 MB. Elegí una más liviana.' };
  const img = await createImageBitmap(archivo).catch(() => { throw { code: 'ZX422', message: 'No pudimos leer esa imagen.' }; });
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(img.width * escala); lienzo.height = Math.round(img.height * escala);
  lienzo.getContext('2d')!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, 'image/jpeg', 0.82));
  if (!blob || blob.size > 5 * 1024 * 1024) throw { code: 'ZX422', message: 'La imagen sigue pesando más de 5 MB después de reducirla.' };
  return blob;
}
