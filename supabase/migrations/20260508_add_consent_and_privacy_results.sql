create table if not exists app_consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references account_users(id),
  username text not null references account_users(username),
  consent_version text not null,
  consent_text_hash text not null,
  consented_at timestamptz not null default now(),
  signed_name text not null check (length(trim(signed_name)) > 0),
  user_agent text,
  ip_address text,
  agreed_personal_info boolean not null,
  agreed_location boolean not null,
  agreed_camera_policy_check boolean not null,
  agreed_cloud_processing boolean not null,
  agreed_refusal_manual_procedure boolean not null,
  agreed_e_signature_log boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists app_consent_records_username_version_idx
  on app_consent_records(username, consent_version, consented_at desc);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_consent_records' and column_name = 'personal_info_collection_use'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_consent_records' and column_name = 'agreed_personal_info'
  ) then
    alter table app_consent_records rename column personal_info_collection_use to agreed_personal_info;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_consent_records' and column_name = 'location_info_use'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_consent_records' and column_name = 'agreed_location'
  ) then
    alter table app_consent_records rename column location_info_use to agreed_location;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_consent_records' and column_name = 'camera_policy_check'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_consent_records' and column_name = 'agreed_camera_policy_check'
  ) then
    alter table app_consent_records rename column camera_policy_check to agreed_camera_policy_check;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_consent_records' and column_name = 'cloud_processing'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_consent_records' and column_name = 'agreed_cloud_processing'
  ) then
    alter table app_consent_records rename column cloud_processing to agreed_cloud_processing;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_consent_records' and column_name = 'refusal_manual_fallback'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_consent_records' and column_name = 'agreed_refusal_manual_procedure'
  ) then
    alter table app_consent_records rename column refusal_manual_fallback to agreed_refusal_manual_procedure;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_consent_records' and column_name = 'signature_log_storage'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_consent_records' and column_name = 'agreed_e_signature_log'
  ) then
    alter table app_consent_records rename column signature_log_storage to agreed_e_signature_log;
  end if;
end $$;

alter table app_consent_records
  add column if not exists agreed_personal_info boolean,
  add column if not exists agreed_location boolean,
  add column if not exists agreed_camera_policy_check boolean,
  add column if not exists agreed_cloud_processing boolean,
  add column if not exists agreed_refusal_manual_procedure boolean,
  add column if not exists agreed_e_signature_log boolean;

update app_consent_records
set
  agreed_personal_info = coalesce(agreed_personal_info, false),
  agreed_location = coalesce(agreed_location, false),
  agreed_camera_policy_check = coalesce(agreed_camera_policy_check, false),
  agreed_cloud_processing = coalesce(agreed_cloud_processing, false),
  agreed_refusal_manual_procedure = coalesce(agreed_refusal_manual_procedure, false),
  agreed_e_signature_log = coalesce(agreed_e_signature_log, false);

alter table app_consent_records
  alter column agreed_personal_info set not null,
  alter column agreed_location set not null,
  alter column agreed_camera_policy_check set not null,
  alter column agreed_cloud_processing set not null,
  alter column agreed_refusal_manual_procedure set not null,
  alter column agreed_e_signature_log set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_consent_records_signed_name_check'
  ) then
    alter table app_consent_records
      add constraint app_consent_records_signed_name_check
      check (length(trim(signed_name)) > 0);
  end if;
end $$;

alter table attendance_events
  add column if not exists zone_check_result text,
  add column if not exists accuracy_check_result text;

update attendance_events
set
  latitude = null,
  longitude = null,
  accuracy_m = null,
  zone_check_result = coalesce(zone_check_result, 'ALLOWED'),
  accuracy_check_result = coalesce(accuracy_check_result, 'PASS');

