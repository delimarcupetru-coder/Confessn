import { useEffect, useRef, useState } from 'react'
import { addMonths, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Flag, MessageCircle, MessageSquare, Pencil, Plus, Send, ShieldBan, Star, Trash2, Users, X } from 'lucide-react'
import { supabase } from './supabase'
import './Community.css'

type Member = { user_id: string; username: string }
type Conversation = { id: string; title: string; is_group: boolean; owner_id: string }
type Message = { id: string; sender_id: string; body: string; created_at: string }
export type CommunityPost = {
  id: string; author_id: string; kind: 'art' | 'event'; title: string; description: string;
  image_path: string; created_at: string; starts_at: string | null; ends_at: string | null;
  location: string; online_url: string; event_type: string; timezone: string;
  community_members: { username: string } | null
}
type Comment = { id: string; author_id: string; body: string; created_at: string; community_members: { username: string } | null }
type Rating = { user_id: string; score: number }
type Report = { id: string; target_user_id: string; post_id: string | null; reason: string; created_at: string }

const imageUrl = (path: string) => supabase.storage.from('community-media').getPublicUrl(path).data.publicUrl
const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message) }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.'
const safeUrl = (value: string) => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : '' } catch { return '' } }
const dateTime = (value: string, timeZone?: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone })
const occursOn = (event: CommunityPost, date: Date) => Boolean(event.starts_at && event.ends_at && new Date(event.starts_at) <= endOfDay(date) && new Date(event.ends_at) > startOfDay(date))

export async function uploadCommunityImage(blob: Blob, userId: string) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) || blob.size > 5 * 1024 * 1024) throw new Error('Choose a JPG, PNG, or WebP image smaller than 5 MB.')
  const path = `${userId}/${crypto.randomUUID()}.${blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'}`
  const { error } = await supabase.storage.from('community-media').upload(path, blob, { contentType: blob.type })
  fail(error)
  return path
}

function PostRating({ post, userId, compact = false, onSignIn, version = 0, onRated }: { post: CommunityPost; userId: string | null; compact?: boolean; onSignIn?: () => void; version?: number; onRated?: () => void }) {
  const [ratings, setRatings] = useState<Rating[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void supabase.from('community_ratings').select('user_id,score').eq('post_id', post.id).then(result => {
      if (!active) return
      if (result.error) setError(result.error.message)
      else { setRatings(result.data ?? []); setError('') }
    })
    return () => { active = false }
  }, [post.id, userId, version])
  const mine = ratings.find(rating => rating.user_id === userId)
  const average = ratings.length ? (ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length).toFixed(1) : '-'
  return <div className={compact ? 'community-rating community-rating-compact' : 'community-rating'}>
    <span className="community-rating-average" title={`${ratings.length} ratings`}><Star size={15} /><strong>{average}</strong><small>({ratings.length})</small></span>
    {userId ? <select aria-label={compact ? `Rate ${post.title}` : 'Your rating'} title={post.author_id === userId ? 'You cannot rate your own post' : 'Rate from 1 to 10'} value={mine?.score ?? ''} disabled={busy || post.author_id === userId} onChange={event => {
      const score = Number(event.target.value)
      setBusy(true); setError('')
      void (async () => {
        try {
          const result = mine ? await supabase.from('community_ratings').update({ score }).eq('user_id', userId).eq('post_id', post.id) : await supabase.from('community_ratings').insert({ user_id: userId, post_id: post.id, score })
          fail(result.error)
          setRatings(current => [...current.filter(rating => rating.user_id !== userId), { user_id: userId, score }])
          onRated?.()
        } catch (issue) { setError(errorText(issue)) } finally { setBusy(false) }
      })()
    }}><option value="" disabled>Rate</option>{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select> : <button type="button" onClick={onSignIn}>Rate</button>}
    {error && <span role="alert" className="community-inline-error">{error}</span>}
  </div>
}

