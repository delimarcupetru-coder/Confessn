create table if not exists public.confessn_email_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  community_events_opt_in boolean not null default false,
  contests_opt_in boolean not null default false,
  confessn_news_opt_in boolean not null default false,
  consent_prompted boolean not null default false,
  response_recorded_at timestamptz default now(),
  response_source text not null default 'unprompted'
    check (response_source in ('signup', 'account', 'unprompted')),
  updated_at timestamptz not null default now()
);

alter table public.confessn_email_preferences enable row level security;
revoke all on public.confessn_email_preferences from public, anon, authenticated;
grant select on public.confessn_email_preferences to authenticated;

drop policy if exists "Users can read their own email preferences" on public.confessn_email_preferences;
create policy "Users can read their own email preferences"
  on public.confessn_email_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own email preferences" on public.confessn_email_preferences;
drop policy if exists "Users can update their own email preferences" on public.confessn_email_preferences;

create table if not exists public.confessn_signup_email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  username text not null default '',
  name text not null default '',
  project_count integer not null default 0,
  account_data_bytes bigint not null default 0,
  profile_status text not null default 'awaiting first profile sync',
  created_at timestamptz not null default now(),
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed')),
  delivered_at timestamptz,
  provider_message_id text,
  last_error text
);

alter table public.confessn_signup_email_outbox enable row level security;
revoke all on public.confessn_signup_email_outbox from public, anon, authenticated;

create table if not exists public.confessn_email_preference_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  username text not null default '',
  community_events_opt_in boolean not null,
  contests_opt_in boolean not null,
  confessn_news_opt_in boolean not null,
  consent_prompted boolean not null default true,
  response_recorded_at timestamptz not null default now(),
  response_source text not null default 'account',
  created_at timestamptz not null default now(),
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed')),
  delivered_at timestamptz,
  provider_message_id text,
  last_error text
);

alter table public.confessn_email_preference_outbox enable row level security;
revoke all on public.confessn_email_preference_outbox from public, anon, authenticated;

create or replace function public.record_confessn_signup_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  preferences jsonb;
  was_prompted boolean;
begin
  preferences := coalesce(new.raw_user_meta_data, '{}'::jsonb) -> 'email_preferences';
  was_prompted := coalesce(new.raw_user_meta_data ->> 'email_preferences_prompted' = 'true', false);

  insert into public.confessn_email_preferences (
    user_id,
    community_events_opt_in,
    contests_opt_in,
    confessn_news_opt_in,
    consent_prompted,
    response_recorded_at,
    response_source
  ) values (
    new.id,
    coalesce(preferences ->> 'community_events' = 'true', false),
    coalesce(preferences ->> 'contests' = 'true', false),
    coalesce(preferences ->> 'confessn_news' = 'true', false),
    was_prompted,
    case when was_prompted then now() else null end,
    case when was_prompted then 'signup' else 'unprompted' end
  ) on conflict (user_id) do nothing;

  insert into public.confessn_signup_email_outbox (
    user_id,
    email,
    username,
    name,
    project_count,
    account_data_bytes,
    profile_status
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'username', ''),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'username',
      ''
    ),
    0,
    0,
    'profile not synced at account creation'
  ) on conflict (user_id) do nothing;

  return new;
end;
$function$;

revoke all on function public.record_confessn_signup_events() from public, anon, authenticated;

drop trigger if exists record_confessn_signup_events on auth.users;
create trigger record_confessn_signup_events
after insert on auth.users
for each row execute function public.record_confessn_signup_events();

