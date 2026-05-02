import PptxGenJS from "pptxgenjs";

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE";

const BRAND = "#0F6D5F";
const BRAND_LIGHT = "#E6F4F1";
const GRAY = "#6B7280";
const WHITE = "#FFFFFF";
const DARK = "#111827";
const ACCENT = "#F59E0B";
const RED = "#EF4444";
const GREEN = "#10B981";

// ─── 슬라이드 1: 표지 ───────────────────────────────────────────────────────
{
  const slide = pptx.addSlide();
  slide.background = { color: BRAND };

  slide.addText("IM-ON 출결 시스템", {
    x: 1, y: 1.2, w: 11, h: 1.0,
    fontSize: 36, bold: true, color: WHITE, align: "center",
    fontFace: "Malgun Gothic",
  });

  slide.addText("GitHub PR 브랜치 기능 분석", {
    x: 1, y: 2.4, w: 11, h: 0.7,
    fontSize: 22, color: "A7D9D3", align: "center",
    fontFace: "Malgun Gothic",
  });

  slide.addText("2026.05.01", {
    x: 1, y: 4.2, w: 11, h: 0.5,
    fontSize: 14, color: "A7D9D3", align: "center",
    fontFace: "Malgun Gothic",
  });
}

// ─── 슬라이드 2: 브랜치 현황 요약 ─────────────────────────────────────────
{
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };

  slide.addText("브랜치 현황 요약", {
    x: 0.5, y: 0.3, w: 12, h: 0.7,
    fontSize: 24, bold: true, color: BRAND, fontFace: "Malgun Gothic",
  });

  slide.addShape(pptx.ShapeType.line, {
    x: 0.5, y: 1.05, w: 12, h: 0,
    line: { color: BRAND, width: 2 },
  });

  const rows = [
    [
      { text: "브랜치", options: { bold: true, color: WHITE, fill: BRAND, align: "center" } },
      { text: "상태", options: { bold: true, color: WHITE, fill: BRAND, align: "center" } },
      { text: "핵심 내용", options: { bold: true, color: WHITE, fill: BRAND, align: "center" } },
      { text: "변경 규모", options: { bold: true, color: WHITE, fill: BRAND, align: "center" } },
    ],
    [
      { text: "KHR", options: { align: "center" } },
      { text: "main과 동일", options: { color: GRAY, align: "center" } },
      { text: "없음", options: { color: GRAY } },
      { text: "—", options: { align: "center" } },
    ],
    [
      { text: "KHR-SOOJUNG1", options: { align: "center" } },
      { text: "main과 동일", options: { color: GRAY, align: "center" } },
      { text: "없음", options: { color: GRAY } },
      { text: "—", options: { align: "center" } },
    ],
    [
      { text: "codex/department-\nrole-settings", options: { align: "center", bold: true } },
      { text: "미병합", options: { color: ACCENT, bold: true, align: "center" } },
      { text: "부서 관리 시스템 + 역할 추가", options: {} },
      { text: "+749 / -84\n30개 파일", options: { align: "center" } },
    ],
    [
      { text: "yechan-work", options: { align: "center", bold: true } },
      { text: "미병합", options: { color: ACCENT, bold: true, align: "center" } },
      { text: "모바일 대시보드 테이블 UI 개선", options: {} },
      { text: "+138 / -37\n5개 파일", options: { align: "center" } },
    ],
    [
      { text: "yechan-work-2", options: { align: "center" } },
      { text: "미병합(중복)", options: { color: GRAY, align: "center" } },
      { text: "yechan-work와 동일", options: { color: GRAY } },
      { text: "+138 / -37\n5개 파일", options: { align: "center" } },
    ],
    [
      { text: "revert-1-yechan-work", options: { align: "center" } },
      { text: "리버트", options: { color: RED, align: "center" } },
      { text: "yechan-work 변경 취소 브랜치", options: { color: GRAY } },
      { text: "—", options: { align: "center" } },
    ],
  ];

  slide.addTable(rows, {
    x: 0.5, y: 1.2, w: 12.3, h: 4.2,
    fontSize: 11,
    fontFace: "Malgun Gothic",
    border: { type: "solid", color: "E5E7EB", pt: 1 },
    rowH: 0.55,
    colW: [2.6, 1.6, 5.5, 2.0],
  });
}