function QuickComment({ post, userId, onSignIn }: { post: CommunityPost; userId: string | null; onSignIn: () => void }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  return <details className="community-quick-comment"><summary><MessageSquare size={15} /> Comment</summary>
    {userId ? <form onSubmit={event => { event.preventDefault(); setBusy(true); setError(''); setNotice(''); void (async () => {
      try { const result = await supabase.from('community_comments').insert({ post_id: post.id, author_id: userId, body: body.trim() }); fail(result.error); setBody(''); setNotice('Comment posted.') }
      catch (issue) { setError(errorText(issue)) } finally { setBusy(false) }
    })() }}><textarea aria-label={`Comment on ${post.title}`} required maxLength={2000} value={body} onChange={event => setBody(event.target.value)} /><button type="submit" disabled={busy || !body.trim()} aria-label={`Post comment on ${post.title}`} title="Post comment"><Send size={15} /></button></form> : <button type="button" onClick={onSignIn}>Sign in to comment</button>}
    {notice && <span role="status">{notice}</span>}{error && <span role="alert" className="community-inline-error">{error}</span>}
  </details>
}

function PostEditor({ post, userId, onSaved, onCancel }: { post: CommunityPost; userId: string; onSaved: (post: CommunityPost) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(post.title)
  const [description, setDescription] = useState(post.description)
  const [image, setImage] = useState<File | null>(null)
  const [start, setStart] = useState(post.starts_at ? format(new Date(post.starts_at), "yyyy-MM-dd'T'HH:mm") : '')
  const [end, setEnd] = useState(post.ends_at ? format(new Date(post.ends_at), "yyyy-MM-dd'T'HH:mm") : '')
  const [type, setType] = useState(post.event_type)
  const [location, setLocation] = useState(post.location)
  const [url, setUrl] = useState(post.online_url)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <form className="community-post-editor" aria-label="Edit post" onSubmit={event => {
    event.preventDefault(); setBusy(true); setError('')
    void (async () => {
      let uploaded: string | null = null
      let saved = false
      try {
        const eventFields: Partial<CommunityPost> = {}
        if (post.kind === 'event') {
          const begins = new Date(start), finishes = new Date(end)
          if (!Number.isFinite(begins.getTime()) || !Number.isFinite(finishes.getTime()) || finishes <= begins) throw new Error('The event must end after it starts.')
          if (type !== 'studio' && !safeUrl(url)) throw new Error('Enter a valid HTTPS event link.')
          Object.assign(eventFields, { starts_at: begins.toISOString(), ends_at: finishes.toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, event_type: type, location: type === 'studio' ? location.trim() : '', online_url: type === 'studio' ? '' : safeUrl(url) })
        }
        if (image) uploaded = await uploadCommunityImage(image, userId)
        const result = await supabase.from('community_posts').update({ title: title.trim(), description: description.trim(), image_path: uploaded ?? post.image_path, ...eventFields }).eq('id', post.id).eq('author_id', userId).select('*,community_members:community_members!community_posts_author_id_fkey(username)').single()
        fail(result.error)
        if (!result.data) throw new Error('The post could not be updated.')
        saved = true
        if (uploaded) await supabase.storage.from('community-media').remove([post.image_path])
        onSaved(result.data as CommunityPost)
      } catch (issue) {
        if (uploaded && !saved) await supabase.storage.from('community-media').remove([uploaded])
        setError(errorText(issue))
      } finally { setBusy(false) }
    })()
  }}>
    <h3>Edit post</h3>
    <label>Title<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label>
    <label>Description<textarea maxLength={5000} value={description} onChange={event => setDescription(event.target.value)} /></label>
    <label>Replace image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setImage(event.target.files?.[0] ?? null)} /></label>
    {post.kind === 'event' && <>
      <label>Type<select value={type} onChange={event => setType(event.target.value)}><option value="studio">Studio event</option><option value="online">Online event</option><option value="contest">Online contest</option></select></label>
      <p className="community-timezone">{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
      <label>Starts<input required type="datetime-local" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>Ends<input required type="datetime-local" value={end} onChange={event => setEnd(event.target.value)} /></label>
      {type === 'studio' ? <label>Studio / address<input required maxLength={300} value={location} onChange={event => setLocation(event.target.value)} /></label> : <label>Event link<input required type="url" maxLength={1000} value={url} onChange={event => setUrl(event.target.value)} /></label>}
    </>}
    {error && <p role="alert" className="community-error">{error}</p>}
    <div className="community-detail-actions"><button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button><button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>
}

export function Community({ userId, open, onClose, onConnect, initialUser, onPublished, isAdmin = false }: {
  userId: string | null; open: boolean; onClose: () => void; onConnect: () => void;
  initialUser: string | null; onPublished: () => void; isAdmin?: boolean
}) {
  const [tab, setTab] = useState<'chat' | 'planning'>('chat')
  const [members, setMembers] = useState<Member[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [participants, setParticipants] = useState<string[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [blocks, setBlocks] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [groupTitle, setGroupTitle] = useState('')
  const [groupMembers, setGroupMembers] = useState<string[]>([])
  const [groupOpen, setGroupOpen] = useState(false)
  const [month, setMonth] = useState(new Date())
  const [day, setDay] = useState(new Date())
  const [events, setEvents] = useState<CommunityPost[]>([])
  const [eventOpen, setEventOpen] = useState(false)
  const [eventTitle, setEventTitle] = useState('')
  const [description, setDescription] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [eventType, setEventType] = useState('studio')
  const [location, setLocation] = useState('')
  const [onlineUrl, setOnlineUrl] = useState('')
  const [poster, setPoster] = useState<File | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CommunityPost | null>(null)
  const [reportTarget, setReportTarget] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [reports, setReports] = useState<Report[]>([])
  const [communityAdmin, setCommunityAdmin] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const eventForm = useRef<HTMLFormElement>(null)
  const identity = useRef(userId)
  identity.current = userId
  const conversation = conversations.find(item => item.id === selected)
  const username = (id: string) => members.find(member => member.user_id === id)?.username ?? 'Member'
  const label = (item: Conversation) => item.is_group ? item.title : item.title || 'Direct chat'
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); setNotice(''); try { await action() } catch (issue) { setError(errorText(issue)) } finally { setBusy(false) } }

  const load = async () => {
    if (!userId) return
    const [directory, chats, blocked, planned, moderator] = await Promise.all([
      supabase.from('community_members').select('user_id,username').order('username'),
      supabase.rpc('community_conversations'),
      supabase.from('community_blocks').select('blocked_id').eq('blocker_id', userId),
      supabase.from('community_posts').select('*,community_members:community_members!community_posts_author_id_fkey(username)').eq('kind', 'event').gte('ends_at', startOfWeek(startOfMonth(month), { weekStartsOn: 1 }).toISOString()).lte('starts_at', endOfWeek(endOfMonth(month), { weekStartsOn: 1 }).toISOString()).order('starts_at').limit(1000),
      supabase.rpc('community_is_admin'),
    ])
    for (const result of [directory, chats, blocked, planned]) fail(result.error)
    if (identity.current !== userId) return
    setMembers(directory.data ?? []); setConversations(chats.data ?? []); setBlocks((blocked.data ?? []).map(item => item.blocked_id)); setEvents(planned.data as CommunityPost[] ?? [])
    setCommunityAdmin(!moderator.error && moderator.data === true)
  }

  useEffect(() => {
    setMembers([]); setConversations([]); setMessages([]); setBlocks([]); setSelected(null); setDraft(''); setReports([]); setParticipants([]); setCommunityAdmin(false)
  }, [userId])

  useEffect(() => {
    if (open && tab === 'planning' && eventOpen) {
      eventForm.current?.querySelector('input')?.focus()
      eventForm.current?.closest('.community-planning')?.scrollTo({ top: 0 })
    }
  }, [open, tab, eventOpen])

  useEffect(() => {
    if (!open || !userId) return
    let active = true
    const refresh = () => { void load().catch(issue => { if (active) setError(errorText(issue)) }) }
    refresh()
    const timer = window.setInterval(refresh, 10000)
    return () => { active = false; window.clearInterval(timer) }
  }, [open, userId, month])

  useEffect(() => {
    if (!open || !userId || !selected) { setMessages([]); setParticipants([]); return }
    let active = true
    setMessages([]); setParticipants([])
    const refresh = async () => {
      const [history, people] = await Promise.all([
        supabase.from('community_messages').select('id,sender_id,body,created_at').eq('conversation_id', selected).order('created_at', { ascending: false }).limit(200),
        supabase.from('community_participants').select('user_id').eq('conversation_id', selected),
      ])
      if (!active) return
      fail(history.error); fail(people.error)
      setMessages((history.data ?? []).reverse()); setParticipants((people.data ?? []).map(item => item.user_id))
    }
    const update = () => { void refresh().catch(issue => { if (active) setError(errorText(issue)) }) }
    update()
    const timer = window.setInterval(update, 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [open, userId, selected])

  useEffect(() => {
    if (!open || !userId || !initialUser || initialUser === userId) return
    let active = true
    void supabase.rpc('community_start_chat', { p_members: [initialUser], p_title: '' }).then(({ data, error: issue }) => {
      if (!active) return
      if (issue) setError(issue.message)
      else { setSelected(data); setTab('chat'); void load().catch(problem => setError(errorText(problem))) }
    })
    return () => { active = false }
  }, [open, userId, initialUser])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []).filter(node => node.getClientRects().length)
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', handler)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = overflow; previous?.focus() }
  }, [open])

  if (!open) return null
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) })
  const selectedEvents = events.filter(event => occursOn(event, day))
  return <div className="community-overlay"><div className="community-panel" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Messages and planning">
    <header className="community-heading"><h2>Messages</h2><button type="button" className="community-icon" onClick={onClose} aria-label="Close messages" title="Close"><X size={20} /></button></header>
    <div role="tablist" aria-label="Community views" className="community-tabs">
      <button type="button" role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}><MessageCircle size={17} /> Chat</button>
      <button type="button" role="tab" aria-selected={tab === 'planning'} onClick={() => setTab('planning')}><CalendarDays size={17} /> Planning</button>
    </div>
    {error && <p role="alert" className="community-error">{error} <button type="button" onClick={() => void run(load)}>Retry</button></p>}
    {notice && <p role="status">{notice}</p>}
    {!userId ? <div className="community-empty"><button type="button" onClick={onConnect}>Sign in</button></div> : tab === 'chat' ? <div className="community-chat" role="tabpanel" aria-label="Chat">
      <aside className="community-directory"><input aria-label="Search users" placeholder="Search users" value={search} onChange={event => setSearch(event.target.value)} />
        <button type="button" onClick={() => setGroupOpen(!groupOpen)}><Users size={16} /> New group</button>
        {groupOpen && <form onSubmit={event => { event.preventDefault(); void run(async () => { const result = await supabase.rpc('community_start_chat', { p_members: groupMembers, p_title: groupTitle.trim() }); fail(result.error); setSelected(result.data); setGroupOpen(false); setGroupMembers([]); setGroupTitle(''); await load() }) }}>
          <label>Group name<input required maxLength={100} value={groupTitle} onChange={event => setGroupTitle(event.target.value)} /></label>
          {members.filter(member => member.user_id !== userId && !blocks.includes(member.user_id)).map(member => <label className="community-check" key={member.user_id}><input type="checkbox" checked={groupMembers.includes(member.user_id)} onChange={event => setGroupMembers(event.target.checked ? [...groupMembers, member.user_id] : groupMembers.filter(id => id !== member.user_id))} />{member.username}</label>)}
          <button disabled={busy || groupMembers.length < 2} type="submit">Create group</button>
        </form>}
        <h3>Conversations</h3>{conversations.map(chat => <button type="button" key={chat.id} className={selected === chat.id ? 'selected' : ''} onClick={() => { setSelected(chat.id); setDraft('') }}>{chat.is_group ? <Users size={16} /> : <MessageCircle size={16} />}{label(chat)}</button>)}
        <h3>Members</h3>{members.filter(member => member.user_id !== userId && member.username.toLowerCase().includes(search.toLowerCase())).map(member => <div className="community-person" key={member.user_id}>
          <button type="button" disabled={blocks.includes(member.user_id) || busy} onClick={() => void run(async () => { const result = await supabase.rpc('community_start_chat', { p_members: [member.user_id], p_title: '' }); fail(result.error); setSelected(result.data); await load() })}>{member.username}</button>
          <button type="button" className="community-icon" title={blocks.includes(member.user_id) ? 'Unblock user' : 'Block user'} aria-label={`${blocks.includes(member.user_id) ? 'Unblock' : 'Block'} ${member.username}`} disabled={busy} onClick={() => void run(async () => { const result = blocks.includes(member.user_id) ? await supabase.from('community_blocks').delete().eq('blocker_id', userId).eq('blocked_id', member.user_id) : await supabase.from('community_blocks').insert({ blocker_id: userId, blocked_id: member.user_id }); fail(result.error); await load(); setNotice('Block settings updated.') })}><ShieldBan size={15} /></button>
          <button type="button" className="community-icon" title="Report user" aria-label={`Report ${member.username}`} onClick={() => setReportTarget(member.user_id)}><Flag size={15} /></button>
        </div>)}
      </aside>
      <section className="community-thread"><header><h3>{conversation ? label(conversation) : 'Conversations'}</h3>{conversation && <button type="button" disabled={busy} onClick={() => void run(async () => { const result = await supabase.rpc('community_leave_chat', { p_conversation: selected }); fail(result.error); setSelected(null); await load() })}>Leave chat</button>}</header>
        {conversation && <p className="community-participants">{participants.map(username).join(', ')}</p>}
        <div className="community-history" role="log" aria-label="Conversation messages" aria-live="polite">{messages.map(message => <article key={message.id} className={message.sender_id === userId ? 'own' : ''}><strong>{username(message.sender_id)}</strong><p>{message.body}</p><time dateTime={message.created_at}>{dateTime(message.created_at)}</time></article>)}{selected && !messages.length && <p>No messages yet.</p>}</div>
        <form className="community-composer" onSubmit={event => { event.preventDefault(); const text = draft.trim(); if (!text || !selected) return; void run(async () => { const result = await supabase.from('community_messages').insert({ conversation_id: selected, sender_id: userId, body: text }).select('id,sender_id,body,created_at').single(); fail(result.error); const sent = result.data; if (!sent) throw new Error('Message was not returned by the server.'); setMessages(current => [...current.filter(message => message.id !== sent.id), sent]); setDraft('') }) }}>
          <textarea aria-label="Message" placeholder="Message" maxLength={4000} value={draft} onChange={event => setDraft(event.target.value)} disabled={!selected || busy} /><button type="submit" className="community-icon" title="Send message" aria-label="Send message" disabled={!selected || !draft.trim() || busy}><Send size={20} /></button>
        </form>
      </section>
    </div> : <section role="tabpanel" aria-label="Planning" className="community-planning">
      <div className="community-calendar-toolbar"><button type="button" className="community-icon" title="Previous month" aria-label="Previous month" disabled={eventOpen} onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft /></button><h3>{format(month, 'MMMM yyyy')}</h3><button type="button" className="community-icon" title="Next month" aria-label="Next month" disabled={eventOpen} onClick={() => setMonth(addMonths(month, 1))}><ChevronRight /></button><button type="button" disabled={eventOpen} onClick={() => { setMonth(new Date()); setDay(new Date()) }}>Today</button><button type="button" aria-expanded={eventOpen} aria-controls="community-event-editor" disabled={eventOpen || busy} onClick={() => { setStart(`${format(day, 'yyyy-MM-dd')}T10:00`); setEnd(`${format(day, 'yyyy-MM-dd')}T11:00`); setError(''); setNotice(''); setEventOpen(true) }}><Plus size={16} /> Add Event</button></div>
      {!eventOpen && <div className="community-calendar" role="group" aria-label="Calendar">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(name => <span className="weekday" key={name}>{name}</span>)}{days.map(date => { const count = events.filter(event => occursOn(event, date)).length; return <button type="button" key={date.toISOString()} className={`${isSameMonth(date, month) ? '' : 'outside'} ${isSameDay(date, day) ? 'selected' : ''}`} aria-label={`${format(date, 'EEEE, MMMM d, yyyy')}${count ? `, ${count} events` : ''}`} aria-pressed={isSameDay(date, day)} onClick={() => setDay(date)}><span>{format(date, 'd')}</span>{count > 0 && <small>{count}</small>}</button> })}</div>}
      <p className="community-timezone">{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
      {eventOpen && <form id="community-event-editor" ref={eventForm} className="community-event-form" onSubmit={event => { event.preventDefault(); void run(async () => {
        const startDate = new Date(start), endDate = new Date(end)
        if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) throw new Error('The event must end after it starts.')
        if (!poster) throw new Error('Choose an event poster.')
        if (eventType !== 'studio' && !safeUrl(onlineUrl)) throw new Error('Enter a valid HTTPS event link.')
        const path = await uploadCommunityImage(poster, userId)
        const result = await supabase.from('community_posts').insert({ author_id: userId, kind: 'event', title: eventTitle.trim(), description: description.trim(), image_path: path, starts_at: startDate.toISOString(), ends_at: endDate.toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, event_type: eventType, location: eventType === 'studio' ? location.trim() : '', online_url: eventType !== 'studio' ? safeUrl(onlineUrl) : '' })
        if (result.error) { await supabase.storage.from('community-media').remove([path]); fail(result.error) }
        setEventOpen(false); setEventTitle(''); setDescription(''); setPoster(null); setMonth(startDate); setDay(startDate); onPublished(); setNotice('Event published.')
      }) }}>
        <h3>Add Event</h3><label>Title<input required maxLength={120} value={eventTitle} onChange={event => setEventTitle(event.target.value)} /></label>
        <label>Type<select value={eventType} onChange={event => setEventType(event.target.value)}><option value="studio">Studio event</option><option value="online">Online event</option><option value="contest">Online contest</option></select></label>
        <label>Starts<input required type="datetime-local" value={start} onChange={event => setStart(event.target.value)} /></label><label>Ends<input required type="datetime-local" value={end} onChange={event => setEnd(event.target.value)} /></label>
        {eventType === 'studio' ? <label>Studio / address<input required maxLength={300} value={location} onChange={event => setLocation(event.target.value)} /></label> : <label>Event link<input required type="url" maxLength={1000} value={onlineUrl} onChange={event => setOnlineUrl(event.target.value)} /></label>}
        <label>Description<textarea required maxLength={5000} value={description} onChange={event => setDescription(event.target.value)} /></label><label>Poster<input required type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setPoster(event.target.files?.[0] ?? null)} /></label>
        <button disabled={busy} type="submit">{busy ? 'Publishing...' : 'Publish event'}</button><button type="button" disabled={busy} onClick={() => setEventOpen(false)}>Cancel</button>
      </form>}
      <h3>{format(day, 'EEEE, MMMM d')}</h3>{!selectedEvents.length && <p>No events scheduled.</p>}<div className="community-agenda">{selectedEvents.map(event => <button type="button" key={event.id} onClick={() => setSelectedEvent(event)}><img src={imageUrl(event.image_path)} alt="" /><span><strong>{event.title}</strong><time>{event.starts_at && dateTime(event.starts_at)}</time><span>{event.community_members?.username}</span></span></button>)}</div>
    </section>}
    {reportTarget && <form className="community-report" onSubmit={event => { event.preventDefault(); void run(async () => { const result = await supabase.from('community_reports').insert({ reporter_id: userId, target_user_id: reportTarget, reason: reason.trim() }); fail(result.error); setReportTarget(null); setReason(''); setNotice('Report sent to the administrators.') }) }}><h3>Report user</h3><label>Reason<textarea required minLength={5} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label><button type="submit" disabled={busy}>Submit report</button><button type="button" onClick={() => setReportTarget(null)}>Cancel</button></form>}
    {(isAdmin || communityAdmin) && <details className="community-moderation"><summary onClick={() => void run(async () => { const result = await supabase.from('community_reports').select('*').eq('resolved', false).order('created_at'); fail(result.error); setReports(result.data ?? []) })}>Moderation reports</summary>{reports.map(report => <article key={report.id}><strong>{username(report.target_user_id)}</strong><p>{report.reason}</p>{report.post_id && <button type="button" onClick={() => void run(async () => { const result = await supabase.from('community_posts').delete().eq('id', report.post_id); fail(result.error); onPublished(); setNotice('Reported publication removed.') })}>Remove publication</button>}<button type="button" onClick={() => void run(async () => { const result = await supabase.from('community_reports').update({ resolved: true }).eq('id', report.id); fail(result.error); setReports(current => current.filter(item => item.id !== report.id)) })}>Resolve</button></article>)}</details>}
    {selectedEvent && <PublicationDetails post={selectedEvent} userId={userId} onClose={() => setSelectedEvent(null)} onChat={id => { setSelectedEvent(null); setTab('chat'); void run(async () => { const result = await supabase.rpc('community_start_chat', { p_members: [id], p_title: '' }); fail(result.error); setSelected(result.data); await load() }) }} onChanged={() => { onPublished(); void run(load) }} onEdited={updated => { setSelectedEvent(updated); setEvents(current => current.map(item => item.id === updated.id ? updated : item)); onPublished() }} />}
  </div></div>
}