create or replace function public.save_confessn_email_preferences(
  p_community_events_opt_in boolean,
  p_contests_opt_in boolean,
  p_confessn_news_opt_in boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  signed_in_user_id uuid := auth.uid();
  preference_changed boolean;
begin
  if signed_in_user_id is null then
    raise exception 'Sign-in required' using errcode = '42501';
  end if;

  insert into public.confessn_email_preferences as current_preferences (
    user_id,
    community_events_opt_in,
    contests_opt_in,
    confessn_news_opt_in,
    consent_prompted,
    response_recorded_at,
    response_source,
    updated_at
  ) values (
    signed_in_user_id,
    coalesce(p_community_events_opt_in, false),
    coalesce(p_contests_opt_in, false),
    coalesce(p_confessn_news_opt_in, false),
    true,
    now(),
    'account',
    now()
  ) on conflict (user_id) do update set
    community_events_opt_in = excluded.community_events_opt_in,
    contests_opt_in = excluded.contests_opt_in,
    confessn_news_opt_in = excluded.confessn_news_opt_in,
    consent_prompted = true,
    response_recorded_at = now(),
    response_source = 'account',
    updated_at = now()
  where current_preferences.community_events_opt_in is distinct from excluded.community_events_opt_in
    or current_preferences.contests_opt_in is distinct from excluded.contests_opt_in
    or current_preferences.confessn_news_opt_in is distinct from excluded.confessn_news_opt_in
    or not current_preferences.consent_prompted
  returning true into preference_changed;

  if not coalesce(preference_changed, false) then
    return false;
  end if;

  insert into public.confessn_email_preference_outbox (
    user_id,
    email,
    username,
    community_events_opt_in,
    contests_opt_in,
    confessn_news_opt_in,
    response_recorded_at,
    response_source
  )
  select
    signed_in_user_id,
    auth_user.email,
    coalesce(auth_user.raw_user_meta_data ->> 'username', ''),
    p_community_events_opt_in,
    p_contests_opt_in,
    p_confessn_news_opt_in,
    now(),
    'account'
  from auth.users as auth_user
  where auth_user.id = signed_in_user_id;

  return true;
end;
$function$;

revoke all on function public.save_confessn_email_preferences(boolean, boolean, boolean) from public, anon;
grant execute on function public.save_confessn_email_preferences(boolean, boolean, boolean) to authenticated;
create or replace function public.get_confessn_admin_email_preferences()
returns table (
  user_id uuid,
  community_events_opt_in boolean,
  contests_opt_in boolean,
  confessn_news_opt_in boolean,
  consent_prompted boolean,
  response_recorded_at timestamptz,
  response_source text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.is_confessn_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select
    auth_user.id,
    coalesce(preferences.community_events_opt_in, false),
    coalesce(preferences.contests_opt_in, false),
    coalesce(preferences.confessn_news_opt_in, false),
    coalesce(preferences.consent_prompted, false),
    preferences.response_recorded_at,
    preferences.response_source
  from auth.users as auth_user
  left join public.confessn_email_preferences as preferences on preferences.user_id = auth_user.id
  order by auth_user.created_at desc;
end;
$function$;

revoke all on function public.get_confessn_admin_email_preferences() from public, anon;
grant execute on function public.get_confessn_admin_email_preferences() to authenticated;

create or replace function public.get_confessn_admin_notifications()
returns table (
  notification_id uuid,
  event_type text,
  email text,
  username text,
  summary text,
  created_at timestamptz,
  delivery_status text,
  delivered_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.is_confessn_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select notifications.notification_id,
         notifications.event_type,
         notifications.email,
         notifications.username,
         notifications.summary,
         notifications.created_at,
         notifications.delivery_status,
         notifications.delivered_at
  from (
    select
      signup.id as notification_id,
      'new_account'::text as event_type,
      signup.email,
      signup.username,
      format('Projects at signup: %s; account bytes: %s; %s', signup.project_count, signup.account_data_bytes, signup.profile_status) as summary,
      signup.created_at,
      signup.delivery_status,
      signup.delivered_at
    from public.confessn_signup_email_outbox as signup
    union all
    select
      preferences.id as notification_id,
      'email_preferences'::text as event_type,
      preferences.email,
      preferences.username,
      format(
        'Community events: %s; contests: %s; Confessn news: %s',
        case when preferences.community_events_opt_in then 'opted in' else 'opted out' end,
        case when preferences.contests_opt_in then 'opted in' else 'opted out' end,
        case when preferences.confessn_news_opt_in then 'opted in' else 'opted out' end
      ) as summary,
      preferences.created_at,
      preferences.delivery_status,
      preferences.delivered_at
    from public.confessn_email_preference_outbox as preferences
  ) as notifications
  order by notifications.created_at desc
  limit 100;
end;
$function$;

revoke all on function public.get_confessn_admin_notifications() from public, anon;
grant execute on function public.get_confessn_admin_notifications() to authenticated;
