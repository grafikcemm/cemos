import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync(".tmp", { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1200);

const accent = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
);
const accentHover = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--accent-hover").trim(),
);

// Active sidebar pill computed background (the visible teal element).
const pillBg = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="sidebar-area-bugun"]');
  if (!el) return "pill-not-found";
  const cs = getComputedStyle(el);
  return cs.backgroundImage || cs.backgroundColor;
});

console.log("COMPUTED --accent       :", accent);
console.log("COMPUTED --accent-hover :", accentHover);
console.log("ACTIVE PILL background   :", pillBg);

// Screenshot the active pill element directly → guaranteed to frame the teal.
const pill = page.locator('[data-testid="sidebar-area-bugun"]');
await pill.waitFor({ state: "visible", timeout: 10000 });
await pill.screenshot({ path: ".tmp/color-check.png" });
await browser.close();
console.log("screenshot: .tmp/color-check.png (aktif pill)");
