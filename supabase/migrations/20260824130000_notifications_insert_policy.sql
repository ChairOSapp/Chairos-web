-- notifications only had SELECT/UPDATE/ALL policies scoped to
-- auth.uid() = user_id, so writing a notification FOR someone else --
-- exactly what every real call site does (a client's booking notifies
-- the shop owner, a barber's join request notifies the owner, an
-- owner's approval notifies the barber) -- was always rejected. Scoped
-- to real shop relationships (target must be a real shop's owner or a
-- barber linked to a shop) rather than opened fully, matching the
-- precedent set by the public appointments/clients insert policies:
-- the caller has no identity to bind against for anonymous bookings,
-- so the check validates the relationship shape instead.
CREATE POLICY "notifications_insert_shop_relationship"
  ON notifications FOR INSERT
  TO public
  WITH CHECK (
    user_id IN (SELECT owner_id FROM shops)
    OR user_id IN (SELECT barber_id FROM shop_barbers WHERE barber_id IS NOT NULL)
  );
