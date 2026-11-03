begin;

create or replace function public.community_rating_summary(p_post_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'vote_count', count(*)::text,
    'average', round(avg(score), 1),
    'my_score', max(score) filter(where user_id = auth.uid())
  )
  from public.community_ratings
  where post_id = p_post_id
    and exists(select 1 from public.community_posts where id = p_post_id and kind = 'art');
$$;

create or replace function public.community_rate_post(p_post_id uuid, p_score integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.community_members where user_id = auth.uid()) then
    raise exception 'Sign in to rate artwork.' using errcode = '28000';
  end if;
  if p_score is null or p_score not between 1 and 10 then
    raise exception 'Choose a rating from 1 to 10.' using errcode = '22023';
  end if;
  insert into public.community_ratings(post_id, user_id, score)
  values(p_post_id, auth.uid(), p_score)
  on conflict(post_id, user_id) do update set score = excluded.score;
  return public.community_rating_summary(p_post_id);
end;
$$;

revoke all on function public.community_rating_summary(uuid), public.community_rate_post(uuid,integer) from public, anon, authenticated;
grant execute on function public.community_rating_summary(uuid) to anon, authenticated;
grant execute on function public.community_rate_post(uuid,integer) to authenticated;

commit;