export function CommunityFeed({ userId, version, onChat, onSignIn, onCount }: { userId: string | null; version: number; onChat: (id: string) => void; onSignIn: () => void; onCount: (count: number) => void }) {
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [selected, setSelected] = useState<CommunityPost | null>(null)
  const [error, setError] = useState('')
  const [pageSize, setPageSize] = useState(12)
  const [refresh, setRefresh] = useState(0)
  const [ratingVersion, setRatingVersion] = useState(0)
  useEffect(() => {
    let active = true
    setPosts([]); setSelected(null)
    void supabase.from('community_posts').select('*,community_members:community_members!community_posts_author_id_fkey(username)').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize).then(({ data, error: issue }) => {
      if (!active) return
      if (issue) setError(issue.code === '42P01' || issue.code === 'PGRST205' ? 'Community publishing is not yet available.' : issue.message)
      else { setError(''); setPosts(data as CommunityPost[] ?? []); onCount(data?.length ?? 0) }
    })
    return () => { active = false }
  }, [userId, version, pageSize, refresh])
  return <div className="community-feed">{error && <p role="status">{error}</p>}<div className="community-feed-grid">{posts.map(post => <article key={post.id} className="community-post">
    <button type="button" className="community-post-image" onClick={() => setSelected(post)} aria-label={`Open ${post.title}`}><img loading="lazy" src={imageUrl(post.image_path)} alt={post.title} /></button>
    <div className="community-post-copy">
      {post.kind === 'event' && <span className="community-kind">{post.event_type === 'contest' ? 'Contest' : 'Event'}</span>}
      <button type="button" className="community-post-title" onClick={() => setSelected(post)}>{post.title}</button>
      <div className="community-post-byline"><strong>{post.community_members?.username ?? 'Member'}</strong><time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString()}</time></div>
      <div className="community-card-actions">
        {post.kind === 'art' && <PostRating post={post} userId={userId} compact onSignIn={onSignIn} version={ratingVersion} />}
        <button type="button" className="community-small-message" title={`Message ${post.community_members?.username ?? 'publisher'}`} aria-label={`Message publisher of ${post.title}`} onClick={() => userId ? onChat(post.author_id) : onSignIn()} disabled={post.author_id === userId}><MessageCircle size={15} /> Message</button>
      </div>
      <QuickComment post={post} userId={userId} onSignIn={onSignIn} />
    </div>
  </article>)}</div>{posts.length === pageSize && <button type="button" onClick={() => setPageSize(current => current + 12)}>Load more</button>}{selected && <PublicationDetails post={selected} userId={userId} onClose={() => setSelected(null)} onChat={onChat} onSignIn={onSignIn} onChanged={() => { setSelected(null); setRefresh(current => current + 1) }} onEdited={updated => { setSelected(updated); setPosts(current => current.map(item => item.id === updated.id ? updated : item)) }} onRated={() => setRatingVersion(current => current + 1)} />}</div>
}

