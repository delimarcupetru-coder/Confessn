create table if not exists public.confessn_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);

alter table public.confessn_admins enable row level security;
revoke all on public.confessn_admins from anon, authenticated;

create or replace function public.is_confessn_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.confessn_admins as admins
    where admins.user_id = auth.uid()
  );
$function$;

revoke all on function public.is_confessn_admin() from public, anon;
grant execute on function public.is_confessn_admin() to authenticated;

create or replace function public.get_confessn_admin_user_metrics()
returns table (
  user_id uuid,
  email text,
  username text,
  name text,
  project_count bigint,
  account_data_bytes bigint,
  embedded_artwork_bytes bigint,
  account_updated_at timestamptz,
  user_created_at timestamptz
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
    coalesce(auth_user.email, '')::text,
    coalesce(auth_user.raw_user_meta_data ->> 'username', '')::text,
    coalesce(
      auth_user.raw_user_meta_data ->> 'full_name',
      auth_user.raw_user_meta_data ->> 'name',
      profile.account ->> 'name',
      ''
    )::text,
    coalesce(project_stats.project_count, 0)::bigint,
    coalesce(pg_column_size(profile.account), 0)::bigint,
    coalesce(project_stats.embedded_artwork_bytes, 0)::bigint,
    profile.updated_at,
    auth_user.created_at
  from auth.users as auth_user
  left join public.user_profiles as profile on profile.user_id = auth_user.id
  left join lateral (
    select
      count(*)::bigint as project_count,
      coalesce(sum(
        case
          when project_record.value ->> 'artwork' like 'data:%;base64,%' then
            greatest(
              0,
              (length(image_data.base64_payload) * 3 / 4)
              - case
                  when right(image_data.base64_payload, 2) = '==' then 2
                  when right(image_data.base64_payload, 1) = '=' then 1
                  else 0
                end
            )
          else 0
        end
      ), 0)::bigint as embedded_artwork_bytes
    from jsonb_array_elements(
      case
        when jsonb_typeof(profile.account -> 'projects') = 'array' then profile.account -> 'projects'
        else '[]'::jsonb
      end
    ) as project_record(value)
    cross join lateral (
      select split_part(project_record.value ->> 'artwork', ',', 2) as base64_payload
    ) as image_data
  ) as project_stats on true
  order by auth_user.created_at desc;
end;
$function$;

revoke all on function public.get_confessn_admin_user_metrics() from public, anon;
grant execute on function public.get_confessn_admin_user_metrics() to authenticated;
