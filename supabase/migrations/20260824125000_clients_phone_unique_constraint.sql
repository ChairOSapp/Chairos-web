-- app/book/[shopCode]/page.tsx upserts onto clients with
-- { onConflict: 'phone' }, but phone only ever had a plain (non-unique)
-- index -- Postgres rejects ON CONFLICT (phone) without a matching
-- unique constraint (42P10), so this upsert has always 400'd. No
-- duplicate phone numbers existed among the live rows at the time this
-- was applied, so this was safe to add as-is.
ALTER TABLE clients ADD CONSTRAINT clients_phone_key UNIQUE (phone);

DROP INDEX IF EXISTS clients_phone_idx;