function PublicationDetails({ post, userId, onClose, onChat, onSignIn, onChanged, onEdited, onRated }: { post: CommunityPost; userId: string | null; onClose: () => void; onChat: (id: string) => void; onSignIn?: () => void; onChanged: () => void; onEdited: (post: CommunityPost) => void; onRated?: () => void }) {
  const [comments, setComments] = useState<Comment[]>([])
  const [editing, setEditing] = useState(false)
  const [comment, setComment] = useState('')
  const [report, setReport] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const load = async () => {
    const responses = await supabase.from('community_comments').select('*,community_members:community_members!community_comments_author_id_fkey(username)').eq('post_id', post.id).order('created_at').limit(200)
    fail(responses.error); setComments(responses.data as Comment[] ?? [])
  }
  useEffect(() => { void load().catch(issue => setError(errorText(issue))) }, [post.id, userId])
  const connect = () => { onClose(); if (userId) onChat(post.author_id); else onSignIn?.() }
  const act = async (action: () => Promise<void>) => { setBusy(true); setError(''); try { await action() } catch (issue) { setError(errorText(issue)) } finally { setBusy(false) } }
  return <div className="community-detail-overlay"><section className="community-detail" role="dialog" aria-modal="true" aria-label={post.title}><header><h2>{post.title}</h2><button type="button" className="community-icon" onClick={onClose} title="Close publication" aria-label="Close publication"><X /></button></header><img className="community-detail-image" src={imageUrl(post.image_path)} alt={post.title} /><p><strong>{post.community_members?.username ?? 'Member'}</strong> · {dateTime(post.created_at)}</p><p className="community-description">{post.description}</p>
    {post.kind === 'event' && <div className="community-event-details"><p>{post.starts_at && dateTime(post.starts_at, post.timezone)} – {post.ends_at && dateTime(post.ends_at, post.timezone)} ({post.timezone})</p>{post.location && <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(post.location)}`}>{post.location} · Google Maps</a>}{safeUrl(post.online_url) && <a href={safeUrl(post.online_url)} target="_blank" rel="noreferrer">Open event</a>}</div>}
    {error && <p role="alert" className="community-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {userId === post.author_id && <button type="button" className="community-edit-button" onClick={() => setEditing(!editing)} disabled={busy}><Pencil size={14} /> Edit post</button>}
    {editing && userId === post.author_id && <PostEditor post={post} userId={userId} onCancel={() => setEditing(false)} onSaved={updated => { onEdited(updated); setEditing(false); setNotice('Post updated.') }} />}
    <div className="community-detail-actions"><button type="button" disabled={post.author_id === userId} onClick={connect}><MessageCircle size={16} /> Message {post.community_members?.username}</button>{userId && userId !== post.author_id && <><button type="button" disabled={busy} onClick={() => void act(async () => { const result = await supabase.from('community_blocks').upsert({ blocker_id: userId, blocked_id: post.author_id }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }); fail(result.error); onChanged() })}><ShieldBan size={16} /> Block</button><button type="button" onClick={() => setReport(!report)}><Flag size={16} /> Report</button></>}{userId === post.author_id && <button type="button" disabled={busy} onClick={() => { if (window.confirm('Remove this publication from the public feed?')) void act(async () => { const result = await supabase.from('community_posts').delete().eq('id', post.id); fail(result.error); await supabase.storage.from('community-media').remove([post.image_path]); onChanged() }) }}><Trash2 size={16} /> Unpublish</button>}</div>
    {report && <form onSubmit={event => { event.preventDefault(); void act(async () => { const result = await supabase.from('community_reports').insert({ reporter_id: userId, target_user_id: post.author_id, post_id: post.id, reason: reason.trim() }); fail(result.error); setReport(false); setNotice('Report sent to administrators.') }) }}><label>Report reason<textarea required minLength={5} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label><button type="submit" disabled={busy}>Submit report</button></form>}
    {post.kind === 'art' && <PostRating post={post} userId={userId} compact onSignIn={connect} onRated={onRated} />}
    <h3>Comments</h3><div className="community-comments">{comments.map(item => <article key={item.id}><strong>{item.community_members?.username ?? 'Member'}</strong><p>{item.body}</p><time>{dateTime(item.created_at)}</time>{item.author_id === userId && <button type="button" className="community-icon" title="Delete comment" aria-label="Delete comment" onClick={() => void act(async () => { const result = await supabase.from('community_comments').delete().eq('id', item.id); fail(result.error); await load() })}><Trash2 size={14} /></button>}</article>)}</div>
    {userId ? <form onSubmit={event => { event.preventDefault(); void act(async () => { const result = await supabase.from('community_comments').insert({ post_id: post.id, author_id: userId, body: comment.trim() }); fail(result.error); setComment(''); await load() }) }}><label>Comment<textarea required maxLength={2000} value={comment} onChange={event => setComment(event.target.value)} /></label><button type="submit" disabled={busy || !comment.trim()}>Post comment</button></form> : <button type="button" onClick={connect}>Sign in to rate or comment</button>}
  </section></div>
}