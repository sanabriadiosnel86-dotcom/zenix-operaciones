export const ZONA = 'America/Asuncion';
const nf = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

export const miles = (n: number) => nf.format(n);
export const gs = (n: number | null | undefined) => (n == null ? 'A cotizar' : `Gs. ${nf.format(n)}`);
export const soloDigitos = (s: string) => { const d = s.replace(/\D/g, ''); return d === '' ? null : Number(d.slice(0, 12)); };

/** Fecha de hoy en Paraguay como YYYY-MM-DD, sin depender de la zona del dispositivo. */
export const hoyISO = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d);
export const sumarDias = (iso: string, dias: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
};
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** Formatea una fecha de calendario (YYYY-MM-DD) sin corrimientos de zona horaria. */
export const fecha = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
};
export const fechaHora = (ts: string | null | undefined) =>
  ts ? new Intl.DateTimeFormat('es-PY', { timeZone: ZONA, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts)) : '—';
export const fechaRelativa = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const hoy = hoyISO();
  if (iso === hoy) return 'Hoy';
  if (iso === sumarDias(hoy, 1)) return 'Mañana';
  if (iso === sumarDias(hoy, -1)) return 'Ayer';
  return fecha(iso);
};
export const nOrden = (n: number) => `ZNX-${String(n).padStart(3, '0')}`;
export const nPresupuesto = (n: number) => `P-${String(n).padStart(3, '0')}`;
export const vacioANull = (s: string | null | undefined) => { const t = (s ?? '').trim(); return t === '' ? null : t; };

/** Enlace wa.me: el socio revisa y envía el mensaje manualmente desde WhatsApp. */
export const enlaceWhatsApp = (telefono: string | null | undefined, texto: string) => {
  let d = (telefono ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '595' + d.slice(1); // 0981… → 595981…
  else if (d.length === 9 && d.startsWith('9')) d = '595' + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
};
export const plantilla = (t: string, v: Record<string, string>) =>
  t.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k] : m)).replace(/\n{3,}/g, '\n\n').trim();

export const descargar = (nombre: string, contenido: string, tipo: string) => {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export const aCSV = (filas: Record<string, unknown>[]) => {
  if (!filas.length) return '';
  const cols = Object.keys(filas[0]);
  const celda = (v: unknown) => {
    let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // evita fórmulas al abrir en planillas
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [cols.join(','), ...filas.map((f) => cols.map((c) => celda(f[c])).join(','))].join('\r\n');
};
