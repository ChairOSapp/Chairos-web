-- Diagnosed: walk-in assignment (WalkInQueue.tsx / chair dashboard handleWalkIn)
-- already creates a real appointments row and a real client, so walk-ins DO
-- block the calendar and DO feed Client Lock (via the same generic
-- update_client_lock() trigger every other appointment uses). The real gap
-- is that walk_ins never stored a back-reference to what it produced, which
-- blocks reporting/traceability (e.g. "how many walk-ins converted").
ALTER TABLE walk_ins ADD COLUMN appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE walk_ins ADD COLUMN client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX ON walk_ins(appointment_id);
CREATE INDEX ON walk_ins(client_id);
