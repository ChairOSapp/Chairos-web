-- Supabase's performance advisor flagged these foreign keys as
-- uncovered. appointments.client_id backs real query traffic (client
-- detail pages filter appointment history by client_id); the rest are
-- cheap cascade/join hygiene on small tables rather than known hot
-- queries, but worth closing while already in this table.
CREATE INDEX appointments_client_id_idx ON appointments (client_id);
CREATE INDEX appointments_service_id_idx ON appointments (service_id);
CREATE INDEX walk_ins_requested_barber_id_idx ON walk_ins (requested_barber_id);
CREATE INDEX walk_ins_service_id_idx ON walk_ins (service_id);
