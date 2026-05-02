-- Enforce the product rule that every active account belongs to a department.
-- Existing null rows are backfilled to the default Memory PCS department before
-- the NOT NULL constraint is applied.

update users
set department_id = (select id from departments where code = 'memory_pcs')
where department_id is null;

alter table users
  alter column department_id set not null;
