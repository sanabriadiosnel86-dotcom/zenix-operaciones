import { describe, expect, it } from 'vitest';
import { aCSV, enlaceWhatsApp, fecha, gs, hoyISO, nOrden, plantilla, soloDigitos, sumarDias } from './format';

describe('formato', () => {
  it('guaraníes con separador de miles y sin decimales', () => {
    expect(gs(160000)).toBe('Gs. 160.000'); expect(gs(1450000)).toBe('Gs. 1.450.000'); expect(gs(null)).toBe('A cotizar');
    expect(soloDigitos('Gs. 160.000')).toBe(160000); expect(soloDigitos('')).toBeNull();
  });
  it('fechas según America/Asuncion, sin corrimiento', () => {
    expect(hoyISO(new Date('2026-11-10T02:30:00Z'))).toBe('2026-11-09'); // 23:30 del día anterior en Asunción
    expect(fecha('2026-11-10')).toBe('10 nov 2026'); expect(sumarDias('2026-12-29', 7)).toBe('2027-01-05');
  });
  it('numeración y WhatsApp', () => {
    expect(nOrden(24)).toBe('ZNX-024');
    expect(enlaceWhatsApp('0981 123 456', 'Hola Ana')).toBe('https://wa.me/595981123456?text=Hola%20Ana');
    expect(enlaceWhatsApp('+595 981 123456', 'x')).toContain('wa.me/595981123456');
    expect(plantilla('Hola {cliente}: {total} {otro}', { cliente: 'Ana', total: 'Gs. 1' })).toBe('Hola Ana: Gs. 1 {otro}');
  });
  it('CSV escapa comillas y neutraliza fórmulas', () => {
    const csv = aCSV([{ a: 'x,"y"', b: '=1+1', c: null }]);
    expect(csv).toContain('"x,""y"""'); expect(csv).toContain("'=1+1");
  });
});
