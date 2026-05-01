create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into departments (code, name, is_active)
values
  ('memory_pcs', '메모리PCS', true),
  ('foundry_pcs', '파운드리PCS', true),
  ('memory', '메모리', true)
on conflict (code) do update set
  name = excluded.name,
  is_active = excluded.is_active;

alter table users
  add column if not exists department_id uuid references departments(id);

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'users'
      and constraint_name = 'users_role_check'
  ) then
    alter table users drop constraint users_role_check;
  end if;
end $$;

alter table users
  add constraint users_role_check
  check (role in ('user', 'sub_admin', 'admin'));

update users
set department_id = (select id from departments where code = 'memory_pcs')
where department_id is null;

create index if not exists users_department_id_idx on users(department_id);
