begin;

alter table public.community_ratings drop constraint if exists community_ratings_pkey;
alter table public.community_ratings alter column user_id drop not null;
alter table public.community_ratings add column if not exists guest_id uuid;
do $$ begin
  alter table public.community_ratings add constraint community_rating_identity
    check((user_id is not null) <> (guest_id is not null));
exception when duplicate_object then null;
end $$;
create unique index if not exists community_rating_member_vote on public.community_ratings(post_id, user_id) where user_id is not null;
create unique index if not exists community_rating_guest_vote on public.community_ratings(post_id, guest_id) where guest_id is not null;

drop function if exists public.community_rating_summary(uuid);
drop function if exists public.community_rate_post(uuid, integer);

create or replace function public.community_rating_summary(p_post_id uuid, p_guest_id uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'vote_count', count(*)::text,
    'average', round(avg(r.score), 1),
    'my_score',
      case
        when auth.uid() is not null then max(r.score) filter(where r.user_id = auth.uid())
        when p_guest_id is not null then max(r.score) filter(where r.guest_id = p_guest_id)
        else null
      end
  )
  from public.community_ratings r
  where r.post_id = p_post_id
    and exists(select 1 from public.community_posts p where p.id = p_post_id and p.kind = 'art');
$$;

create or replace function public.community_rate_post(p_post_id uuid, p_score integer, p_guest_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_guest_id uuid := p_guest_id;
begin
  if p_score is null or p_score not between 1 and 10 then
    raise exception 'Choose a rating from 1 to 10.' using errcode = '22023';
  end if;

  if not exists(select 1 from public.community_posts where id = p_post_id and kind = 'art') then
    raise exception 'Artwork not found.' using errcode = 'P0002';
  end if;

  if v_user_id is not null then
    v_guest_id := null;
    if not exists(select 1 from public.community_members where user_id = v_user_id) then
      raise exception 'Sign in to rate artwork.' using errcode = '28000';
    end if;
    if exists(select 1 from public.community_posts where id = p_post_id and author_id = v_user_id) then
      raise exception 'You cannot rate your own artwork.' using errcode = '22023';
    end if;
    update public.community_ratings set score = p_score
    where post_id = p_post_id and user_id = v_user_id;
    if not found then
      insert into public.community_ratings(post_id, user_id, score)
      values(p_post_id, v_user_id, p_score);
    end if;
  else
    if v_guest_id is null then
      raise exception 'A guest rating identity is required.' using errcode = '28000';
    end if;
    update public.community_ratings set score = p_score
    where post_id = p_post_id and guest_id = v_guest_id;
    if not found then
      insert into public.community_ratings(post_id, guest_id, score)
      values(p_post_id, v_guest_id, p_score);
    end if;
  end if;

  return public.community_rating_summary(p_post_id, v_guest_id);
end;
$$;

revoke all on function public.community_rating_summary(uuid,uuid), public.community_rate_post(uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.community_rating_summary(uuid,uuid) to anon, authenticated;
grant execute on function public.community_rate_post(uuid,integer,uuid) to anon, authenticated;

-- Keep direct table writes limited to authenticated member ratings.
revoke insert(post_id,user_id,guest_id,score), update(score) on public.community_ratings from anon;

commit;