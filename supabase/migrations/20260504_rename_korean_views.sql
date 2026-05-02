drop view if exists "사용자_계정";
drop view if exists "GPS_인증구역";
drop view if exists "근무편성";
drop view if exists "출퇴근_일자";
drop view if exists "출퇴근_일자별기록";
drop view if exists "출퇴근_이벤트";
drop view if exists "출퇴근_정정로그";
drop view if exists "전체_운영설정";
drop view if exists "부서별_시간설정";
drop view if exists "부서별_허용시간창";
drop view if exists "권한 정의";
drop view if exists "출퇴근 이벤트 종류";

create or replace view "계정권한" as select * from account_roles;
create or replace view "계정" as select * from account_users;
create or replace view "출결구역" as select * from geo_zones;
create or replace view "출결대상자" as select * from work_rosters;
create or replace view "출결 일자정리표" as select * from attendance_daily_records;
create or replace view "출결버튼목록" as select * from attendance_event_types;
create or replace view "출결버튼클릭시간" as select * from attendance_events;
create or replace view "출결 정정기록" as select * from audit_attendance_logs;
create or replace view "전체 데이터 설정" as select * from config_global_settings;
create or replace view "부서별 근무시간" as select * from config_department_settings;
create or replace view "부서별 버튼활성화시간" as select * from config_attendance_windows;

select pg_notify('pgrst', 'reload schema');
