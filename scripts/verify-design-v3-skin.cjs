const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const layout = read("app/layout.tsx");
const skinPath = path.join(root, "app/design-v3.css");

assert.ok(fs.existsSync(skinPath), "app/design-v3.css must exist");

const skin = fs.readFileSync(skinPath, "utf8");
const globalsImport = layout.indexOf('import "./globals.css";');
const skinImport = layout.indexOf('import "./design-v3.css";');

assert.ok(globalsImport >= 0, "globals.css import must be preserved");
assert.ok(
  skinImport > globalsImport,
  "design-v3.css must load after globals.css",
);
assert.match(
  layout,
  /<body\s+className=["']design-v3["']>/,
  "the skin must be scoped from body.design-v3",
);

const requiredTokens = [
  "--design-bg: #eaf1ff",
  "--design-text: #172044",
  "--design-muted: #66739b",
  "--design-brand: #3d5eb7",
  "--design-brand-strong: #293986",
  "--design-success: #247965",
  "--design-warning: #9e671d",
];

for (const token of requiredTokens) {
  assert.ok(skin.includes(token), `missing selected mockup token: ${token}`);
}

const requiredSurfaces = [
  ".design-v3",
  ".login-shell",
  ".login-card",
  ".login-brand-strip",
  ".dev-login-button",
  ".shell",
  ".topbar",
  ".check-card",
  ".check-button",
  ".admin-console",
  ".admin-section-link",
  ".glass-panel",
  ".table-panel",
  ".field input",
  ".consent-modal",
  ".user-location-map-canvas",
];

for (const selector of requiredSurfaces) {
  assert.ok(skin.includes(selector), `missing skin coverage: ${selector}`);
}

assert.doesNotMatch(
  skin,
  /(?:^|[;{])\s*order\s*:/m,
  "the visual skin must not reorder controls",
);
assert.doesNotMatch(
  skin,
  /\bposition\s*:\s*(?:fixed|absolute)\b/i,
  "the visual skin must not reposition controls out of their current flow",
);

const loginForm = read("components/login-form.tsx");
for (const role of ["master", "admin", "sub_admin", "user"]) {
  assert.ok(loginForm.includes(`role: "${role}"`), `login role lost: ${role}`);
}

const attendancePanel = read("components/attendance-action-panel.tsx");
assert.ok(
  attendancePanel.includes('fetch(`/api/attendance/${action}`'),
  "attendance API behavior must stay connected",
);

const protectedLayout = read("app/(protected)/layout.tsx");
const brandLogoPath = path.join(root, "public/brand/jyon-logo.png");

assert.ok(fs.existsSync(brandLogoPath), "the supplied JY:ON logo asset must be copied into public/brand");
assert.ok(protectedLayout.includes('import Image from "next/image";'), "the optimized Next image component must render the logo");
assert.ok(protectedLayout.includes('src="/brand/jyon-logo.png"'), "the protected header must use the JY:ON logo");
assert.ok(protectedLayout.includes('alt="JY:ON"'), "the brand image must have an accessible name");
assert.ok(protectedLayout.includes('className="brand-logo"'), "the brand image must use the scoped logo slot");
assert.ok(!protectedLayout.includes('<span className="brand-kicker">아임파워(주)</span>'), "the old company text must be replaced by the logo");
assert.ok(!protectedLayout.includes('<span className="brand-title">IM-ON</span>'), "the old IM-ON wordmark must be replaced by the logo");
assert.ok(skin.includes(".brand-logo"), "the skin must size the supplied logo without distorting it");
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
assert.ok(skin.includes("min-height: 79px"), "the brand slot must preserve the existing vertical rhythm");
assert.ok(protectedLayout.includes("view-toggle-fixed"), "view switch must stay");
assert.ok(protectedLayout.includes("로그아웃"), "logout control must stay");
assert.ok(protectedLayout.includes("AdminExportPanel"), "the master export control must stay");
assert.ok(
  protectedLayout.includes('session.role === "master"'),
  "the export control must remain master-only",
);
assert.ok(protectedLayout.includes("brand-department-chip"), "the department chip must stay");

const adminPage = read("app/(protected)/admin/page.tsx");
for (const section of ["overview", "users", "accounts", "system"]) {
  assert.ok(adminPage.includes(`key: "${section}"`), `admin section lost: ${section}`);
}

console.log("design-v3 skin contract: ok");
