-- 계정 비활성화(퇴사) 시점을 기록하여, 출결 엑셀에서 해당 날짜에 "퇴사"로 표기할 수 있도록 한다.
alter table account_users
  add column if not exists deactivated_at timestamptz;
