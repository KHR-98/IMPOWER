-- 운영(viewer) 계정 전용 "운영" 부서 추가.
-- 실제 근무 부서가 아니라, 운영 계정이 특정 근무 부서에 소속돼 그 부서 출결 명단/현황에
-- 섞여 출력되는 문제를 막기 위한 소속 버킷이다.
-- is_active=false 로 두어:
--   * 출결 출력 화면(오늘현황·output·명단복사·알림)은 is_active 부서만 조회하므로 자동 제외되고,
--   * 계정관리 부서 드롭다운은 is_active 를 거르지 않으므로 배정 대상으로는 노출된다.
-- 기존 근무 부서 seed 와 동일하게 code 를 유일키로 멱등 삽입한다.

insert into org_departments (code, name, is_active)
values
  ('ops', '운영', false)
on conflict (code) do update set
  name = excluded.name,
  is_active = excluded.is_active;
