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
  check (role in ('user', 'sub_admin', 'admin', 'master'));