// ─── 슬라이드 3: codex/department-role-settings ─────────────────────────
{
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };

  slide.addText("codex / department-role-settings", {
    x: 0.5, y: 0.3, w: 12, h: 0.6,
    fontSize: 22, bold: true, color: BRAND, fontFace: "Malgun Gothic",
  });

  slide.addText("부서 관리 시스템 신규 도입", {
    x: 0.5, y: 0.9, w: 12, h: 0.4,
    fontSize: 14, color: GRAY, fontFace: "Malgun Gothic",
  });

  slide.addShape(pptx.ShapeType.line, {
    x: 0.5, y: 1.3, w: 12, h: 0,
    line: { color: BRAND, width: 2 },
  });

  // 카드 1: DB
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.4, y: 1.45, w: 5.9, h: 1.7,
    fill: { color: BRAND_LIGHT }, line: { color: BRAND, pt: 1 },
    rectRadius: 0.1,
  });
  slide.addText("🗄️  데이터베이스 마이그레이션", {
    x: 0.6, y: 1.55, w: 5.5, h: 0.4,
    fontSize: 12, bold: true, color: BRAND, fontFace: "Malgun Gothic",
  });
  slide.addText(
    "• departments 테이블 생성\n  (메모리PCS / 파운드리PCS / 메모리)\n• department_settings 테이블 생성\n• users.department_id FK 컬럼 추가",
    { x: 0.6, y: 1.95, w: 5.5, h: 1.1, fontSize: 11, color: DARK, fontFace: "Malgun Gothic" }
  );

  // 카드 2: 역할
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 6.5, y: 1.45, w: 6.1, h: 1.7,
    fill: { color: BRAND_LIGHT }, line: { color: BRAND, pt: 1 },
    rectRadius: 0.1,
  });
  slide.addText("👤  신규 사용자 역할", {
    x: 6.7, y: 1.55, w: 5.7, h: 0.4,
    fontSize: 12, bold: true, color: BRAND, fontFace: "Malgun Gothic",
  });
  slide.addText(
    "• department_admin 역할 신규 추가\n• isAdminRole(): department_admin + admin 인정\n• isSystemAdminRole(): admin만 구분\n• 기존: user / admin → 추가: department_admin",
    { x: 6.7, y: 1.95, w: 5.7, h: 1.1, fontSize: 11, color: DARK, fontFace: "Malgun Gothic" }
  );

  // 카드 3: 시간 설정
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.4, y: 3.3, w: 5.9, h: 2.1,
    fill: { color: BRAND_LIGHT }, line: { color: BRAND, pt: 1 },
    rectRadius: 0.1,
  });
  slide.addText("⏰  부서별 출퇴근 시간 독립 설정", {
    x: 0.6, y: 3.4, w: 5.5, h: 0.4,
    fontSize: 12, bold: true, color: BRAND, fontFace: "Malgun Gothic",
  });
  slide.addText(
    "• 주간조 / 늦조 각각 개별 시간 설정\n• 출근·오전TBM·점심·오후TBM·퇴근TBM·퇴근\n• 조기퇴근 시간대 포함\n• 부서별 다른 시간대 운영 가능",
    { x: 0.6, y: 3.8, w: 5.5, h: 1.5, fontSize: 11, color: DARK, fontFace: "Malgun Gothic" }
  );

  // 카드 4: 규모
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 6.5, y: 3.3, w: 6.1, h: 2.1,
    fill: { color: BRAND_LIGHT }, line: { color: BRAND, pt: 1 },
    rectRadius: 0.1,
  });
  slide.addText("📊  변경 규모", {
    x: 6.7, y: 3.4, w: 5.7, h: 0.4,
    fontSize: 12, bold: true, color: BRAND, fontFace: "Malgun Gothic",
  });
  slide.addText(
    "• 커밋 3개\n• 30개 파일 변경\n• +749 lines 추가 / -84 lines 삭제\n• SQL 마이그레이션 2개 포함",
    { x: 6.7, y: 3.8, w: 5.7, h: 1.5, fontSize: 11, color: DARK, fontFace: "Malgun Gothic" }
  );
}

