# Supabase Table Map

이 문서는 Supabase 테이블을 사람이 읽기 쉬운 도메인별 이름으로 정리한 기준표입니다.

운영용 물리 테이블명은 영문 `snake_case`를 유지합니다. 한글명은 table comment와 관리용 view로 제공합니다. Postgres에서 한글 테이블명도 가능하지만, 코드와 Supabase 타입 생성에서 항상 따옴표 처리가 필요해 운영 테이블명으로는 쓰지 않습니다.

| 도메인 | 표준 테이블 | 한글 view | 역할 |
| --- | --- | --- | --- |
| 조직 | `org_departments` | `부서` | 부서 코드, 부서명, 활성 상태 |
| 계정 | `account_roles` | `권한 정의` | 권한 코드와 한글 라벨 |
| 계정 | `account_users` | `계정` | 로그인 계정, 권한, 소속 부서, 비활성 상태 |
| 위치 | `geo_zones` | `출결구역` | 출퇴근/TBM GPS 인증 구역 |
| 근무 | `work_rosters` | `출결대상자` | 날짜별 근무 대상, 근무 유형, 점심 외출 허용 |
| 출퇴근 | `attendance_daily_records` | `출결 일자정리표` | 사용자별 하루 출퇴근 요약 기록 |
| 출퇴근 | `attendance_event_types` | `출퇴근 이벤트 종류` | 출근, TBM, 점심, 퇴근 이벤트 종류 |
| 출퇴근 | `attendance_events` | `출결버튼클릭시간` | 개별 출퇴근 이벤트 로그 |
| 감사 | `audit_attendance_logs` | `출결 정정기록` | 관리자 정정 전후 기록과 사유 |
| 설정 | `config_global_settings` | `전체 데이터 설정` | 전체 기본 운영 설정 |
| 설정 | `config_department_settings` | `부서별 근무시간` | 부서별 기본 시간 설정 |
| 설정 | `config_attendance_windows` | `부서별 버튼활성화시간` | 부서/근무유형/액션별 허용 시간창 |

## Legacy Compatibility

기존 이름은 migration 이후 view로 남깁니다.

| 기존 이름 | 새 표준 테이블 |
| --- | --- |
| `departments` | `org_departments` |
| `users` | `account_users` |
| `zones` | `geo_zones` |
| `roster_entries` | `work_rosters` |
| `attendance_records` | `attendance_daily_records` |
| `audit_logs` | `audit_attendance_logs` |
| `app_settings` | `config_global_settings` |
| `department_settings` | `config_department_settings` |
| `department_attendance_windows` | `config_attendance_windows` |

## Attendance Event Direction

기존 `attendance_daily_records`는 화면 호환과 일자별 요약을 위해 유지합니다. 하지만 앞으로 새 이벤트가 생기면 이 테이블에 컬럼을 추가하지 않고 `attendance_events`에 행으로 저장하는 구조를 사용합니다.

예시:

| attendance_daily_record_id | action_type | occurred_at |
| --- | --- | --- |
| 하루 기록 ID | `check_in` | 출근 시간 |
| 하루 기록 ID | `tbm_morning` | 오전 TBM 시간 |
| 하루 기록 ID | `check_out` | 퇴근 시간 |

`attendance_daily_records`가 저장/수정될 때 trigger가 `attendance_events`를 자동 동기화합니다.
