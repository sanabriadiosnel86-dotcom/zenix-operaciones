import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import type { Perfil } from './lib/types';

type Estado = { cargando: boolean; sesion: Session | null; perfil: Perfil | null; errorPerfil: boolean; esAdmin: boolean; recargarPerfil: () => Promise<void> };
const Ctx = createContext<Estado>({ cargando: true, sesion: null, perfil: null, errorPerfil: false, esAdmin: false, recargarPerfil: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children, alCerrar }: { children: ReactNode; alCerrar: () => void }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorPerfil, setErrorPerfil] = useState(false);
  const uid = sesion?.user.id ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSesion(data.session); if (!data.session) setCargando(false); });
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSesion(s);
      if (evento === 'SIGNED_OUT') { setPerfil(null); setCargando(false); alCerrar(); } // no deja datos privados en memoria
    });
    return () => data.subscription.unsubscribe();
  }, [alCerrar]);

  const cargarPerfil = async (id: string) => {
    const { data, error } = await supabase.from('perfiles').select('id,nombre,rol,activo,version').eq('id', id).maybeSingle();
    setErrorPerfil(Boolean(error));
    setPerfil(data && data.activo ? (data as Perfil) : null);
    setCargando(false);
  };
  useEffect(() => { if (uid) { setCargando(true); void cargarPerfil(uid); } }, [uid]);

  return (
    <Ctx.Provider value={{ cargando, sesion, perfil, errorPerfil, esAdmin: perfil?.rol === 'admin', recargarPerfil: async () => { if (uid) await cargarPerfil(uid); } }}>
      {children}
    </Ctx.Provider>
  );
}
