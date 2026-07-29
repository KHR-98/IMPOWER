const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  advanceAttendance,
  normalizeScreen,
  nextScreen,
  progressForState,
} = require("./assets/mockup-app.js");

const root = __dirname;
const pages = [
  "mockup-1-operational-navy.html",
  "mockup-2-deep-navy-console.html",
  "mockup-3-soft-blue-glass.html",
];

test("화면 전환은 로그인, 사용자, 관리자 순서로 순환한다", () => {
  assert.equal(nextScreen("login"), "user");
  assert.equal(nextScreen("user"), "admin");
  assert.equal(nextScreen("admin"), "login");
});

test("잘못된 화면 이름은 로그인 화면으로 정규화한다", () => {
  assert.equal(normalizeScreen("unknown"), "login");
  assert.equal(normalizeScreen("ADMIN"), "admin");
});

test("출근 버튼은 위치 확인을 거쳐 완료 상태로 진행한다", () => {
  assert.deepEqual(advanceAttendance("ready"), {
    state: "checking",
    label: "위치 확인 중",
    message: "GPS 정확도와 출입구 반경을 확인하고 있습니다.",
    subtext: "잠시만 기다려 주세요",
  });
  assert.deepEqual(advanceAttendance("checking"), {
    state: "success",
    label: "출근 완료",
    message: "07:42 출근이 기록되었습니다.",
    subtext: "07:42 기록 완료",
  });
});

test("출근 완료 시 오늘 진행률은 0/8에서 1/8로 바뀐다", () => {
  assert.deepEqual(progressForState("ready"), {
    completed: 0,
    total: 8,
    percent: 0,
    label: "0/8 완료",
  });
  assert.deepEqual(progressForState("success"), {
    completed: 1,
    total: 8,
    percent: 12.5,
    label: "1/8 완료",
  });
});

test("세 목업과 실제 로고 자산이 모두 존재한다", () => {
  const files = [
    "index.html",
    ...pages,
    path.join("assets", "juyon-snc-logo.png"),
    path.join("assets", "mockups.css"),
    path.join("assets", "mockup-app.js"),
  ];

  for (const file of files) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} 파일이 필요합니다.`);
  }
});

test("각 목업은 모바일 앱 셸과 세 화면을 제공한다", () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    assert.match(html, /<meta name="viewport"/);
    assert.match(html, /data-mobile-shell/);
    assert.match(html, /data-screen="login"/);
    assert.match(html, /data-screen="user"/);
    assert.match(html, /data-screen="admin"/);
    assert.match(html, /data-mobile-primary-action/);
    assert.match(html, /data-attendance-subtext/);
    assert.match(html, /assets\/juyon-snc-logo\.png/);
  }
});

test("세 목업 모두 핵심 한글 문구와 닫는 태그를 UTF-8로 보존한다", () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    assert.match(html, /좋은 아침이에요, 김민수 대원/);
    assert.match(html, /data-checkin-status>출근 전<\/span>/);
    assert.match(html, /data-attendance-label>출근하기<\/span>/);
  }
});

test("관리자 화면은 표 대신 모바일 목록과 네 개의 하단 탭을 사용한다", () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    const navTargets = html.match(/data-admin-target=/g) || [];
    assert.equal(navTargets.length, 4, `${page} 관리자 탭은 정확히 4개여야 합니다.`);
    assert.match(html, /data-mobile-admin-nav/);
    assert.doesNotMatch(html, /<table\b/i);
  }
});

test("공통 스타일은 430px 모바일 셸과 작은 화면 전체 폭 규칙을 갖는다", () => {
  const css = fs.readFileSync(path.join(root, "assets", "mockups.css"), "utf8");
  assert.match(css, /max-width:\s*430px/);
  assert.match(css, /min-height:\s*100svh/);
  assert.match(css, /@media\s*\(max-width:\s*480px\)/);
});
