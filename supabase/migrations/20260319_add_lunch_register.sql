alter table if exists attendance_records
  add column if not exists lunch_register_at timestamptz,
  add column if not exists lunch_register_lat double precision,
  add column if not exists lunch_register_lng double precision,
  add column if not exists lunch_register_accuracy_m double precision,
  add column if not exists lunch_register_zone_id uuid references zones(id);
