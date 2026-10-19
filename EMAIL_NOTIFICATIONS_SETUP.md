# Email Preferences and Admin Notifications

## Install the database objects

In Supabase SQL Editor, run `supabase-email-preferences.sql` after `supabase-profile-schema.sql` and `supabase-admin-schema.sql` have been applied. This creates:

- Per-user, per-category email preferences with row-level security.
- Signup-time consent capture from the unchecked-by-default questionnaire.
- An admin-only RPC for consent reporting.
- A locked outbox row for each newly created Auth account and each changed preference save.
- An admin-only notifications feed in the Admin account showing recent events and delivery status.

Users can change their own preferences from Account settings. Preferences only record consent; they do not send community, contest, or news campaigns.

## Configure the admin notification email

The notification function sends new-account summaries to the configured administrator. At signup, project count and account payload are initial values (normally zero), and the message says the profile is awaiting its first sync. Use the Admin report for current synced values.

1. Verify the sender domain in Resend.
2. From a trusted terminal with the Supabase CLI linked to this project, set function secrets. Replace placeholders locally; never paste these keys into chat or source control:

   ```sh
   supabase secrets set --project-ref yxqjzyvlvwzzwdvljnrd \
     RESEND_API_KEY=YOUR_RESEND_API_KEY \
     CONFESSN_ADMIN_EMAIL=pdelimarcu@gmail.com \
   CONFESSN_SENDER_EMAIL='Confessn <notifications@your-verified-domain>' \
   CONFESSN_WEBHOOK_SECRET=YOUR_LONG_RANDOM_WEBHOOK_SECRET
   ```

3. Deploy the function:

   ```sh
   supabase functions deploy notify-new-account --project-ref yxqjzyvlvwzzwdvljnrd
   ```

4. In Supabase Dashboard, create a Database Webhook for table `public.confessn_signup_email_outbox`, event `INSERT`, using POST URL:

   ```text
   https://yxqjzyvlvwzzwdvljnrd.supabase.co/functions/v1/notify-new-account
   ```

   Add header `x-confessn-webhook-secret` with the same random secret set above. The function disables JWT verification only for this webhook endpoint and validates that secret on every request.

5. Create a second Database Webhook for `public.confessn_email_preference_outbox`, event `INSERT`, with the same POST URL and `x-confessn-webhook-secret` header. This sends an admin notification only when a user explicitly presses **Save email preferences**.
6. Create a test Auth account and save a preference change. Confirm both events appear in the **Admin → Notifications** feed; after the webhooks are configured, confirm the administrator email receives both messages. Both outboxes track sent/failed state and provider message IDs; Resend idempotency keys protect against duplicate webhook delivery.

Supabase provides the service-role key to Edge Functions as a server-side environment variable for updating the outbox. Never put it in `supabase.js` or any browser bundle.
