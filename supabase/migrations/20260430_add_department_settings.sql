create table if not exists department_settings (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null unique references departments(id) on delete cascade,
  day_check_in_start text not null default '06:00',
  day_check_in_end text not null default '08:30',
  day_tbm_start text not null default '06:00',
  day_tbm_end text not null default '08:30',
  day_tbm_afternoon_start text not null default '13:35',
  day_tbm_afternoon_end text not null default '13:45',
  day_tbm_checkout_start text not null default '16:30',
  day_tbm_checkout_end text not null default '16:45',
  day_check_out_start text not null default '16:30',
  day_check_out_end text not null default '18:00',
  late_check_in_start text not null default '09:00',
  late_check_in_end text not null default '11:00',
  late_check_out_start text not null default '19:30',
  late_check_out_end text not null default '21:00',
  updated_at timestamptz not null default now()
);

insert into department_settings (
  department_id,
  day_check_in_start,
  day_check_in_end,
  day_tbm_start,
  day_tbm_end,
  day_tbm_afternoon_start,
  day_tbm_afternoon_end,
  day_tbm_checkout_start,
  day_tbm_checkout_end,
  day_check_out_start,
  day_check_out_end,
  late_check_in_start,
  late_check_in_end,
  late_check_out_start,
  late_check_out_end
)
select
  id,
  '06:00',
  '08:30',
  '06:00',
  '08:30',
  '13:35',
  '13:45',
  '16:30',
  '16:45',
  '16:30',
  '18:00',
  '09:00',
  '11:00',
  '19:30',
  '21:00'
from departments
on conflict (department_id) do nothing;
