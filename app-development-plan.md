# 출퇴근통합시스템 1차 구현 계획

## Summary

- 모바일 우선 웹앱으로 1차 버전을 개발한다.
- 목표는 오늘 근무 대상자 자동 판정, 위치/시간 기반 출근·TBM·퇴근 기록, 관리자 실시간 현황 확인이다.
- 1차 버전은 한 개의 큰 사업장, 여러 출입 지점, 하나의 TBM 지점, 공통 시간 설정 기준으로 고정한다.
- 권장 기술은 Next.js + TypeScript + Supabase + Vercel이다.

## 재개발 전략 정렬

- 기존 Google Apps Script 앱의 목적성과 사용성은 재개발의 기준선으로 유지한다.
- 이번 재개발의 핵심 목적은 새 기능 추가가 아니라, 기존 운영 경험을 해치지 않으면서 저장 구조·검증 구조·동시성 처리 구조를 현대화하는 것이다.
- 특히 출퇴근, TBM, 점심 관련 버튼을 여러 사용자가 동시에 눌러도 기록 누락·중복·병목이 발생하지 않도록 약 100명 규모 사용을 기준으로 안정성을 설계한다.
- Google Sheet는 계속 읽기 전용 근무표 원본으로 취급하고, 실제 출결 결과와 정정 이력은 앱 데이터 저장소에서 관리한다.
- 구현 판단 기준은 “더 복잡한 기능”보다 “원본 GAS 앱의 운영 감각과 즉시성 보존”에 둔다.
- 재개발 세부 우선순위는 `redevelopment-priority-table.md`를 따른다.

## Product Rules

- 로그인은 관리자 생성 계정만 사용한다.
- 사용자는 이름 기반 ID와 비밀번호로 로그인한다.
- 권한은 일반 사용자, 관리자 두 개만 둔다.
- 오늘 근무 대상자는 Google Sheet 근무표를 읽어서 판정한다.
- 근무표는 앱이 자동으로 읽어오고, 관리자 화면에서 수동 새로고침도 가능하게 한다.
- 사용자 화면 버튼은 출근, TBM, 퇴근 3개만 둔다.
- 출근/퇴근은 등록된 출입 zone 반경 안에서만 허용한다.
- TBM은 별도 TBM zone 반경 안에서만 허용한다.
- 출근/TBM/퇴근은 각각 설정된 시간대 안에서만 허용한다.
- 조건을 만족하지 않으면 버튼은 비활성화하고 이유를 텍스트로 보여준다.
- 잘못된 기록은 기본적으로 자동 규칙으로 막고, 예외는 관리자만 정정할 수 있게 한다.
- 관리자 정정은 반드시 사유를 남기고 이력을 저장한다.
- 현재 구현은 점심 등록/출문/입문 및 세부 TBM 이벤트까지 일부 확장되어 있으므로, 이후 변경 시에는 원본 목적 대비 유지할지 단순화할지 먼저 확인한다.

## Screens And Behavior

### 로그인 화면

- 이름 기반 ID와 비밀번호 입력
- 실패 시 계정 없음, 비밀번호 오류, 비활성 계정을 구분해서 안내

### 사용자 홈 화면

- 오늘 날짜, 사용자 이름, 오늘 근무 대상 여부 표시
- 오늘 상태를 미출근, 출근 완료, TBM 완료, 퇴근 완료로 표시
- 버튼별 활성 조건
  - 출근: 오늘 근무 대상자, 출근 가능 시간, 출입 zone 내부, 아직 출근 전
  - TBM: 오늘 근무 대상자, TBM 가능 시간, TBM zone 내부, 이미 출근, 아직 TBM 전
  - 퇴근: 오늘 근무 대상자, 퇴근 가능 시간, 출입 zone 내부, 이미 출근, 아직 퇴근 전
- 버튼 클릭 시 현재 위치를 다시 읽고 서버에서 최종 판정 후 기록 저장

### 관리자 대시보드

- 오늘 기준 총 근무 대상자 수
- 출근 완료 / 미출근
- TBM 완료 / 미완료
- 퇴근 완료 / 미퇴근
- 사용자별 표
  - 이름
  - 오늘 근무 대상 여부
  - 출근 시각 / zone
  - TBM 시각 / zone
  - 퇴근 시각 / zone
  - 정정 여부
- 관리자 기능
  - 오늘 근무표 수동 새로고침
  - 기록 정정
  - zone 관리
  - 시간 설정 관리

### 관리자 설정 화면

- 출입 zone 등록/수정/비활성화
- TBM zone 등록/수정
- 출근/TBM/퇴근 허용 시간 설정
- 구글시트 연결 정보 확인

## Data And Interfaces

### 핵심 테이블

#### users

- id
- username
- display_name
- password_hash 또는 auth 연결값
- role
- is_active
- created_at

#### zones

- id
- name
- type(entry or tbm)
- latitude
- longitude
- radius_m
- is_active
- created_at

#### roster_entries

- id
- work_date
- user_name
- is_scheduled
- source_row_key
- synced_at

#### attendance_records

