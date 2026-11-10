// Textos visibles de cada estado/opción. Los estados se muestran siempre con texto e ícono, no solo con color.
export type Tono = 'neutro' | 'verde' | 'ambar' | 'azul' | 'rojo';
export const ESTADOS_ORDEN = ['recepcion', 'diagnostico', 'esperando_aprobacion', 'en_mantenimiento', 'pruebas', 'listo', 'entregado'] as const;
export const ORDEN: Record<string, { t: string; tono: Tono }> = {
  recepcion: { t: 'Recepción', tono: 'azul' }, diagnostico: { t: 'Diagnóstico', tono: 'azul' },
  esperando_aprobacion: { t: 'Esperando aprobación', tono: 'ambar' }, en_mantenimiento: { t: 'En mantenimiento', tono: 'verde' },
  pruebas: { t: 'Pruebas', tono: 'verde' }, listo: { t: 'Listo', tono: 'verde' }, entregado: { t: 'Entregado', tono: 'neutro' },
  en_espera: { t: 'En espera', tono: 'ambar' }, cancelado: { t: 'Cancelado', tono: 'rojo' },
};
export const CONSULTA: Record<string, { t: string; tono: Tono }> = {
  consulta: { t: 'Consulta', tono: 'ambar' }, presupuesto_enviado: { t: 'Presupuesto enviado', tono: 'azul' },
  aprobado: { t: 'Aprobado', tono: 'verde' }, convertido: { t: 'Convertido en trabajo', tono: 'neutro' },
  rechazado: { t: 'Rechazado', tono: 'rojo' }, cancelado: { t: 'Cancelado', tono: 'rojo' },
};
export const PRESUPUESTO: Record<string, { t: string; tono: Tono }> = {
  borrador: { t: 'Borrador', tono: 'neutro' }, enviado: { t: 'Enviado', tono: 'azul' }, aprobado: { t: 'Aprobado', tono: 'verde' },
  convertido: { t: 'Convertido en orden', tono: 'neutro' }, rechazado: { t: 'Rechazado', tono: 'rojo' }, cancelado: { t: 'Cancelado', tono: 'rojo' },
};
export const IDEA: Record<string, { t: string; tono: Tono }> = {
  idea: { t: 'Idea', tono: 'ambar' }, en_preparacion: { t: 'En preparación', tono: 'azul' }, en_diseno: { t: 'En diseño o grabación', tono: 'azul' },
  en_revision: { t: 'En revisión', tono: 'ambar' }, listo: { t: 'Listo', tono: 'verde' }, publicado: { t: 'Publicado', tono: 'neutro' }, descartada: { t: 'Descartada', tono: 'rojo' },
};
export const CANALES_ORIGEN: Record<string, string> = { instagram: 'Instagram', whatsapp: 'WhatsApp', facebook: 'Facebook', tiktok: 'TikTok', recomendacion: 'Recomendación', local: 'Pasó por el local', otro: 'Otro' };
export const TIPOS_EQUIPO: Record<string, string> = { laptop: 'Laptop', pc: 'PC', tarjeta_grafica: 'Tarjeta gráfica', celular: 'Celular', otro: 'Otro' };
export const MEDIOS_PAGO: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', billetera: 'Billetera', otro: 'Otro' };
export const CATEGORIAS_GASTO: Record<string, string> = { insumos: 'Insumos', repuestos: 'Repuestos', traslado: 'Traslado', envio: 'Envío', herramientas: 'Herramientas', servicios: 'Servicios', otro: 'Otro' };
export const MEDIOS_APROBACION: Record<string, string> = { whatsapp: 'WhatsApp', llamada: 'Llamada', presencial: 'En persona', correo: 'Correo', otro: 'Otro' };
export const CANALES_CONTENIDO: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', whatsapp: 'WhatsApp', otro: 'Otro' };
export const FORMATOS: Record<string, string> = { reel: 'Reel', flyer: 'Flyer', carrusel: 'Carrusel', historia: 'Historia', video: 'Video', otro: 'Otro' };
export const PRIORIDADES: Record<string, string> = { baja: 'Baja', media: 'Media', alta: 'Alta' };
export const ROLES: Record<string, string> = { admin: 'Administrador', operador: 'Socio operador' };
export const equipoTexto = (e: { tipo?: string; equipo_tipo?: string; marca?: string | null; modelo?: string | null; equipo_marca?: string | null; equipo_modelo?: string | null }) =>
  [TIPOS_EQUIPO[e.tipo ?? e.equipo_tipo ?? ''] ?? 'Equipo', e.marca ?? e.equipo_marca, e.modelo ?? e.equipo_modelo].filter(Boolean).join(' · ');
