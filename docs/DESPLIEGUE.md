# Guía de despliegue privado (costo Gs. 0)

Tiempo estimado: 30 minutos. No se activa ningún plan pago ni se pide tarjeta.

## 1. Base de datos en Supabase

1. En [supabase.com](https://supabase.com) creá un proyecto nuevo en tu organización, plan **Free**. Región sugerida: **South America (São Paulo)**, la más cercana a Paraguay. Guardá la contraseña de la base en un gestor de contraseñas.
2. Aplicá las migraciones **en orden** (carpeta `supabase/migrations/`). Dos formas:
   - **Editor SQL del panel:** pegá y ejecutá cada archivo, del `…0001_esquema.sql` al `…0005_datos_iniciales.sql`.
   - **CLI:** `npx supabase link --project-ref TU_REF` y luego `npx supabase db push`.
3. **Deshabilitá el registro público:** Authentication → Sign In / Providers → desactivá **Allow new users to sign up**. (Aunque alguien lograra crear una cuenta, sin perfil de socio no accede a nada; esto es una segunda barrera.)
4. **Creá las dos cuentas:** Authentication → Users → **Add user → Create new user**, con correo y una contraseña provisoria de 10+ caracteres, marcando *Auto Confirm User*. Una por socio.
5. **Habilitalas como socios** en el editor SQL (usá los correos reales):
   ```sql
   select public.alta_socio('socio1@correo.com', 'Nombre Socio 1', 'admin');
   select public.alta_socio('socio2@correo.com', 'Nombre Socio 2', 'admin'); -- o 'operador'
   ```
6. Copiá de **Project Settings → API** la *Project URL* y la clave pública (*anon* / *publishable*). **Nunca** uses la clave `service_role` en la app.
7. Recomendado: en Advisors → Security revisá que no haya advertencias sobre tablas sin RLS.

## 2. Interfaz en Cloudflare

Se eligió Cloudflare porque su acuerdo no restringe el uso comercial del plan gratuito y las solicitudes a archivos estáticos no se cobran. Vercel se descartó: su plan Hobby es solo para uso personal no comercial.

1. Creá una cuenta gratuita en [cloudflare.com](https://dash.cloudflare.com/sign-up) (no pide tarjeta para esto).
2. En la carpeta del proyecto:
   ```bash
   npm ci
   cp .env.example .env.local      # completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
   npx wrangler login              # abre el navegador para autorizar
   npm run deploy
   ```
3. Wrangler muestra la dirección: `https://zenix-operaciones.TU-SUBDOMINIO.workers.dev`. Esa es la que usan los dos socios.
4. En el celular: abrir la dirección → menú del navegador → **Agregar a pantalla de inicio**.

Los dos valores `VITE_…` quedan dentro de la app compilada: es lo esperado, son públicos por diseño. Para actualizar la app, repetí `npm run deploy`.

## 3. Verificación después de desplegar

- [ ] Abrir la dirección sin sesión muestra solo la pantalla de ingreso.
- [ ] Cada socio ingresa y cambia su contraseña provisoria en **Ajustes → Mi cuenta**.
- [ ] Ajustes → Catálogo muestra PC Gs. 150.000, laptop Gs. 160.000, tarjeta gráfica Gs. 30.000.
- [ ] Cargar la demostración (Ajustes → Datos), recorrer el flujo y **borrarla** antes de usar datos reales.
- [ ] Subir una foto en una orden y volver a verla desde el otro dispositivo.
- [ ] Hacer la primera exportación (Ajustes → Datos).

## 4. Seguridad: qué queda configurado y qué depende de ustedes

| Tema | Estado |
|---|---|
| Contraseñas | Las guarda Supabase Auth con hash; la app nunca las almacena |
| Intentos de acceso | Supabase Auth limita intentos por IP (Authentication → Rate Limits) |
| Sesiones | Se renuevan solas; "Cerrar sesión en todos los dispositivos" en Mi cuenta; un Administrador puede quitar el acceso a un socio en Ajustes → Socios |
| Archivos | Bucket privado, 5 MB por archivo, solo imágenes y PDF, enlaces firmados de 1 hora |
| Encabezados | `public/_headers`: CSP, sin iframes, sin indexación en buscadores |
| Segundo factor (MFA) | No implementado en fase 1. Supabase lo ofrece gratis (TOTP); se puede sumar si lo piden |
| Protección de contraseñas filtradas | Solo en planes pagos de Supabase: usen contraseñas largas y únicas |
