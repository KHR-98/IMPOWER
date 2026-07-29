# Header Logo And Excel Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 401px 모바일 관리자 화면에서 JY:ON 로고를 96px로 확대하고 master 전용 엑셀 버튼을 로고 바로 오른쪽에 배치하면서 좁은 화면과 기존 헤더 흐름을 보호한다.

**Architecture:** 기존 `brand-logo-row`의 DOM 순서와 권한 조건은 유지한다. `next/image`의 반응형 `sizes`와 v3 스킨의 로고 너비만 변경하고, 400px 이하에는 기존 80px 안전 크기를 적용한다.

**Tech Stack:** Next.js App Router, React Server Components, `next/image`, CSS, Node 정적 계약 검증, Playwright + 설치된 Chrome

## Global Constraints

- 엑셀 버튼은 기존 `session.role === "master"` 조건을 유지한다.
- `AdminExportPanel`의 URL, 다운로드 동작과 아이콘은 변경하지 않는다.
- 401px에서 로고 96px, 엑셀 버튼 40px, 두 요소 사이 기존 8px 간격을 사용한다.
- 400px 이하에서는 로고를 80px로 축소한다.
- 브랜드 행 높이 79px, 부서 칩과 본문 세로 위치는 유지한다.
- 인증, 권한, 출결, GPS, MDM, API와 데이터 저장 코드는 변경하지 않는다.
- 현재 워크트리의 기존 변경을 보존하며 커밋하지 않는다.

---

### Task 1: 반응형 로고와 엑셀 버튼 배치 계약

**Files:**
- Modify: `scripts/verify-design-v3-skin.cjs`
- Modify: `app/(protected)/layout.tsx`
- Modify: `app/design-v3.css`

**Interfaces:**
- Consumes: 기존 `brand-logo-row`, `brand-logo`, `AdminExportPanel`, `session.role === "master"`.
- Produces: 401px 이상 로고 96–112px, 400px 이하 로고 80px인 동일 DOM 헤더.

- [ ] **Step 1: 실패하는 배치 계약 작성**

`scripts/verify-design-v3-skin.cjs`가 다음 문자열과 기존 권한 조건을 요구하도록 변경한다.

```js
assert.ok(
  protectedLayout.includes('sizes="(max-width: 400px) 80px, (max-width: 780px) 96px, 112px"'),
  "the optimized image sizes must match the responsive logo slot",
);
assert.ok(
  skin.includes("width: clamp(96px, 8.5vw, 112px)"),
  "the standard mobile logo must fill the approved brand slot",
);
assert.ok(
  skin.includes("@media (max-width: 400px)"),
  "narrow mobile screens must keep a collision-safe logo size",
);
assert.ok(
  protectedLayout.includes('session.role === "master"'),
  "the export control must remain master-only",
);
```

- [ ] **Step 2: 계약이 현재 구현에서 실패하는지 확인**

Run: `node scripts/verify-design-v3-skin.cjs`

Expected: FAIL with `the optimized image sizes must match the responsive logo slot` or `the standard mobile logo must fill the approved brand slot`.

- [ ] **Step 3: 최소 반응형 구현 적용**

`app/(protected)/layout.tsx`의 이미지 속성을 다음과 같이 변경한다.

```tsx
sizes="(max-width: 400px) 80px, (max-width: 780px) 96px, 112px"
```

`app/design-v3.css`의 로고 규칙을 다음과 같이 변경한다.

```css
.design-v3 .brand-logo {
  display: block;
  width: clamp(96px, 8.5vw, 112px);
  height: auto;
  margin-top: 4px;
  object-fit: contain;
  object-position: left top;
}

@media (max-width: 400px) {
  .design-v3 .brand-logo {
    width: 80px;
  }
}
```

- [ ] **Step 4: 계약 통과 확인**

Run: `node scripts/verify-design-v3-skin.cjs`

Expected: `design-v3 skin contract: ok`.

### Task 2: 모바일 렌더링 및 기능 회귀 검수

**Files:**
- Modify: `design-qa.md`
- Temporary: 시스템 임시 폴더의 Chrome 캡처와 비교 이미지

**Interfaces:**
- Consumes: 실행 중인 `http://localhost:3000`, 개발용 master 로그인, 기준 캡처 `codex-clipboard-1tX9Bv.png`.
- Produces: 401px/390px 배치 좌표, 콘솔 상태, 전후 비교와 `final result: passed` 또는 `blocked`.

- [ ] **Step 1: 401px master 헤더 검수**

설치된 Chrome을 Playwright로 열고 다음을 확인한다.

```js
assert.ok(logoBox.width >= 95 && logoBox.width <= 97);
assert.ok(exportBox.x >= 117 && exportBox.x <= 119);
assert.ok(logoRowBox.x + logoRowBox.width < controlsBox.x);
assert.equal(await page.locator(".admin-section-link").count(), 4);
```

- [ ] **Step 2: 390px 축소와 권한 검수**

390px에서는 로고 너비가 80px이고 master 엑셀 버튼이 우측 컨트롤과 겹치지 않는지 확인한다. 일반 admin 로그인에서는 `.brand-logo-row .admin-export-icon` 개수가 0인지 확인한다.

- [ ] **Step 3: 같은 상태의 비교 이미지 생성 및 확인**

기준 캡처와 401px 구현 캡처를 각각 `401 × 725px`, `deviceScaleFactor: 1`로 맞춰 나란히 비교한다. 로고·엑셀 버튼 외의 헤더와 본문 이동을 P2 이상 차이로 처리한다.

- [ ] **Step 4: QA 문서 갱신**

`design-qa.md`에 기준 이미지, 최신 구현 캡처, 좌표, 상호작용, 콘솔 상태, 비교 이력을 기록한다. P0/P1/P2가 없을 때만 정확히 다음을 유지한다.

```md
final result: passed
```

- [ ] **Step 5: 최종 정적 검증**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

Run: `git diff --check`

Expected: 새 whitespace 오류 없음.
