begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('community-chat-media', 'community-chat-media', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists community_chat_media_read on storage.objects;
create policy community_chat_media_read on storage.objects for select to authenticated using(
  bucket_id = 'community-chat-media'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.community_chat_member((storage.foldername(name))[1]::uuid)
);

drop policy if exists community_chat_media_insert on storage.objects;
create policy community_chat_media_insert on storage.objects for insert to authenticated with check(
  bucket_id = 'community-chat-media'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.community_chat_member((storage.foldername(name))[1]::uuid)
);

commit;
