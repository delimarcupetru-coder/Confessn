begin;

create table if not exists public.community_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (length(username) between 1 and 100)
);

create table if not exists public.community_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.community_moderators enable row level security;
revoke all on public.community_moderators from public, anon, authenticated;
create or replace function public.community_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.community_moderators where user_id = auth.uid());
$$;
revoke all on function public.community_is_admin() from public, anon;
grant execute on function public.community_is_admin() to authenticated;
do $$
begin
  if to_regclass('public.confessn_admins') is not null then
    execute 'insert into public.community_moderators(user_id) select user_id from public.confessn_admins on conflict do nothing';
  end if;
end;
$$;

create or replace function public.community_sync_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_anonymous is not true and new.deleted_at is null then
    insert into public.community_members(user_id, username)
    values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'Member ' || left(new.id::text, 8)), 100))
    on conflict (user_id) do update set username = excluded.username;
  else
    delete from public.community_members where user_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.community_sync_member() from public, anon, authenticated;
drop trigger if exists community_member_sync on auth.users;
create trigger community_member_sync after insert or update of raw_user_meta_data, is_anonymous, deleted_at on auth.users
for each row execute function public.community_sync_member();
insert into public.community_members(user_id, username)
select id, left(coalesce(nullif(trim(raw_user_meta_data->>'username'), ''), nullif(trim(raw_user_meta_data->>'full_name'), ''), 'Member ' || left(id::text, 8)), 100)
from auth.users where is_anonymous is not true and deleted_at is null
on conflict (user_id) do update set username = excluded.username;

