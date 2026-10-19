type SignupOutboxRecord = {
  id: string
  email: string | null
  username: string
  name: string
  project_count: number
  account_data_bytes: number
  profile_status: string
  created_at: string
  delivery_status: 'pending' | 'sent' | 'failed'
}

type DatabaseWebhookPayload = {
  type?: string
  schema?: string
  table?: string
  record?: SignupOutboxRecord
}

const jsonResponse = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } },
)

const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

const updateOutbox = async (recordId: string, values: Record<string, unknown>) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase service configuration is missing')

  const response = await fetch(
    `${supabaseUrl}/rest/v1/confessn_signup_email_outbox?id=eq.${encodeURIComponent(recordId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(values),
    },
  )
  if (!response.ok) throw new Error('Could not update signup email delivery status')
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const expectedSecret = Deno.env.get('CONFESSN_WEBHOOK_SECRET')
  const suppliedSecret = request.headers.get('x-confessn-webhook-secret') ?? ''
  if (!expectedSecret || !constantTimeEqual(expectedSecret, suppliedSecret)) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const adminEmail = Deno.env.get('CONFESSN_ADMIN_EMAIL')
  const senderEmail = Deno.env.get('CONFESSN_SENDER_EMAIL')
  if (!resendApiKey || !adminEmail || !senderEmail) {
    return jsonResponse({ error: 'Email service is not configured' }, 503)
  }

  let payload: DatabaseWebhookPayload
  try {
    payload = await request.json() as DatabaseWebhookPayload
  } catch {
    return jsonResponse({ error: 'Invalid webhook payload' }, 400)
  }

  if (payload.type !== 'INSERT' || payload.schema !== 'public' || payload.table !== 'confessn_signup_email_outbox' || !payload.record?.id) {
    return jsonResponse({ error: 'Unexpected webhook event' }, 400)
  }

  const record = payload.record
  if (record.delivery_status === 'sent') return jsonResponse({ delivered: true, duplicate: true })

  const text = [
    'A new Confessn account was created.',
    '',
    `Email: ${record.email || 'Not provided'}`,
    `Username: ${record.username || 'Not provided'}`,
    `Name: ${record.name || 'Not provided'}`,
    `Account created: ${record.created_at}`,
    `Projects at signup: ${record.project_count}`,
    `Account data bytes at signup: ${record.account_data_bytes}`,
    `Profile status: ${record.profile_status}`,
    '',
    'Project and storage figures are initial signup values. Review the restricted Admin report for current synced account metrics.',
  ].join('\n')

  try {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `confessn-new-account-${record.id}`,
      },
      body: JSON.stringify({
        from: senderEmail,
        to: [adminEmail],
        subject: 'New Confessn account',
        text,
      }),
    })

    const providerResult = await emailResponse.json().catch(() => ({})) as { id?: string }
    if (!emailResponse.ok) {
      await updateOutbox(record.id, {
        delivery_status: 'failed',
        last_error: `Resend returned HTTP ${emailResponse.status}`,
      })
      return jsonResponse({ error: 'Email provider rejected the notification' }, 502)
    }

    await updateOutbox(record.id, {
      delivery_status: 'sent',
      delivered_at: new Date().toISOString(),
      provider_message_id: providerResult.id ?? null,
      last_error: null,
    })
    return jsonResponse({ delivered: true })
  } catch {
    try {
      await updateOutbox(record.id, { delivery_status: 'failed', last_error: 'Email delivery failed; webhook retry is safe.' })
    } catch {
      // Preserve the original delivery failure response for the webhook retry.
    }
    return jsonResponse({ error: 'Email delivery failed' }, 502)
  }
})
