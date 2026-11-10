import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurado = Boolean(url && key && !url.includes('TU-PROYECTO'));
export const BUCKET = 'zenix-privado';

// La clave pública (anon/publishable) puede viajar al navegador: la protección real son las políticas RLS.
export const supabase = createClient(url || 'http://localhost', key || 'sin-configurar', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
