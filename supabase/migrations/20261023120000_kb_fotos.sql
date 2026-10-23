-- Fotos de los manuales de Conocimiento: bucket privado; las ve quien puede leer el manual.
begin;
set local lock_timeout='5s';
create table public.kb_fotos (
 id uuid primary key,articulo_id uuid not null references public.kb_articulos(id),
 nombre text not null check(length(nombre) between 1 and 200),descripcion text not null default '' check(length(descripcion)<=300),
 ruta text not null unique,mime text not null check(mime in ('image/jpeg','image/png','image/webp')),bytes integer not null check(bytes between 1 and 4194304),sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 usuario_id uuid not null references public.perfiles(id),creado_en timestamptz not null default now(),confirmado_en timestamptz,
 retirado_en timestamptz,retirado_por uuid references public.perfiles(id),
 check((retirado_en is null)=(retirado_por is null))
);
create index kb_fotos_articulo on public.kb_fotos(articulo_id,creado_en);
alter table public.kb_fotos enable row level security;
revoke all on public.kb_fotos from public,anon,authenticated;
grant select on public.kb_fotos to authenticated;
-- La subconsulta respeta la política de kb_articulos: borradores y audiencias quedan igual que el texto.
create policy kb_ver_foto on public.kb_fotos for select to authenticated using(retirado_en is null and exists(select 1 from public.kb_articulos a where a.id=articulo_id) and (confirmado_en is not null or usuario_id=auth.uid() and public.kb_admin()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('manuales','manuales',false,4194304,array['image/jpeg','image/png','image/webp']);
create policy manuales_lectura on storage.objects for select to authenticated using(bucket_id='manuales' and exists(select 1 from public.kb_fotos f where f.ruta=name));
create policy manuales_subir on storage.objects for insert to authenticated with check(bucket_id='manuales' and public.kb_admin() and exists(select 1 from public.kb_fotos f where f.ruta=name and f.usuario_id=auth.uid() and f.confirmado_en is null and f.creado_en>now()-interval '1 day'));
-- Sin UPDATE ni DELETE en storage: retirar una foto la oculta y conserva el archivo.
create function public.kb_preparar_foto(p_id uuid,p_articulo uuid,p_nombre text,p_extension text,p_mime text,p_bytes integer,p_sha256 text,p_descripcion text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.kb_fotos; ruta_nueva text;
begin
 if not public.kb_admin() then raise exception 'Solo administración agrega fotos a los manuales.';end if;
 if p_id is null or p_articulo is null or p_nombre is null or length(trim(p_nombre)) not between 1 and 200 or p_nombre~'[[:cntrl:]/\\]' or p_bytes is null or p_bytes not between 1 and 4194304 or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' or p_descripcion is null or length(trim(p_descripcion))>300 then raise exception 'Datos de foto inválidos.';end if;
 if p_mime is distinct from (case p_extension when 'jpg' then 'image/jpeg' when 'png' then 'image/png' when 'webp' then 'image/webp' end) then raise exception 'Usa una foto JPG, PNG o WebP.';end if;
 if not exists(select 1 from public.kb_articulos where id=p_articulo) then raise exception 'Manual inexistente.';end if;
 perform pg_advisory_xact_lock(hashtextextended('kb-foto:'||p_id::text,0));
 if (select count(*) from public.kb_fotos where articulo_id=p_articulo and retirado_en is null and id<>p_id)>=30 then raise exception 'Un manual puede tener hasta 30 fotos.';end if;
 select * into v from public.kb_fotos where id=p_id;
 ruta_nueva:=p_articulo::text||'/'||p_id::text||'.'||p_extension;
 if found then
  if v.usuario_id<>auth.uid() or v.ruta<>ruta_nueva or v.nombre<>trim(p_nombre) or v.sha256<>p_sha256 or v.bytes<>p_bytes or v.mime<>p_mime or v.descripcion<>trim(p_descripcion) then raise exception 'Esta solicitud ya corresponde a otra foto.';end if;
 else
  insert into public.kb_fotos(id,articulo_id,nombre,descripcion,ruta,mime,bytes,sha256,usuario_id) values(p_id,p_articulo,trim(p_nombre),trim(p_descripcion),ruta_nueva,p_mime,p_bytes,p_sha256,auth.uid()) returning * into v;
 end if;
 return jsonb_build_object('ruta',v.ruta,'disponible',v.confirmado_en is not null);
end $$;
create function public.kb_confirmar_foto(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v public.kb_fotos;
begin
 if not public.kb_admin() then raise exception 'Solo administración agrega fotos a los manuales.';end if;
 select * into v from public.kb_fotos where id=p_id for update;
 if not found or v.usuario_id<>auth.uid() then raise exception 'Foto no encontrada.';end if;
 if v.confirmado_en is not null then return;end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='manuales' and o.name=v.ruta and (o.metadata->>'size')::bigint=v.bytes and o.metadata->>'mimetype'=v.mime) then raise exception 'La foto no está subida o no coincide con la reserva.';end if;
 update public.kb_fotos set confirmado_en=now() where id=p_id;
 insert into public.kb_historial(articulo_id,anterior,nuevo,usuario_id) values(v.articulo_id,'{}'::jsonb,jsonb_build_object('foto_agregada',v.id,'nombre',v.nombre,'descripcion',v.descripcion),auth.uid());
end $$;
create function public.kb_retirar_foto(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v public.kb_fotos;
begin
 if not public.kb_admin() then raise exception 'Solo administración retira fotos de los manuales.';end if;
 select * into v from public.kb_fotos where id=p_id for update;
 if not found or v.confirmado_en is null then raise exception 'Foto no encontrada.';end if;
 if v.retirado_en is not null then return;end if;
 update public.kb_fotos set retirado_en=now(),retirado_por=auth.uid() where id=p_id;
 insert into public.kb_historial(articulo_id,anterior,nuevo,usuario_id) values(v.articulo_id,jsonb_build_object('foto',v.id,'nombre',v.nombre),jsonb_build_object('foto_retirada',v.id),auth.uid());
end $$;
revoke all on function public.kb_preparar_foto(uuid,uuid,text,text,text,integer,text,text),public.kb_confirmar_foto(uuid),public.kb_retirar_foto(uuid) from public,anon;
grant execute on function public.kb_preparar_foto(uuid,uuid,text,text,text,integer,text,text),public.kb_confirmar_foto(uuid),public.kb_retirar_foto(uuid) to authenticated;
commit;
