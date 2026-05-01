insert into departments (code, name, is_active)
values
  ('memory_pcs', '메모리PCS', true),
  ('foundry_pcs', '파운드리PCS', true),
  ('memory', '메모리', true)
on conflict (code) do update set
  name = excluded.name,
  is_active = excluded.is_active;

insert into users (username, display_name, password_hash, role, is_active)
values
  ('admin', '현장관리자', '$2b$10$pbXhDCtBiC3R6XScP153k.tnnM36/fEdDgkuceuxP.LhIzb3AKVHW', 'admin', true),
  ('kim', '김민수', '$2b$10$pbXhDCtBiC3R6XScP153k.tnnM36/fEdDgkuceuxP.LhIzb3AKVHW', 'user', true),
  ('park', '박지훈', '$2b$10$pbXhDCtBiC3R6XScP153k.tnnM36/fEdDgkuceuxP.LhIzb3AKVHW', 'user', true),
  ('choi', '최유진', '$2b$10$pbXhDCtBiC3R6XScP153k.tnnM36/fEdDgkuceuxP.LhIzb3AKVHW', 'user', true),
  ('lee', '이서준', '$2b$10$pbXhDCtBiC3R6XScP153k.tnnM36/fEdDgkuceuxP.LhIzb3AKVHW', 'user', true)
on conflict (username) do nothing;

update users
set department_id = (select id from departments where code = 'memory_pcs')
where department_id is null;

insert into zones (name, type, latitude, longitude, radius_m, is_active)
values
  ('정문', 'entry', 37.56652, 126.97802, 120, true),
  ('사무실 입구', 'entry', 37.56618, 126.97775, 90, true),
  ('TBM 집합장', 'tbm', 37.56674, 126.97855, 80, true)
on conflict do nothing;

insert into app_settings (
  check_in_start,
  check_in_end,
  tbm_start,
  tbm_end,
  check_out_start,
  check_out_end,
  max_gps_accuracy_m,
  google_sheet_id,
  google_sheet_tab_name
)
values ('05:30', '10:30', '06:00', '11:00', '15:00', '23:00', 120, null, 'Roster');
