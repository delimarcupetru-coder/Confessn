-- Read-only user summary for execution by an authorized Supabase project administrator.
-- Requires public.user_profiles and public.confessn_email_preferences migrations.
-- Does not return artwork contents, project notes, or full account JSON.
select
  auth_user.id as user_id,
  auth_user.email as auth_email,
  coalesce(nullif(auth_user.raw_user_meta_data ->> 'username', ''), 'Not provided') as username,
  coalesce(
    nullif(auth_user.raw_user_meta_data ->> 'full_name', ''),
    nullif(auth_user.raw_user_meta_data ->> 'name', ''),
    nullif(profile.account ->> 'name', ''),
    'Not provided'
  ) as name,
  coalesce(nullif(profile.account ->> 'email', ''), auth_user.email) as profile_email,
  count(*) over (
    partition by lower(coalesce(nullif(profile.account ->> 'email', ''), auth_user.email))
  ) as accounts_with_matching_email,
  coalesce(project_stats.project_count, 0)::bigint as project_count,
  coalesce(pg_column_size(profile.account), 0)::bigint as account_jsonb_bytes_estimate,
  coalesce(project_stats.embedded_artwork_bytes, 0)::bigint as embedded_artwork_bytes_estimate,
  coalesce(preferences.consent_prompted, false) as consent_prompted,
  coalesce(preferences.community_events_opt_in, false) as community_events_opt_in,
  coalesce(preferences.contests_opt_in, false) as contests_opt_in,
  coalesce(preferences.confessn_news_opt_in, false) as confessn_news_opt_in,
  preferences.response_recorded_at as consent_response_recorded_at,
  preferences.response_source as consent_response_source,
  auth_user.created_at as user_created_at,
  profile.updated_at as profile_updated_at
from auth.users as auth_user
left join public.user_profiles as profile on profile.user_id = auth_user.id
left join public.confessn_email_preferences as preferences on preferences.user_id = auth_user.id
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
order by lower(coalesce(nullif(profile.account ->> 'email', ''), auth_user.email)), auth_user.created_at;
