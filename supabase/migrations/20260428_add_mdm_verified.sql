alter table attendance_records
  add column if not exists check_in_mdm_verified boolean,
  add column if not exists check_in_camera_test text,
  add column if not exists lunch_register_mdm_verified boolean,
  add column if not exists lunch_register_camera_test text,
  add column if not exists lunch_in_mdm_verified boolean,
  add column if not exists lunch_in_camera_test text,
  add column if not exists check_out_mdm_verified boolean,
  add column if not exists check_out_camera_test text;