alter table attendance_events
  alter column zone_check_result set default 'ALLOWED',
  alter column accuracy_check_result set default 'PASS',
  alter column zone_check_result set not null,
  alter column accuracy_check_result set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_events_zone_check_result_check'
  ) then
    alter table attendance_events
      add constraint attendance_events_zone_check_result_check
      check (zone_check_result in ('ALLOWED', 'NOT_ALLOWED', 'FAILED'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'attendance_events_accuracy_check_result_check'
  ) then
    alter table attendance_events
      add constraint attendance_events_accuracy_check_result_check
      check (accuracy_check_result in ('PASS', 'FAIL'));
  end if;
end $$;

update attendance_daily_records
set
  check_in_lat = null,
  check_in_lng = null,
  check_in_accuracy_m = null,
  tbm_lat = null,
  tbm_lng = null,
  tbm_accuracy_m = null,
  tbm_morning_lat = null,
  tbm_morning_lng = null,
  tbm_morning_accuracy_m = null,
  lunch_register_lat = null,
  lunch_register_lng = null,
  lunch_register_accuracy_m = null,
  lunch_out_lat = null,
  lunch_out_lng = null,
  lunch_out_accuracy_m = null,
  lunch_in_lat = null,
  lunch_in_lng = null,
  lunch_in_accuracy_m = null,
  tbm_afternoon_lat = null,
  tbm_afternoon_lng = null,
  tbm_afternoon_accuracy_m = null,
  tbm_checkout_lat = null,
  tbm_checkout_lng = null,
  tbm_checkout_accuracy_m = null,
  check_out_lat = null,
  check_out_lng = null,
  check_out_accuracy_m = null;

create or replace function scrub_attendance_audit_coordinates(record jsonb)
returns jsonb
language plpgsql
as $$
declare
  result jsonb := record;
  point_key text;
begin
  if result is null then
    return null;
  end if;

  foreach point_key in array array[
    'checkIn',
    'tbm',
    'tbmMorning',
    'lunchRegister',
    'lunchOut',
    'lunchIn',
    'tbmAfternoon',
    'tbmCheckout',
    'checkOut'
  ]
  loop
    if jsonb_typeof(result -> point_key) = 'object' then
      result := jsonb_set(
        result,
        array[point_key],
        (result -> point_key) - 'latitude' - 'longitude' - 'accuracyM',
        false
      );
    end if;
  end loop;

  return result;
end;
$$;

update audit_attendance_logs
set
  before_json = scrub_attendance_audit_coordinates(before_json),
  after_json = scrub_attendance_audit_coordinates(after_json);

drop function scrub_attendance_audit_coordinates(jsonb);

create or replace function sync_attendance_events_from_daily_record()
returns trigger
language plpgsql
as $$
begin
  with current_events(action_type, occurred_at, zone_id, zone_check_result, accuracy_check_result, mdm_verified, camera_test) as (
    values
      ('check_in'::text, new.check_in_at, new.check_in_zone_id, 'ALLOWED'::text, 'PASS'::text, new.check_in_mdm_verified, new.check_in_camera_test),
      ('tbm_morning'::text, coalesce(new.tbm_morning_at, new.tbm_at), coalesce(new.tbm_morning_zone_id, new.tbm_zone_id), 'ALLOWED'::text, 'PASS'::text, null::boolean, null::text),
      ('lunch_register'::text, new.lunch_register_at, new.lunch_register_zone_id, 'ALLOWED'::text, 'PASS'::text, new.lunch_register_mdm_verified, new.lunch_register_camera_test),
      ('lunch_out'::text, new.lunch_out_at, new.lunch_out_zone_id, 'ALLOWED'::text, 'PASS'::text, null::boolean, null::text),
      ('lunch_in'::text, new.lunch_in_at, new.lunch_in_zone_id, 'ALLOWED'::text, 'PASS'::text, new.lunch_in_mdm_verified, new.lunch_in_camera_test),
      ('tbm_afternoon'::text, new.tbm_afternoon_at, new.tbm_afternoon_zone_id, 'ALLOWED'::text, 'PASS'::text, null::boolean, null::text),
      ('tbm_checkout'::text, new.tbm_checkout_at, new.tbm_checkout_zone_id, 'ALLOWED'::text, 'PASS'::text, null::boolean, null::text),
      ('check_out'::text, new.check_out_at, new.check_out_zone_id, 'ALLOWED'::text, 'PASS'::text, new.check_out_mdm_verified, new.check_out_camera_test)
  ),
  deleted as (
    delete from attendance_events
    where attendance_daily_record_id = new.id
      and source = 'daily_record_sync'
      and action_type in ('check_in', 'tbm_morning', 'lunch_register', 'lunch_out', 'lunch_in', 'tbm_afternoon', 'tbm_checkout', 'check_out')
      and action_type not in (
        select current_events.action_type
        from current_events
        where current_events.occurred_at is not null
      )
    returning 1
  )
  insert into attendance_events (
    attendance_daily_record_id,
    action_type,
    occurred_at,
    zone_id,
    zone_check_result,
    accuracy_check_result,
    mdm_verified,
    camera_test,
    source,
    updated_at
  )
  select
    new.id,
    current_events.action_type,
    current_events.occurred_at,
    current_events.zone_id,
    current_events.zone_check_result,
    current_events.accuracy_check_result,
    current_events.mdm_verified,
    current_events.camera_test,
    'daily_record_sync',
    now()
  from current_events
  where current_events.occurred_at is not null
  on conflict (attendance_daily_record_id, action_type) do update set
    occurred_at = excluded.occurred_at,
    zone_id = excluded.zone_id,
    latitude = null,
    longitude = null,
    accuracy_m = null,
    zone_check_result = excluded.zone_check_result,
    accuracy_check_result = excluded.accuracy_check_result,
    mdm_verified = excluded.mdm_verified,
    camera_test = excluded.camera_test,
    source = excluded.source,
    updated_at = now();

  return new;
end;
$$;

comment on table app_consent_records is '자동 앱 기반 입출문 필수 동의 이력';

create or replace view consent_records as select * from app_consent_records;
create or replace view "동의기록" as select * from app_consent_records;
