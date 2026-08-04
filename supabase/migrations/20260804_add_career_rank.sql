-- 메모리PCS 부서 인원의 경력순위를 저장한다.
-- 화면 표기/정렬은 여전히 display_name 가나다순을 사용하며, 이 컬럼은
-- 향후 특정 화면에서 경력순 정렬을 붙일 때만 참조한다(현재 정렬 로직은 이 값을 읽지 않음).
-- 순위는 운영에서 제시한 경력순 명단을 그대로 따른다(1 = 최고참).
-- 박명호(1순위)는 아직 계정이 없어 지금은 매칭되는 행이 없다(0건 갱신). 계정 생성 후 아래 UPDATE를
-- 다시 실행하면 career_rank = 1 이 적용된다. 매핑에 박명호를 남겨 둔 이유가 이것이다.

alter table account_users
  add column if not exists career_rank integer;

comment on column account_users.career_rank is
  '부서 내 경력순위(1=최고참). 표기/정렬 기본값은 여전히 가나다순이며, 경력순 정렬이 필요한 화면에서만 참조한다.';

update account_users as u
set career_rank = m.rank
from (
  values
    ('박명호', 1),
    ('권순범', 2),
    ('송준호', 3),
    ('강건', 4),
    ('김형래', 5),
    ('이수빈', 6),
    ('최예찬', 7),
    ('김혜영', 8),
    ('고예진', 9),
    ('백설', 10),
    ('김도연', 11),
    ('박진희', 12),
    ('김단비', 13),
    ('박은주', 14),
    ('문영우', 15),
    ('장현태', 16),
    ('정회준', 17),
    ('최유연', 18),
    ('김민균', 19),
    ('이재영', 20),
    ('김형우', 21),
    ('김도현', 22),
    ('장현준', 23),
    ('이찬규', 24),
    ('홍한나', 25),
    ('이광욱', 26),
    ('오승건', 27),
    ('이동환', 28),
    ('이영하', 29)
) as m(display_name, rank)
where u.display_name = m.display_name
  and u.department_id = (select id from org_departments where code = 'memory_pcs');
