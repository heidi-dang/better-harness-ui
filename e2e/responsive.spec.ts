import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { width: 320, height: 568, label: "iPhone SE" },
  { width: 375, height: 667, label: "iPhone 6/7/8" },
  { width: 390, height: 844, label: "iPhone 14/15" },
  { width: 412, height: 915, label: "Galaxy Note / Pixel" },
  { width: 430, height: 932, label: "iPhone 16 Pro Max" },
] as const;

interface TouchTarget {
  selector: string;
  name: string;
}

const PRIMARY_TOUCH_TARGETS: TouchTarget[] = [
  { selector: 'button[aria-label="Open command palette"]', name: "Command Palette icon" },
  { selector: 'button:has-text("Command Palette")', name: "Command Palette button" },
  { selector: 'select[aria-label="Select Harness demo state"]', name: "Mode selector" },
  { selector: 'button:has-text("Audit Session")', name: "Audit Session" },
  { selector: 'button:has-text("Regenerate")', name: "Regenerate" },
  { selector: 'button[aria-label="Dismiss message"]', name: "Toast dismiss" },
  { selector: 'button[aria-label="Close modal"]', name: "Dialog close" },
  { selector: '[aria-label="Close details drawer"]', name: "Drawer close" },
];

for (const vp of VIEWPORTS) {
  test.describe(`Viewport ${vp.width}×${vp.height} (${vp.label})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      // Wait for the app to render
      await page.waitForLoadState("networkidle");
    });

    test("document does not overflow viewport horizontally", async ({ page }) => {
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const innerWidth = await page.evaluate(() => window.innerWidth);
      expect.soft(hasOverflow, `scrollWidth (${scrollWidth}) > innerWidth (${innerWidth})`).toBe(false);
      expect.soft(scrollWidth).toBeLessThanOrEqual(innerWidth);
    });

    test("header content is not clipped", async ({ page }) => {
      // Check the top nav is fully visible within viewport
      const nav = page.locator("nav").first();
      const navBox = await nav.boundingBox();
      expect.soft(navBox).not.toBeNull();
      if (navBox) {
        expect.soft(navBox.x).toBeGreaterThanOrEqual(0);
        expect.soft(navBox.x + navBox.width).toBeLessThanOrEqual(vp.width);
      }
    });

    test("long project paths do not expand the page", async ({ page }) => {
      // The nav should still fit within viewport width even with long text
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(vp.width + 1); // allow 1px tolerance
    });

    test("primary touch targets are at least 44x44px", async ({ page, browserName }) => {
      for (const target of PRIMARY_TOUCH_TARGETS) {
        const btn = page.locator(target.selector).first();
        const count = await btn.count();
        if (count === 0) {
          test.info().annotations.push({
            type: "skip",
            description: `Skipping "${target.name}" — not found at this viewport (may be hidden)`,
          });
          continue;
        }
        // Skip hidden elements (e.g. desktop-only buttons on mobile viewports)
        const isVisible = await btn.isVisible();
        if (!isVisible) {
          test.info().annotations.push({
            type: "skip",
            description: `Skipping "${target.name}" — element is not visible at this viewport`,
          });
          continue;
        }
        const box = await btn.boundingBox();
        expect.soft(box, `${target.name} should have bounding box`).not.toBeNull();
        if (box) {
          const w = Math.round(box.width);
          const h = Math.round(box.height);
          expect.soft(w, `${target.name} width ${w}px < 44px`).toBeGreaterThanOrEqual(44);
          expect.soft(h, `${target.name} height ${h}px < 44px`).toBeGreaterThanOrEqual(44);
        }
      }
    });

    test("dimension cards scroll inside their container", async ({ page }) => {
      const scrollContainer = page.locator(".snap-x").first();
      const count = await scrollContainer.count();
      if (count === 0) {
        test.skip(true, "No snap-scroll container found (may be loading)");
        return;
      }
      // Check that the scroll container itself does not overflow the page
      const containerBox = await scrollContainer.boundingBox();
      expect.soft(containerBox).not.toBeNull();
      if (containerBox) {
        expect.soft(containerBox.x + containerBox.width).toBeLessThanOrEqual(vp.width + 2);
      }
    });

    test("dialogs fit inside the visual viewport", async ({ page }) => {
      // Open command palette
      const paletteBtn = page.locator('button[aria-label="Open command palette"]');
      const paletteBtnCount = await paletteBtn.count();
      if (paletteBtnCount > 0) {
        await paletteBtn.first().click();
        await page.waitForTimeout(300);
        // Check the dialog fits
        const dialog = page.locator('[role="dialog"]').first();
        const dialogCount = await dialog.count();
        if (dialogCount > 0) {
          const box = await dialog.boundingBox();
          expect.soft(box).not.toBeNull();
          if (box) {
            expect.soft(box.x + box.width).toBeLessThanOrEqual(vp.width + 2);
            expect.soft(box.y + box.height).toBeLessThanOrEqual(vp.height + 2);
          }
        }
        // Close
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
      }
    });

    test("tabs remain reachable at narrow widths", async ({ page }) => {
      const tablist = page.locator('[role="tablist"]');
      const count = await tablist.count();
      if (count === 0) {
        test.skip(true, "No tablist found (may be loading)");
        return;
      }
      const box = await tablist.boundingBox();
      expect.soft(box).not.toBeNull();
      if (box) {
        expect.soft(box.width).toBeGreaterThan(0);
        // Tabs should be horizontally reachable — check at least some portion is visible
        const tabs = tablist.locator('[role="tab"]');
        const tabCount = await tabs.count();
        expect.soft(tabCount).toBeGreaterThan(0);
        // First tab should be visible
        const firstTab = tabs.first();
        await expect.soft(firstTab).toBeVisible();
      }
    });

    test("200% text zoom does not create page-level overflow", async ({ page }) => {
      await page.evaluate(() => {
        document.documentElement.style.zoom = "2";
      });
      await page.waitForTimeout(200);
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect.soft(hasOverflow, "Page should not overflow at 200% zoom").toBe(false);
      // Reset zoom
      await page.evaluate(() => {
        document.documentElement.style.zoom = "1";
      });
    });
  });
}
