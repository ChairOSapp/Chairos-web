-- appointments had zero indexes beyond the primary key on id, despite
-- being the highest-traffic table in the app -- every owner/staff
-- dashboard load and the public availability engine filter on
-- (shop_id, date) or (barber_id, date) and then order by time.
CREATE INDEX appointments_shop_date_time_idx ON appointments (shop_id, date, time);
CREATE INDEX appointments_barber_date_time_idx ON appointments (barber_id, date, time);

-- clientLapseDetection.ts scans appointments where status = 'done' across
-- a 180-day date range, across all shops in one query -- no shop_id to
-- filter on, so (status, date) is the useful composite here.
CREATE INDEX appointments_status_date_idx ON appointments (status, date);

-- client_shop_memberships' only index was a unique constraint on
-- (client_id, shop_id) with client_id leading -- useless for the
-- shop_id-only queries campaign audience building actually runs
-- (app/api/campaigns/audience/route.ts: .eq('shop_id', shopId) with no
-- client_id filter). shop_id-led composite serves both that and the
-- shop_id + client_id-in-list variant in the same file.
CREATE INDEX client_shop_memberships_shop_client_idx ON client_shop_memberships (shop_id, client_id);
