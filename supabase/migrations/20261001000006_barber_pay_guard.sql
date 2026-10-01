-- Prevent barbers from changing their own compensation/payment fields.
-- The existing "Barbers can update their own slot" RLS policy allows
-- updates to ANY column. This trigger blocks changes to sensitive
-- columns when the updater is the barber themselves (not the owner
-- or a server-side operation).

create or replace function public.prevent_barber_pay_changes()
returns trigger
language plpgsql
security definer
as $$
declare
  v_owner uuid;
  v_updater uuid;
begin
  v_updater := auth.uid();
  -- No auth.uid() = service role / server context: allow.
  if v_updater is null then
    return new;
  end if;

  -- Shop owner can change anything.
  select owner_id into v_owner from public.shops where id = old.shop_id;
  if v_owner = v_updater then
    return new;
  end if;

  -- Barber updating their own row: block protected columns.
  if old.barber_id = v_updater then
    if (old.compensation_type is distinct from new.compensation_type)
      or (old.commission_rate is distinct from new.commission_rate)
      or (old.tip_split_rate is distinct from new.tip_split_rate)
      or (old.booth_rent_amount is distinct from new.booth_rent_amount)
      or (old.booth_rent_due_day is distinct from new.booth_rent_due_day)
      or (old.late_fee_rate is distinct from new.late_fee_rate)
      or (old.late_fee_interval is distinct from new.late_fee_interval)
      or (old.active is distinct from new.active)
      or (old.square_customer_id is distinct from new.square_customer_id)
      or (old.square_card_id is distinct from new.square_card_id)
      or (old.square_card_brand is distinct from new.square_card_brand)
      or (old.square_card_last4 is distinct from new.square_card_last4)
    then
      raise exception 'You cannot change compensation or payment settings. Ask your shop owner.';
    end if;
    return new;
  end if;

  -- Anyone else: let RLS decide.
  return new;
end;
$$;

drop trigger if exists trg_prevent_barber_pay_changes on public.shop_barbers;
create trigger trg_prevent_barber_pay_changes
  before update on public.shop_barbers
  for each row
  execute function public.prevent_barber_pay_changes();
