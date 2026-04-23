create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  password_hash text,
  kakao_id text unique,
  role text not null check (role in ('user', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('entry', 'tbm')),
  latitude double precision not null,
  longitude double precision not null,
  radius_m integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists roster_entries (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  username text not null references users(username),
  is_scheduled boolean not null,
  shift_type text not null default 'day' check (shift_type in ('day', 'late')),
  allow_lunch_out boolean not null default false,
  source_row_key text,
  synced_at timestamptz not null default now(),
  unique (work_date, username)
);

create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  username text not null references users(username),
  display_name text not null,
  check_in_at timestamptz,
  check_in_lat double precision,
  check_in_lng double precision,
  check_in_accuracy_m double precision,
  check_in_zone_id uuid references zones(id),
  tbm_at timestamptz,
  tbm_lat double precision,
  tbm_lng double precision,
  tbm_accuracy_m double precision,
  tbm_zone_id uuid references zones(id),
  tbm_morning_at timestamptz,
  tbm_morning_lat double precision,
  tbm_morning_lng double precision,
  tbm_morning_accuracy_m double precision,
  tbm_morning_zone_id uuid references zones(id),
  lunch_register_at timestamptz,
  lunch_register_lat double precision,
  lunch_register_lng double precision,
  lunch_register_accuracy_m double precision,
  lunch_register_zone_id uuid references zones(id),
  lunch_out_at timestamptz,
  lunch_out_lat double precision,
  lunch_out_lng double precision,
  lunch_out_accuracy_m double precision,
  lunch_out_zone_id uuid references zones(id),
  lunch_in_at timestamptz,
  lunch_in_lat double precision,
  lunch_in_lng double precision,
  lunch_in_accuracy_m double precision,
  lunch_in_zone_id uuid references zones(id),
  tbm_afternoon_at timestamptz,
  tbm_afternoon_lat double precision,
  tbm_afternoon_lng double precision,
  tbm_afternoon_accuracy_m double precision,
  tbm_afternoon_zone_id uuid references zones(id),
  tbm_checkout_at timestamptz,
  tbm_checkout_lat double precision,
  tbm_checkout_lng double precision,
  tbm_checkout_accuracy_m double precision,
  tbm_checkout_zone_id uuid references zones(id),
  check_out_at timestamptz,
  check_out_lat double precision,
  check_out_lng double precision,
  check_out_accuracy_m double precision,
  check_out_zone_id uuid references zones(id),
  corrected_by_admin boolean not null default false,
  correction_note text,
  updated_at timestamptz not null default now(),
  unique (work_date, username)
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  target_record_id uuid not null references attendance_records(id) on delete cascade,
  action_type text not null,
  before_json jsonb,
  after_json jsonb,
  reason text not null,
  actor_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists app_settings (
  id uuid primary key default gen_random_uuid(),
  check_in_start text not null,
  check_in_end text not null,
  tbm_start text not null,
  tbm_end text not null,
  tbm_afternoon_start text not null default '13:35',
  tbm_afternoon_end text not null default '13:45',
  tbm_checkout_start text not null default '16:30',
  tbm_checkout_end text not null default '16:45',
  check_out_start text not null,
  check_out_end text not null,
  max_gps_accuracy_m integer not null,
  google_sheet_id text,
  google_sheet_tab_name text,
  created_at timestamptz not null default now()
);