- id
- work_date
- user_name
- check_in_at
- check_in_lat
- check_in_lng
- check_in_accuracy_m
- check_in_zone_id
- tbm_at
- tbm_lat
- tbm_lng
- tbm_accuracy_m
- tbm_zone_id
- check_out_at
- check_out_lat
- check_out_lng
- check_out_accuracy_m
- check_out_zone_id
- corrected_by_admin
- correction_note
- updated_at

#### audit_logs

- id
- target_record_id
- action_type
- before_json
- after_json
- reason
- actor_name
- created_at

#### app_settings

- check_in_start
- check_in_end
- tbm_start
- tbm_end
- check_out_start
- check_out_end
- max_gps_accuracy_m
- google_sheet_id
- google_sheet_tab_name

### Google Sheet 최소 컬럼

- date
- name
- scheduled

### 내부 API 초안

- POST /api/login
- GET /api/me/today
- POST /api/attendance/check-in
- POST /api/attendance/tbm
- POST /api/attendance/check-out
- GET /api/admin/dashboard?date=YYYY-MM-DD
- POST /api/admin/roster-sync
- POST /api/admin/zones
- PATCH /api/admin/zones/:id
- PATCH /api/admin/attendance/:id
- PATCH /api/admin/settings

### 위치 판정 규칙

- 브라우저에서 현재 좌표와 정확도를 읽는다.
- 서버에서 zone 중심 좌표와의 거리 <= zone 반경인지 판정한다.
- GPS 정확도가 max_gps_accuracy_m보다 나쁘면 저장하지 않고 재시도 안내를 보여준다.

## Implementation Order

1. 프로젝트 기본 세팅
   - Next.js, Supabase, 인증 구조, 기본 라우팅 구성
2. 데이터 모델 구축
   - 테이블, 권한 정책, 관리자 초기 계정 생성 방식 확정
3. Google Sheet 동기화
   - 오늘 근무 대상자 읽기, 수동 새로고침, 중복 동기화 방지
4. 사용자 기록 플로우
   - 출근, TBM, 퇴근 버튼 조건 판정과 저장
5. 관리자 대시보드
   - 오늘 집계, 사용자별 상태, 정정 기능
6. 관리자 설정
   - zone 관리, 시간 설정
7. 모바일 UI 정리
   - 큰 버튼, 상태 색상, 위치 권한 안내, 오류 메시지 정리
8. 배포와 운영 점검
   - Vercel 배포, 환경변수, 관리자 운영 매뉴얼 초안

## 재개발 우선 원칙

1. 원본 GAS 앱의 핵심 운영 경험을 문서화하고 보존한다.
2. 오늘 근무자 판정, 예외자 처리, 현재 시간대 판단의 의미를 기존 운영 방식과 맞춘다.
3. 사용자 액션은 계속 단순하게 유지하되, 서버 판정과 데이터 무결성은 더 강화한다.
4. 동일 사용자 중복 요청, 동시 다중 요청, 관리자 동시 조작에도 기록이 꼬이지 않도록 저장 경로를 보강한다.
5. 구현은 항상 검증 계획과 함께 진행하며, 재개발 우선순위 항목마다 최소한의 TDD/QA 증거를 남긴다.

## Test Plan

- 인증
  - 정상 로그인
  - 비밀번호 오류
  - 비활성 계정 차단
- 근무표
  - 오늘 근무 대상자만 반영되는지
  - 시트 수정 후 재동기화가 되는지
- 위치
  - zone 내부 기록 성공
  - zone 외부 기록 차단
  - GPS 정확도 불량 시 저장 차단
- 시간
  - 허용 시간 내 기록 성공
  - 허용 시간 외 버튼 비활성화
- 기록 순서
  - 출근 전 TBM 차단
  - 출근 전 퇴근 차단
  - 동일 항목 중복 저장 차단
- 관리자
  - 집계 수치가 사용자별 기록과 일치하는지
  - 정정 후 변경 이력 저장되는지
- 모바일
  - iPhone Safari, Android Chrome에서 위치 권한과 버튼 동작 확인

## 재개발 검증 원칙

- 재개발 검증은 기능 동작 확인만으로 끝내지 않고, 원본 GAS 앱의 운영 감각이 유지되는지도 함께 확인한다.
- 우선순위가 높은 재개발 항목은 가능한 한 테스트 또는 재현 가능한 검증 절차를 먼저 정의한 뒤 구현한다.
- 동시성 관련 항목은 단일 사용자 성공 여부보다 중복 저장 방지, 기록 순서 보존, 관리자 집계 일관성을 더 중요하게 본다.

## Assumptions And Defaults

- 1차 버전은 이름 중복이 없다고 가정한다.
- 이름 중복 가능성이 생기면 2차 버전에서 사번 또는 고유 코드를 도입한다.
- 1차 버전은 공통 시간표 하나만 사용한다.
- 주간조/늦조/부서별 시간표 분리는 2차 범위로 미룬다.
- Google Sheet는 읽기 전용 원본으로만 사용한다.
- 1차 버전은 관리자 화면 조회 중심으로 만들고, CSV 다운로드/인쇄 기능은 보류한다.
- zone 등록 방식은 지도에서 지점 선택 + 필요 시 좌표 직접 수정으로 둔다.
