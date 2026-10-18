# Confessn Admin Access

## Activate the admin account

1. Confirm the intended administrator already exists in Supabase Authentication > Users. If not, create that Auth account first and confirm its email.
2. In the Supabase SQL Editor, run `supabase-profile-schema.sql` if the `user_profiles` table and its owner-only policies are not already installed.
3. Run `supabase-admin-schema.sql` to install the protected admin role and metrics functions.
4. Run this one-time grant statement, replacing the value with the existing administrator's Auth email:

  ```sql
  insert into public.confessn_admins (user_id)
  select id from auth.users
  where lower(email) = lower('ADMIN_EMAIL_HERE')
  on conflict (user_id) do nothing;
  ```

  If it inserts no row, confirm the Auth account exists and rerun the statement.
5. Sign in to Confessn as that account. The Admin tab appears after the protected role check succeeds.

Do not place a Supabase service-role key in the browser app. Admin authorization is checked by the database RPC on every metrics request; the admin-membership table is not readable by normal clients.

## Report definitions

- **Projects** counts records in each synced `user_profiles.account.projects` array.
- **Account data** reports PostgreSQL's `pg_column_size(account)` for the JSONB account payload. It is a payload-size estimate, not total database disk usage.
- **Embedded artwork** estimates decoded bytes for base64 data URLs in synced project records. Externally hosted image URLs and browser-only, unsynced projects are not included.
- Email comes from Supabase Auth. Username comes from Auth user metadata. Name prefers `full_name` or `name` metadata, then the profile account name.

The dashboard returns summary fields only. It does not return artwork contents, project notes, or full profile JSON. CSV exports contain the same summary columns and escape formula-leading text values.

## Revoke admin access

Run this in the Supabase SQL Editor:

```sql
delete from public.confessn_admins
where user_id = (
  select id from auth.users
  where lower(email) = lower('ADMIN_EMAIL_HERE')
);
```

The Admin tab will disappear after the user's next auth state refresh, and the database RPC will deny further requests immediately.
