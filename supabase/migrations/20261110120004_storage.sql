-- ZENIX · Fase 1 · Storage privado para fotos, flyers y documentos.
-- Bucket NO público: los archivos solo se ven con sesión de socio y mediante enlaces firmados temporales.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('zenix-privado', 'zenix-privado', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "zenix socios leen archivos" on storage.objects for select to authenticated
  using (bucket_id = 'zenix-privado' and (select app.es_miembro()));
create policy "zenix socios suben archivos" on storage.objects for insert to authenticated
  with check (bucket_id = 'zenix-privado' and (select app.es_miembro()));
create policy "zenix socios borran archivos" on storage.objects for delete to authenticated
  using (bucket_id = 'zenix-privado' and (select app.es_miembro()));
