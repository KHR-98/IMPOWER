# JY:ON 헤더 로고·Excel 버튼 배치 Design QA

## 비교 기준

- 화면 기준 원본: `C:\Users\USER\AppData\Local\Temp\codex-clipboard-1tX9Bv.png`
- 승인된 배치 기준: 사용자가 Excel 버튼을 "로고 오른쪽"으로 선택한 뒤 승인한 `docs/superpowers/specs/2026-07-27-header-logo-excel-placement-design.md`
- 로고 원본: `C:\Users\USER\Desktop\1234.png`
- 일반 admin 구현 캡처: `C:\Users\USER\AppData\Local\Temp\jyon-logo-placement-admin-401x725.png`
- master 구현 캡처: `C:\Users\USER\AppData\Local\Temp\jyon-logo-placement-master-401x725.png`
- 축소 화면 구현 캡처: `C:\Users\USER\AppData\Local\Temp\jyon-logo-placement-master-390x725.png`
- 전체 비교: `C:\Users\USER\AppData\Local\Temp\jyon-header-comparison-full.png`
- 헤더 집중 비교: `C:\Users\USER\AppData\Local\Temp\jyon-header-comparison-focus.png`
- 화면 상태: 개발용 일반 admin과 master 로그인, 관리자 `오늘 현황`, 기본 `메모리` 부서
- 뷰포트: CSS `401 × 725px` 및 `390 × 725px`, `deviceScaleFactor: 1`
- 픽셀 크기: 기준 원본과 401px 구현 캡처는 각각 `401 × 725px`; 전체 비교는 `822 × 725px`; 헤더 집중 비교는 `822 × 140px`
- 밀도 정규화: 모든 화면이 CSS 크기와 동일한 1배 밀도여서 추가 리샘플링 없음

원본 이미지에는 사용자가 언급한 주황색·빨간색 박스가 실제 픽셀로 남아 있지 않았다. 따라서 박스의 정확한 좌표를 추정하지 않고, 사용자에게 확인받은 "401px에서 로고 96px, Excel 버튼은 로고 오른쪽 8px 간격"을 시각 기준으로 사용했다.

## Findings

- P0/P1/P2 차이 없음.
- 401px 일반 admin 화면에서 로고는 승인한 96px 폭으로 커졌고, 원본과 같은 좌측 시작점과 상단 정렬을 유지한다.
- master 화면의 Excel 버튼은 로고 오른쪽에 8px 간격으로 배치되며 우측 보기 전환·로그아웃 영역과 겹치지 않는다.
- Excel 버튼의 `master` 전용 노출 조건, 관리자 내비게이션과 본문 구조는 유지된다.

## 전체 화면 비교

- 원본 캡처는 일반 admin 상태라 Excel 버튼이 없고 관리자 내비게이션도 보이지 않는 상태다. 구현 전체 화면에는 현재 코드의 관리자 내비게이션이 유지되어 상태가 완전히 같지는 않다.
- 이 차이는 이번 헤더 배치 변경으로 만든 것이 아니며, 기능 구조와 버튼 위치를 유지한다는 리디자인 제약에 따른 의도적 유지다.
- 동일하게 비교 가능한 헤더, 부서 칩, 카드 스타일, 색상과 타이포그래피에는 요청 범위를 벗어난 변화가 없다.

## 헤더 집중 비교

- 일반 admin 401px 로고: `x=14`, `y=20`, `96 × 25px`.
- master 401px 로고: `x=14`, `y=20`, `96 × 25px`.
- master 401px Excel 버튼: `x=118`, `y=16`, `40 × 40px`; 로고와 간격 `8px`.
- master 401px 브랜드 행: `x=14`, `y=16`, `144 × 79px`; 우측 고정 컨트롤 시작점 `x=168.594`로 겹침 없음.
- master 390px 로고: `x=14`, `y=20`, `80 × 20.828px`.
- master 390px Excel 버튼: `x=102`, `y=16`, `40 × 40px`; 로고와 간격 `8px`.
- 401px와 390px 모두 부서 칩은 `y=101`, 관리자 내비게이션은 `y=151`로 기존 세로 흐름을 유지한다.
- 원본 비율 `1934:504`를 유지하며 왜곡, 잘림, 투명 배경 테두리와 압축 흔적이 보이지 않는다.

## 필수 품질 표면

- 글꼴/타이포그래피: 브랜드 이미지 외의 글꼴, 굵기, 크기, 행간과 줄바꿈은 변경하지 않았다.
- 간격/레이아웃: 401px에서 96px 로고와 40px 버튼이 8px 간격으로 정렬되고, 390px에서는 로고만 80px로 축소되어 충돌을 방지한다. 브랜드 영역 높이 79px과 이후 콘텐츠 좌표는 유지된다.
- 색상/토큰: 기존 블루·네이비 v3 스킨과 의미 색상에 변경이 없다.
- 이미지 품질: 사용자가 제공한 투명 PNG를 그대로 사용하고 `next/image`가 원본 비율로 렌더링한다.
- 문구/콘텐츠: 문구와 동적 콘텐츠를 변경하지 않았다.
- 아이콘/접근성: 기존 Excel 아이콘과 `엑셀 다운로드` 접근성 이름을 유지한다. 로고 대체 텍스트는 `JY:ON`이다.

## 상호작용 및 런타임

- 테스트 흐름: `/login` → 개발용 master 로그인 → `/admin` → `사용자 관리` 클릭 → `/admin?section=users` 이동 → 로고 유지 확인.
- 일반 admin 로그인에서는 `.brand-logo-row .admin-export-icon` 개수가 `0`임을 확인했다.
- 관리자 메뉴 4개와 기존 화면 전환 구조가 유지된다.
- 브라우저 `pageerror`와 console error 없음.
- Next.js Build/Runtime Error 오버레이 없음. 개발 모드의 `N` 도구만 표시된다.

## 비교 이력

1. 이전 로고 교체 검증에서는 80px 로고와 기존 Excel 버튼 좌표를 기준으로 통과했다.
2. 최신 요청에서 로고 확대와 Excel 버튼 이동이 지정됐지만, 첨부 이미지의 박스가 보이지 않아 사용자 선택으로 "로고 오른쪽" 배치를 확정했다.
3. 401px 로고 96px, 390px 이하 로고 80px, Excel 버튼 8px 인접 배치를 적용했다.
4. 동일 크기 전체·헤더 집중 비교와 master/admin 권한별 Chrome 재검증 결과, 수정이 필요한 P0/P1/P2 차이가 발견되지 않았다.

## 최종 결과

final result: passed
