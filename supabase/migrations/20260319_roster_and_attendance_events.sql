alter table roster_entries
  add column if not exists shift_type text not null default 'day' check (shift_type in ('day', 'late')),
  add column if not exists allow_lunch_out boolean not null default false;

alter table attendance_records
  add column if not exists tbm_morning_at timestamptz,
  add column if not exists tbm_morning_lat double precision,
  add column if not exists tbm_morning_lng double precision,
  add column if not exists tbm_morning_accuracy_m double precision,
  add column if not exists tbm_morning_zone_id uuid references zones(id),
  add column if not exists lunch_out_at timestamptz,
  add column if not exists lunch_out_lat double precision,
  add column if not exists lunch_out_lng double precision,
  add column if not exists lunch_out_accuracy_m double precision,
  add column if not exists lunch_out_zone_id uuid references zones(id),
  add column if not exists lunch_in_at timestamptz,
  add column if not exists lunch_in_lat double precision,
  add column if not exists lunch_in_lng double precision,
  add column if not exists lunch_in_accuracy_m double precision,
  add column if not exists lunch_in_zone_id uuid references zones(id),
  add column if not exists tbm_afternoon_at timestamptz,
  add column if not exists tbm_afternoon_lat double precision,
  add column if not exists tbm_afternoon_lng double precision,
  add column if not exists tbm_afternoon_accuracy_m double precision,
  add column if not exists tbm_afternoon_zone_id uuid references zones(id),
  add column if not exists tbm_checkout_at timestamptz,
  add column if not exists tbm_checkout_lat double precision,
  add column if not exists tbm_checkout_lng double precision,
  add column if not exists tbm_checkout_accuracy_m double precision,
  add column if not exists tbm_checkout_zone_id uuid references zones(id);

update attendance_records
set
  tbm_morning_at = coalesce(tbm_morning_at, tbm_at),
  tbm_morning_lat = coalesce(tbm_morning_lat, tbm_lat),
  tbm_morning_lng = coalesce(tbm_morning_lng, tbm_lng),
  tbm_morning_accuracy_m = coalesce(tbm_morning_accuracy_m, tbm_accuracy_m),
  tbm_morning_zone_id = coalesce(tbm_morning_zone_id, tbm_zone_id)
where tbm_at is not null;
