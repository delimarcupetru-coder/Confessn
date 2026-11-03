begin;

grant update(title, description, image_path, starts_at, ends_at, timezone, event_type, location, online_url)
  on public.community_posts to authenticated;

drop policy if exists community_posts_update on public.community_posts;
create policy community_posts_update on public.community_posts for update to authenticated
  using(author_id = auth.uid())
  with check(author_id = auth.uid()
    and image_path like auth.uid()::text || '/%'
    and exists(select 1 from storage.objects where bucket_id = 'community-media' and name = image_path)
    and exists(select 1 from pg_catalog.pg_timezone_names where name = timezone));

commit;