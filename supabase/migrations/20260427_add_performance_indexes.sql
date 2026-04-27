-- Performance: targeted lookup indexes for per-user queries
create index if not exists idx_attendance_records_work_date_username
  on attendance_records (work_date, username);

create index if not exists idx_roster_entries_work_date_username
  on roster_entries (work_date, username);
