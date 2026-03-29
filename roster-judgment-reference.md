# 근무표 판정 규칙표 v1

이 문서는 Google Sheet 근무표가 내부 상태로 어떻게 변환되는지 정리한 기준 문서다.  
핵심 목적은 **오늘 근무 대상 판정이 흔들리지 않게** 입력 포맷과 내부 상태 매핑을 고정하는 것이다.

## 1. 내부 상태 기준

근무표는 최종적으로 아래 상태로 변환된다.

| 내부 필드 | 의미 |
|---|---|
| `isScheduled` | 오늘 근무 대상 여부 |
| `shiftType` | `day` 또는 `late` |
| `allowLunchOut` | 점심 관련 외출 허용 여부 |
| `matchedName` | 시트 이름과 앱 사용자 매칭 결과 |
| `unmatchedNames` | 앱 계정과 연결되지 않은 시트 이름 목록 |
| `sourceKey` | 어떤 시트/행/소스에서 왔는지 추적하는 키 |

## 2. 포맷 감지 규칙

| 감지 조건 | 판정 포맷 | 설명 |
|---|---|---|
| 시트 제목에 `늦조인원` 존재 | `legacy_gas` | 기존 GAS 기반 포맷 |
| 대상 월 제목(예: `3월`) 시트 존재 | `monthly_matrix` | 월별 매트릭스 포맷 |
| 위 두 조건이 아니면 | `simple_table` | 일반 표 형식 포맷 |

근거: `lib/google-sheets.ts`의 `fetchSheetRosterSnapshot()`

## 3. 공통 판정 규칙

| 입력 처리 | 규칙 |
|---|---|
| 날짜 해석 | `YYYY-MM-DD`, `YYYY/MM/DD`, `M월 D일`, `MM/DD/YYYY`, JS Date 파싱 가능한 문자열을 허용 |
| 이름 비교 | 공백 제거, 괄호 제거, 소문자화 후 비교 |
| 무시할 이름 토큰 | `연차`, `반차`, `오전반차`, `오후반차`, `예비군`, `휴가`, `공휴일`, `휴일`, `조퇴`, `출장`, `교육`, `외근`, `사무`, `비고`, `없음`, `x`, `o`, `t` |
| 사용자 후보 이름 | 한글/영문 2~12자 수준의 실제 사람 이름처럼 보이는 값만 후보로 간주 |

## 4. simple_table 포맷 규칙

### 4-1. 필수 컬럼

| 의미 | 허용 헤더 |
|---|---|
| 날짜 | `date`, `workdate` |
| 이름 | `name`, `displayname`, `username` |

날짜 컬럼 또는 이름 컬럼이 없으면 오류로 본다.

### 4-2. 선택 컬럼

| 의미 | 허용 헤더 |
|---|---|
| 근무 여부 | `scheduled`, `isscheduled`, `status` |
| 근무조 | `shifttype`, `shift`, `조`, `근무조` |
| 점심 허용 | `allowlunchout`, `lunchout`, `lunch`, `점심`, `점심출입` |

### 4-3. 값 해석 규칙

| 입력 값 | 내부 상태 |
|---|---|
| 빈 `scheduled` 값 | 기본적으로 `isScheduled=true` |
| `0`, `false`, `n`, `no`, `x`, `off`, `휴가`, `연차`, `반차` | `isScheduled=false` |
| `1`, `true`, `y`, `yes`, `o`, `ok`, `scheduled`, `근무`, `출근` | `isScheduled=true` |
| `shift`가 `late`, `late shift`, `늦조`, `exempt`, `야간` | `shiftType='late'` |
| 그 외 shift 값 또는 비어 있음 | `shiftType='day'` |
| 점심 값이 `1`, `true`, `y`, `yes`, `o`, `ok`, `allowed`, `allow`, `점심`, `가능`, `lunch` | `allowLunchOut=true` |
| 점심 값이 `0`, `false`, `n`, `no`, `x`, `blocked`, `불가`, `제외` | `allowLunchOut=false` |

### 4-4. 매칭 실패 규칙

- 시트 이름이 앱 사용자와 매칭되지 않으면 `unmatchedNames`에 넣는다.
- 매칭되지 않은 이름은 출결 대상자로 자동 반영하지 않는다.
- known user 목록에 없는 사람은 assignment에 넣지 않고 운영 확인 대상으로 남긴다.

## 5. legacy_gas 포맷 규칙

| 입력 위치/의미 | 내부 상태 |
|---|---|
| `늦조인원!A:M` 시트 사용 | legacy 포맷으로 판정 |
| 특정 날짜 행의 2~9열 이름 | `shiftType='late'` 후보 |
| 특정 날짜 행의 10열 이름들 | `leaveNames`로 읽고 `isScheduled=false` |
| 특정 날짜 행의 10~12열 이름들 | 예외 이름 집합으로 읽음 |
| 늦조 이름에 해당 | `shiftType='late'` |
| leave 이름에 해당 | `isScheduled=false` |
| 그 외 사용자 | `isScheduled=true`, `shiftType='day'` |
| 점심 허용 | 현재는 `allowLunchOut=false` 고정 |

참고: 현재 코드상 `exceptionNames`는 수집되지만, assignment 결과에는 직접 반영되지 않는다. 이 부분은 재개발 시 운영 의미를 다시 확인해야 한다.

## 6. monthly_matrix 포맷 규칙

| 조건 | 내부 상태 |
|---|---|
| 대상 날짜 행을 찾지 못함 | 모든 known user를 `isScheduled=false`, `shiftType='day'` 기본값으로 채움 |
| 주말/공휴일 행 | 명시적으로 이름이 적힌 사람만 `isScheduled=true`, 나머지는 `false` |
| `blockedNames`, `noteNames`, `officeNames`에 포함 | `isScheduled=false` |
| `explicitShiftNames`에 포함 | `isScheduled=true`, `shiftType='late'` |
| 아무 조건도 해당 없음 | `isScheduled=true`, `shiftType='day'` |
| 점심 허용 | 현재는 `allowLunchOut=false` 고정 |

추가 규칙:
- `unmatchedNames`는 explicit/note/office/blocked 이름 중 앱 사용자와 매칭되지 않은 값이다.
- 주말/공휴일 판정은 요일 셀(`토`, `일`) 또는 공휴일 문자열로 결정한다.

## 7. 기본값 규칙

시트 데이터가 없거나 대상 날짜 행이 없을 때의 기본값:

| 상황 | 기본 assignment |
|---|---|
| simple_table이 비어 있음 | 모든 known user를 `isScheduled=false`, `shiftType='day'`, `allowLunchOut=false` |
| monthly_matrix에서 날짜 행 없음 | 위와 동일 |
| 공통 fallback | `matchedName=null`, `sourceKey=null` 또는 기본 sourceKey 사용 |

## 8. 재개발 시 주의할 점

- 근무표 판정 정확도는 P0 항목이다.
- Google Sheet 연동 자체는 P1로 둘 수 있어도, **파싱 규칙의 정확성은 P0 근무표 판정과 같이 다뤄야 한다.**
- 이름 중복이 실제로 발생하면 현재 매칭 규칙만으로는 안전하지 않으므로, 사번/고유키 도입 여부를 별도 판단해야 한다.
- `legacy_gas`의 예외 이름 처리와 `monthly_matrix`의 blocked/note/office 의미는 운영 기준과 다시 맞춰봐야 한다.