create table if not exists public.community_blocks (
  blocker_id uuid not null references public.community_members(user_id) on delete cascade,
  blocked_id uuid not null references public.community_members(user_id) on delete cascade,
  primary key(blocker_id, blocked_id), check(blocker_id <> blocked_id)
);
create index if not exists community_blocks_target on public.community_blocks(blocked_id);
create table if not exists public.community_chats (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.community_members(user_id) on delete cascade,
  title text not null default '' check(length(title) <= 100),
  is_group boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.community_participants (
  conversation_id uuid not null references public.community_chats(id) on delete cascade,
  user_id uuid not null references public.community_members(user_id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(conversation_id, user_id)
);
create index if not exists community_participants_user on public.community_participants(user_id);
create table if not exists public.community_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.community_chats(id) on delete cascade,
  sender_id uuid not null references public.community_members(user_id) on delete cascade,
  body text not null check(length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists community_messages_history on public.community_messages(conversation_id, created_at desc);
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.community_members(user_id) on delete cascade,
  kind text not null check(kind in ('art', 'event')),
  title text not null check(length(trim(title)) between 1 and 120),
  description text not null default '' check(length(description) <= 5000),
  image_path text not null check(length(image_path) between 1 and 300),
  created_at timestamptz not null default clock_timestamp(),
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'UTC' check(length(timezone) <= 100),
  event_type text not null default '' check(event_type in ('', 'studio', 'online', 'contest')),
  location text not null default '' check(length(location) <= 300),
  online_url text not null default '' check(length(online_url) <= 1000 and (online_url = '' or online_url ~ '^https://[^[:space:]]+$')),
  check (kind <> 'event' or (starts_at is not null and ends_at is not null and ends_at > starts_at and event_type <> '' and
    ((event_type = 'studio' and length(trim(location)) > 0) or (event_type in ('online', 'contest') and online_url <> ''))))
);
create index if not exists community_public_feed on public.community_posts(created_at desc, id desc);
create index if not exists community_event_calendar on public.community_posts(starts_at) where kind = 'event';
create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.community_members(user_id) on delete cascade,
  body text not null check(length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists community_post_comments on public.community_comments(post_id, created_at);
create table if not exists public.community_ratings (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.community_members(user_id) on delete cascade,
  score integer not null check(score between 1 and 10),
  primary key(post_id, user_id)
);
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.community_members(user_id) on delete cascade,
  target_user_id uuid not null references public.community_members(user_id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete set null,
  reason text not null check(length(trim(reason)) between 5 and 2000),
  resolved boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  check(reporter_id <> target_user_id)
);

create or replace function public.community_blocked(p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.community_blocks where
    (blocker_id = auth.uid() and blocked_id = p_other) or (blocked_id = auth.uid() and blocker_id = p_other));
$$;
create or replace function public.community_chat_member(p_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.community_participants where conversation_id = p_conversation and user_id = auth.uid());
$$;
create or replace function public.community_can_chat(p_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.community_chat_member(p_conversation)
    and (select count(*) from public.community_participants where conversation_id = p_conversation) > 1
    and not exists(select 1 from public.community_participants where conversation_id = p_conversation and public.community_blocked(user_id));
$$;
create or replace function public.community_start_chat(p_members uuid[], p_title text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare member_id uuid := auth.uid(); people uuid[]; chat_id uuid; group_chat boolean := length(trim(p_title)) > 0;
begin
  if not exists(select 1 from public.community_members where user_id = member_id) then raise exception 'Sign in with a registered account.'; end if;
  select array_agg(distinct person order by person) into people from unnest(array_append(p_members, member_id)) person where person is not null;
  if cardinality(people) not between 2 and 50 or length(p_title) > 100 or (not group_chat and cardinality(people) <> 2) or (group_chat and cardinality(people) < 3) then raise exception 'Choose one person for a direct chat, or at least two people and a name for a group (maximum 50 members).'; end if;
  if exists(select 1 from unnest(people) person where not exists(select 1 from public.community_members where user_id = person)) then raise exception 'Member unavailable.'; end if;
  if exists(select 1 from public.community_blocks where blocker_id = any(people) and blocked_id = any(people)) then raise exception 'A block prevents this conversation.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(array_to_string(people, ','), 0));
  if not group_chat then
    select chats.id into chat_id from public.community_chats chats where not chats.is_group
      and (select array_agg(user_id order by user_id) from public.community_participants where conversation_id = chats.id) = people limit 1;
    if chat_id is not null then return chat_id; end if;
  end if;
  if (select count(*) from public.community_chats where owner_id = member_id and created_at > now() - interval '1 hour') >= 30 then raise exception 'Too many new conversations. Please try again later.'; end if;
  insert into public.community_chats(owner_id, title, is_group) values(member_id, trim(p_title), group_chat) returning id into chat_id;
  insert into public.community_participants(conversation_id, user_id) select chat_id, person from unnest(people) person;
  return chat_id;
end;
$$;
create or replace function public.community_conversations()
returns table(id uuid, title text, is_group boolean, owner_id uuid)
language sql stable security definer set search_path = '' as $$
  select chat.id, case when chat.is_group then chat.title else
    coalesce((select member.username from public.community_participants participant join public.community_members member on member.user_id = participant.user_id
      where participant.conversation_id = chat.id and participant.user_id <> auth.uid() limit 1), 'Member left') end,
    chat.is_group, chat.owner_id
  from public.community_chats chat where public.community_can_chat(chat.id)
  order by coalesce((select max(created_at) from public.community_messages where conversation_id = chat.id), chat.created_at) desc;
$$;
create or replace function public.community_leave_chat(p_conversation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare new_owner uuid;
begin
  perform 1 from public.community_chats where id = p_conversation for update;
  if not public.community_chat_member(p_conversation) then raise exception 'Conversation membership required.'; end if;
  delete from public.community_participants where conversation_id = p_conversation and user_id = auth.uid();
  select user_id into new_owner from public.community_participants where conversation_id = p_conversation order by joined_at, user_id limit 1;
  if new_owner is null then delete from public.community_chats where id = p_conversation;
  else update public.community_chats set owner_id = new_owner where id = p_conversation and owner_id = auth.uid(); end if;
end;
$$;

create or replace function public.community_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare member_id uuid := auth.uid(); recent integer;
begin
  if member_id is null then raise exception 'Sign in first.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(member_id::text || tg_table_name, 0));
  if tg_table_name = 'community_messages' then
    select count(*) into recent from public.community_messages where sender_id = member_id and created_at > now() - interval '1 minute';
    if recent >= 30 then raise exception 'Message limit reached. Try again in a minute.'; end if;
  elsif tg_table_name = 'community_posts' then
    if not exists(select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then raise exception 'Choose a valid event timezone.'; end if;
    select count(*) into recent from public.community_posts where author_id = member_id and created_at > now() - interval '1 hour';
    if recent >= 10 then raise exception 'Publication limit reached. Try again later.'; end if;
  elsif tg_table_name = 'community_comments' then
    select count(*) into recent from public.community_comments where author_id = member_id and created_at > now() - interval '1 minute';
    if recent >= 10 then raise exception 'Comment limit reached. Try again in a minute.'; end if;
  elsif tg_table_name = 'community_reports' then
    select count(*) into recent from public.community_reports where reporter_id = member_id and created_at > now() - interval '1 hour';
    if recent >= 10 then raise exception 'Report limit reached. Try again later.'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.community_rate_limit() from public, anon, authenticated;
do $$
declare table_name text;
begin
  foreach table_name in array array['community_members','community_blocks','community_chats','community_participants','community_messages','community_posts','community_comments','community_ratings','community_reports'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
  end loop;
  foreach table_name in array array['community_messages','community_posts','community_comments','community_reports'] loop
    execute format('drop trigger if exists community_limit on public.%I', table_name);
    execute format('create trigger community_limit before insert on public.%I for each row execute function public.community_rate_limit()', table_name);
  end loop;
end;
$$;

grant select on public.community_members, public.community_posts, public.community_comments, public.community_ratings to anon, authenticated;
grant select on public.community_blocks, public.community_participants, public.community_messages, public.community_reports to authenticated;
grant insert(blocker_id, blocked_id), delete on public.community_blocks to authenticated;
grant insert(conversation_id, sender_id, body) on public.community_messages to authenticated;
grant insert(author_id, kind, title, description, image_path, starts_at, ends_at, timezone, event_type, location, online_url), delete on public.community_posts to authenticated;
grant insert(post_id, author_id, body), delete on public.community_comments to authenticated;
grant insert(post_id, user_id, score), update(score) on public.community_ratings to authenticated;
grant insert(reporter_id, target_user_id, post_id, reason), update(resolved) on public.community_reports to authenticated;

create policy community_members_read on public.community_members for select using(true);
create policy community_blocks_read on public.community_blocks for select to authenticated using(blocker_id = auth.uid());
create policy community_blocks_insert on public.community_blocks for insert to authenticated with check(blocker_id = auth.uid());
create policy community_blocks_delete on public.community_blocks for delete to authenticated using(blocker_id = auth.uid());
create policy community_participants_read on public.community_participants for select to authenticated using(public.community_chat_member(conversation_id));
create policy community_messages_read on public.community_messages for select to authenticated using(public.community_can_chat(conversation_id));
create policy community_messages_insert on public.community_messages for insert to authenticated with check(sender_id = auth.uid() and public.community_can_chat(conversation_id));
create policy community_posts_read on public.community_posts for select using(not public.community_blocked(author_id));
create policy community_posts_insert on public.community_posts for insert to authenticated with check(author_id = auth.uid() and image_path like auth.uid()::text || '/%' and exists(select 1 from storage.objects where bucket_id = 'community-media' and name = image_path));
create policy community_posts_delete on public.community_posts for delete to authenticated using(author_id = auth.uid() or public.community_is_admin());
create policy community_comments_read on public.community_comments for select using(not public.community_blocked(author_id) and exists(select 1 from public.community_posts where id = post_id));
create policy community_comments_insert on public.community_comments for insert to authenticated with check(author_id = auth.uid() and exists(select 1 from public.community_posts where id = post_id));
create policy community_comments_delete on public.community_comments for delete to authenticated using(author_id = auth.uid() or public.community_is_admin());
create policy community_ratings_read on public.community_ratings for select using(exists(select 1 from public.community_posts where id = post_id));
create policy community_ratings_insert on public.community_ratings for insert to authenticated with check(user_id = auth.uid() and exists(select 1 from public.community_posts where id = post_id and kind = 'art' and author_id <> auth.uid()));
create policy community_ratings_update on public.community_ratings for update to authenticated using(user_id = auth.uid()) with check(user_id = auth.uid() and exists(select 1 from public.community_posts where id = post_id and kind = 'art' and author_id <> auth.uid()));
create policy community_reports_read on public.community_reports for select to authenticated using(reporter_id = auth.uid() or public.community_is_admin());
create policy community_reports_insert on public.community_reports for insert to authenticated with check(reporter_id = auth.uid() and (post_id is null or exists(select 1 from public.community_posts where id = post_id and author_id = target_user_id)));
create policy community_reports_update on public.community_reports for update to authenticated using(public.community_is_admin()) with check(public.community_is_admin());

revoke all on function public.community_blocked(uuid), public.community_chat_member(uuid), public.community_can_chat(uuid), public.community_start_chat(uuid[],text), public.community_conversations(), public.community_leave_chat(uuid) from public, anon, authenticated;
grant execute on function public.community_blocked(uuid) to anon, authenticated;
grant execute on function public.community_chat_member(uuid), public.community_can_chat(uuid), public.community_start_chat(uuid[],text), public.community_conversations(), public.community_leave_chat(uuid) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('community-media', 'community-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy community_media_read on storage.objects for select using(bucket_id = 'community-media');
create policy community_media_upload on storage.objects for insert to authenticated with check(bucket_id = 'community-media' and (storage.foldername(name))[1] = auth.uid()::text and exists(select 1 from public.community_members where user_id = auth.uid()));
create policy community_media_delete on storage.objects for delete to authenticated using(bucket_id = 'community-media' and (storage.foldername(name))[1] = auth.uid()::text and not exists(select 1 from public.community_posts where image_path = name));

commit;