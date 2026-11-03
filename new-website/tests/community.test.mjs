import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const outsider = '33333333-3333-4333-8333-333333333333'
const admin = '44444444-4444-4444-8444-444444444444'

test('community migration and access policies', async context => {
  const db = new PGlite()
  context.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}', is_anonymous boolean default false, deleted_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth, storage to anon, authenticated;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant select on storage.objects to anon, authenticated;
    grant insert, delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
    create table public.user_profiles(user_id uuid primary key, account jsonb);
    alter table public.user_profiles enable row level security;
    grant select on public.user_profiles to authenticated;
    create policy own_profile on public.user_profiles for select using(user_id = auth.uid());
    insert into auth.users(id,raw_user_meta_data) values
      ('${alice}','{"username":"Alice"}'), ('${bob}','{"username":"Bob"}'),
      ('${outsider}','{"username":"Outsider"}'), ('${admin}','{"username":"Admin"}');
    insert into public.user_profiles values ('${alice}', '{"notes":"PRIVATE PORTFOLIO"}');
  `)
  await db.exec(await readFile(new URL('../../supabase-community.sql', import.meta.url), 'utf8'))
  await db.query('insert into public.community_moderators(user_id) values($1)', [admin])
  const asUser = async user => {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
    await db.exec(`set role ${user ? 'authenticated' : 'anon'}`)
  }
  let chat, group, post, eventPost

  await context.test('only public usernames are copied, not private account data', async () => {
    await asUser(outsider)
    const directory = await db.query('select * from public.community_members')
    assert.equal(directory.rows.length, 4)
    assert.deepEqual(Object.keys(directory.rows[0]).sort(), ['user_id', 'username'])
    assert.equal((await db.query('select * from public.user_profiles')).rows.length, 0)
  })

  await context.test('direct chats are reused and outsiders cannot read or send messages', async () => {
    await asUser(alice)
    chat = (await db.query('select public.community_start_chat($1::uuid[], $2) as id', [[bob], ''])).rows[0].id
    assert.equal((await db.query('select public.community_start_chat($1::uuid[], $2) as id', [[bob], ''])).rows[0].id, chat)
    await db.query('insert into public.community_messages(conversation_id,sender_id,body) values($1,$2,$3)', [chat, alice, 'Private message'])
    await asUser(bob)
    assert.equal((await db.query('select * from public.community_messages')).rows.length, 1)
    await asUser(outsider)
    assert.equal((await db.query('select * from public.community_messages')).rows.length, 0)
    assert.equal((await db.query('select * from public.community_participants')).rows.length, 0)
    await assert.rejects(db.query('insert into public.community_messages(conversation_id,sender_id,body) values($1,$2,$3)', [chat, outsider, 'Intrusion']))
    await assert.rejects(db.query('insert into public.community_participants(conversation_id,user_id) values($1,$2)', [chat, outsider]))
  })

  await context.test('blocks prevent incoming messages and new shared conversations in both directions', async () => {
    await asUser(alice)
    await db.query('insert into public.community_blocks(blocker_id,blocked_id) values($1,$2)', [alice, bob])
    await asUser(bob)
    assert.equal((await db.query('select * from public.community_messages')).rows.length, 0)
    await assert.rejects(db.query('insert into public.community_messages(conversation_id,sender_id,body) values($1,$2,$3)', [chat, bob, 'Blocked']))
    await assert.rejects(db.query('select public.community_start_chat($1::uuid[], $2)', [[alice], '']))
    await asUser(outsider)
    await assert.rejects(db.query('select public.community_start_chat($1::uuid[], $2)', [[alice, bob], 'Bypass block']))
    await asUser(alice)
    await db.query('delete from public.community_blocks where blocker_id=$1 and blocked_id=$2', [alice, bob])
  })

  await context.test('group membership and leaving are enforced', async () => {
    await asUser(alice)
    group = (await db.query('select public.community_start_chat($1::uuid[], $2) as id', [[bob, outsider], 'Exhibition group'])).rows[0].id
    assert.equal((await db.query('select * from public.community_participants where conversation_id=$1', [group])).rows.length, 3)
    await asUser(outsider)
    await db.query('select public.community_leave_chat($1)', [group])
    await assert.rejects(db.query('insert into public.community_messages(conversation_id,sender_id,body) values($1,$2,$3)', [group, outsider, 'Former member']))
    await assert.rejects(db.query('select public.community_leave_chat($1)', [group]))
  })

  await context.test('publishing requires owned media and prevents author or timestamp spoofing', async () => {
    await asUser(alice)
    const path = `${alice}/framed.jpg`
    await db.query("insert into storage.objects(bucket_id,name) values('community-media',$1)", [path])
    post = (await db.query("insert into public.community_posts(author_id,kind,title,image_path) values($1,'art','Framed study',$2) returning id", [alice, path])).rows[0].id
    await asUser(bob)
    await assert.rejects(db.query("insert into public.community_posts(author_id,kind,title,image_path) values($1,'art','Spoof',$2)", [alice, path]))
    await assert.rejects(db.query("insert into public.community_posts(author_id,kind,title,image_path) values($1,'art','Stolen media',$2)", [bob, path]))
    await asUser(alice)
    await assert.rejects(db.query("insert into public.community_posts(author_id,kind,title,image_path,created_at) values($1,'art','Fake time',$2,now())", [alice, path]))
    await asUser(null)
    assert.equal((await db.query('select * from public.community_posts')).rows.length, 1)
    await assert.rejects(db.query('select * from public.community_messages'))
  })

  await context.test('one rating per user, score bounds, and no self-rating', async () => {
    await asUser(alice)
    await assert.rejects(db.query('insert into public.community_ratings(post_id,user_id,score) values($1,$2,10)', [post, alice]))
    await asUser(bob)
    await assert.rejects(db.query('insert into public.community_ratings(post_id,user_id,score) values($1,$2,11)', [post, bob]))
    await db.query('insert into public.community_ratings(post_id,user_id,score) values($1,$2,8)', [post, bob])
    await assert.rejects(db.query('insert into public.community_ratings(post_id,user_id,score) values($1,$2,9)', [post, bob]))
    await db.query('update public.community_ratings set score=9 where post_id=$1 and user_id=$2', [post, bob])
    await asUser(outsider)
    assert.equal((await db.query('update public.community_ratings set score=1 where post_id=$1 returning *', [post])).rows.length, 0)
  })

  await context.test('comments cannot be spoofed, private reports are visible only to reporter and admin', async () => {
    await asUser(bob)
    await db.query('insert into public.community_comments(post_id,author_id,body) values($1,$2,$3)', [post, bob, 'Beautiful frame'])
    await assert.rejects(db.query('insert into public.community_comments(post_id,author_id,body) values($1,$2,$3)', [post, alice, 'Spoofed comment']))
    await db.query('insert into public.community_reports(reporter_id,target_user_id,post_id,reason) values($1,$2,$3,$4)', [bob, alice, post, 'Please review this publication.'])
    await asUser(alice)
    assert.equal((await db.query('select * from public.community_reports')).rows.length, 0)
    await asUser(admin)
    const reports = await db.query('select * from public.community_reports')
    assert.equal(reports.rows.length, 1)
    await db.query('update public.community_reports set resolved=true where id=$1', [reports.rows[0].id])
  })

  await context.test('events require chronological timestamps and valid location/link details', async () => {
    await asUser(alice)
    const path = `${alice}/framed.jpg`
    await assert.rejects(db.query("insert into public.community_posts(author_id,kind,title,image_path,starts_at,event_type,location) values($1,'event','Missing end',$2,now(),'studio','Main Studio')", [alice, path]))
    await assert.rejects(db.query("insert into public.community_posts(author_id,kind,title,image_path,starts_at,ends_at,event_type,online_url) values($1,'event','Unsafe link',$2,now(),now()+interval '1 hour','contest','javascript:alert(1)')", [alice, path]))
    await assert.rejects(db.query("insert into public.community_posts(author_id,kind,title,image_path,starts_at,ends_at,event_type,location,timezone) values($1,'event','Invalid zone',$2,now(),now()+interval '1 hour','studio','Main Studio','Not/AZone')", [alice, path]))
    eventPost = (await db.query("insert into public.community_posts(author_id,kind,title,image_path,starts_at,ends_at,event_type,location) values($1,'event','Studio opening',$2,now(),now()+interval '1 hour','studio','Main Studio, London') returning id", [alice, path])).rows[0].id
    await asUser(bob)
    await assert.rejects(db.query('insert into public.community_ratings(post_id,user_id,score) values($1,$2,8)', [eventPost, bob]))
  })

  await context.test('only publisher or administrator can remove a publication', async () => {
    await asUser(outsider)
    assert.equal((await db.query('delete from public.community_posts where id=$1 returning id', [post])).rows.length, 0)
    await asUser(admin)
    assert.equal((await db.query('delete from public.community_posts where id=$1 returning id', [post])).rows.length, 1)
    await asUser(alice)
    assert.equal((await db.query('delete from public.community_posts where id=$1 returning id', [eventPost])).rows.length, 1)
  })
})