// ─── 슬라이드 4: yechan-work ────────────────────────────────────────────────
{
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };

  slide.addText("yechan-work", {
    x: 0.5, y: 0.3, w: 12, h: 0.6,
    fontSize: 22, bold: true, color: BRAND, fontFace: "Malgun Gothic",
  });

  slide.addText("관리자 대시보드 모바일 테이블 UI 개선", {
    x: 0.5, y: 0.9, w: 12, h: 0.4,
    fontSize: 14, color: GRAY, fontFace: "Malgun Gothic",
  });

  slide.addShape(pptx.ShapeType.line, {
    x: 0.5, y: 1.3, w: 12, h: 0,
    line: { color: BRAND, width: 2 },
  });

  const items = [
    { title: "📱  가로 스크롤 래퍼", desc: "admin-status-table-scroll 클래스 추가\n모바일에서 테이블 좌우 스크롤 가능" },
    { title: "📌  이름 열 Sticky 고정", desc: "첫 번째 열(이름) sticky positioning 적용\n스크롤 시에도 이름 항상 표시" },
    { title: "🟢  상태 시각화", desc: "완료/미완료를 status-pill로 표시\n완료: 초록 테두리 + 시간 | 미완료: 주황 테두리" },
    { title: "📐  반응형 레이아웃", desc: "각 행 min-width: 706px 설정\noverflow-x auto로 모바일 최적화" },
  ];

  items.forEach((item, i) => {
    const x = i % 2 === 0 ? 0.4 : 6.5;
    const y = i < 2 ? 1.5 : 3.5;

    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 5.9, h: 1.7,
      fill: { color: BRAND_LIGHT }, line: { color: BRAND, pt: 1 },
      rectRadius: 0.1,
    });
    slide.addText(item.title, {
      x: x + 0.2, y: y + 0.1, w: 5.5, h: 0.45,
      fontSize: 12, bold: true, color: BRAND, fontFace: "Malgun Gothic",
    });
    slide.addText(item.desc, {
      x: x + 0.2, y: y + 0.55, w: 5.5, h: 1.05,
      fontSize: 11, color: DARK, fontFace: "Malgun Gothic",
    });
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.4, y: 5.35, w: 12, h: 0.45,
    fill: { color: "FEF3C7" }, line: { color: ACCENT, pt: 1 },
    rectRadius: 0.08,
  });
  slide.addText("커밋 1개 | 5개 파일 변경 | +138 / -37 lines  •  yechan-work-2는 동일 내용의 중복 브랜치", {
    x: 0.6, y: 5.38, w: 11.8, h: 0.38,
    fontSize: 11, color: "92400E", fontFace: "Malgun Gothic", align: "center",
  });
}

// ─── 슬라이드 5: 병합 권고 ──────────────────────────────────────────────────
{
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };

  slide.addText("병합 권고 및 액션 아이템", {
    x: 0.5, y: 0.3, w: 12, h: 0.6,
    fontSize: 22, bold: true, color: BRAND, fontFace: "Malgun Gothic",
  });

  slide.addShape(pptx.ShapeType.line, {
    x: 0.5, y: 1.0, w: 12, h: 0,
    line: { color: BRAND, width: 2 },
  });

  const actions = [
    { priority: "1순위", branch: "yechan-work", action: "즉시 병합 가능", detail: "모바일 UI 개선, 충돌 없음. yechan-work-2는 중복이므로 삭제 권고.", color: GREEN },
    { priority: "2순위", branch: "codex/department-role-settings", action: "검토 후 병합", detail: "main에 유사 기능이 이미 있어 충돌 검토 필요. 마이그레이션 SQL 실행 선행 필요.", color: ACCENT },
    { priority: "정리", branch: "KHR / KHR-SOOJUNG1", action: "브랜치 삭제", detail: "main과 동일 상태. 더 이상 필요 없으면 삭제 권고.", color: GRAY },
    { priority: "정리", branch: "revert-1-yechan-work", action: "브랜치 삭제", detail: "리버트 목적의 임시 브랜치. 이미 반영됐으면 삭제 권고.", color: RED },
  ];

  actions.forEach((item, i) => {
    const y = 1.2 + i * 1.15;

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.4, y, w: 12.2, h: 1.0,
      fill: { color: WHITE }, line: { color: item.color, pt: 2 },
      rectRadius: 0.1,
    });

    slide.addText(item.priority, {
      x: 0.6, y: y + 0.1, w: 1.4, h: 0.35,
      fontSize: 11, bold: true, color: WHITE, align: "center",
      fill: item.color, fontFace: "Malgun Gothic",
    });

    slide.addText(item.branch, {
      x: 2.2, y: y + 0.05, w: 4.0, h: 0.4,
      fontSize: 12, bold: true, color: DARK, fontFace: "Malgun Gothic",
    });

    slide.addText(item.action, {
      x: 6.3, y: y + 0.05, w: 2.5, h: 0.4,
      fontSize: 12, bold: true, color: item.color, fontFace: "Malgun Gothic",
    });

    slide.addText(item.detail, {
      x: 2.2, y: y + 0.52, w: 10.0, h: 0.38,
      fontSize: 10, color: GRAY, fontFace: "Malgun Gothic",
    });
  });
}

const outputPath = "PR_브랜치_분석.pptx";
await pptx.writeFile({ fileName: outputPath });
console.log(`생성 완료: ${outputPath}`);
