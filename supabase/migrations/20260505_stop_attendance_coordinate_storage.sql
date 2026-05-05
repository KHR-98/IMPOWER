create or replace function sync_attendance_events_from_daily_record()
returns trigger
language plpgsql
as $$
begin
  with current_events(action_type, occurred_at, latitude, longitude, accuracy_m, zone_id, mdm_verified, camera_test) as (
    values
      ('check_in'::text, new.check_in_at, null::double precision, null::double precision, null::double precision, new.check_in_zone_id, new.check_in_mdm_verified, new.check_in_camera_test),
      ('tbm_morning'::text, coalesce(new.tbm_morning_at, new.tbm_at), null::double precision, null::double precision, null::double precision, coalesce(new.tbm_morning_zone_id, new.tbm_zone_id), null::boolean, null::text),
      ('lunch_register'::text, new.lunch_register_at, null::double precision, null::double precision, null::double precision, new.lunch_register_zone_id, new.lunch_register_mdm_verified, new.lunch_register_camera_test),
      ('lunch_out'::text, new.lunch_out_at, null::double precision, null::double precision, null::double precision, new.lunch_out_zone_id, null::boolean, null::text),
      ('lunch_in'::text, new.lunch_in_at, null::double precision, null::double precision, null::double precision, new.lunch_in_zone_id, new.lunch_in_mdm_verified, new.lunch_in_camera_test),
      ('tbm_afternoon'::text, new.tbm_afternoon_at, null::double precision, null::double precision, null::double precision, new.tbm_afternoon_zone_id, null::boolean, null::text),
      ('tbm_checkout'::text, new.tbm_checkout_at, null::double precision, null::double precision, null::double precision, new.tbm_checkout_zone_id, null::boolean, null::text),
      ('check_out'::text, new.check_out_at, null::double precision, null::double precision, null::double precision, new.check_out_zone_id, new.check_out_mdm_verified, new.check_out_camera_test)
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
    latitude,
    longitude,
    accuracy_m,
    zone_id,
    mdm_verified,
    camera_test,
    source,
    updated_at
  )
  select
    new.id,
    current_events.action_type,
    current_events.occurred_at,
    current_events.latitude,
    current_events.longitude,
    current_events.accuracy_m,
    current_events.zone_id,
    current_events.mdm_verified,
    current_events.camera_test,
    'daily_record_sync',
    now()
  from current_events
  where current_events.occurred_at is not null
  on conflict (attendance_daily_record_id, action_type) do update set
    occurred_at = excluded.occurred_at,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_m = excluded.accuracy_m,
    zone_id = excluded.zone_id,
    mdm_verified = excluded.mdm_verified,
    camera_test = excluded.camera_test,
    source = excluded.source,
    updated_at = now();

  return new;
end;
$$;
