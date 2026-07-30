import { expect, test } from "@playwright/test";

const manifestIcons = [
  {
    src: "/icons/icon-192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/icons/icon-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/icons/icon-maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
];

const staticIcons = [
  { path: "/icons/apple-touch-icon.png", width: 180, height: 180 },
  { path: "/icons/icon-192.png", width: 192, height: 192 },
  { path: "/icons/icon-512.png", width: 512, height: 512 },
  { path: "/icons/icon-maskable-512.png", width: 512, height: 512 },
];

function readPngSize(bytes: Buffer) {
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test.describe("PWA install icons", () => {
  test("serves all install icons with their required PNG dimensions", async ({ request }) => {
    for (const icon of staticIcons) {
      const response = await request.get(icon.path);

      expect(response.ok(), `${icon.path} should respond successfully`).toBe(true);
      expect(response.headers()["content-type"]).toContain("image/png");
      expect(readPngSize(await response.body())).toEqual({
        width: icon.width,
        height: icon.height,
      });
    }
  });

  test("publishes the supplied icons without changing the existing manifest settings", async ({
    request,
  }) => {
    const response = await request.get("/manifest.webmanifest");
    const manifest = (await response.json()) as Record<string, unknown>;

    expect(response.ok()).toBe(true);
    expect(manifest).toMatchObject({
      name: "JY-ON",
      short_name: "JY-ON",
      description: "보안 사업장 출퇴근 및 TBM 출문 관리 웹앱",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#0f6d5f",
    });
    expect(manifest.icons).toEqual(manifestIcons);
  });

  test("renders one Apple touch icon link with the cache-busted path", async ({ request }) => {
    const response = await request.get("/login");
    const html = await response.text();
    const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
    const appleLinks = head
      .match(/<link\b[^>]*>/gi)
      ?.filter((link) => /\brel=["']apple-touch-icon["']/i.test(link));

    expect(response.ok()).toBe(true);
    expect(appleLinks).toHaveLength(1);
    expect(appleLinks?.[0]).toContain('href="/icons/apple-touch-icon.png"');
    expect(appleLinks?.[0]).toContain('sizes="180x180"');
  });
});
