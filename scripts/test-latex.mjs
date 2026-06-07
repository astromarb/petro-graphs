// Playwright: test LaTeX rendering in Petro Graphs
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const save  = (name, buf) => { writeFileSync(join(__dir, name), buf); console.log(`  → ${name}`); };

const browser = await chromium.launch({ headless: false, slowMo: 120 });
const page    = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto('http://localhost:5173');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1500);

// ── 1. Select text tool and click canvas ─────────────────────────────────
await page.locator('button[title*="Text" i]').click();
await page.waitForTimeout(300);

const canvasEl = page.locator('canvas').first();
const box      = await canvasEl.boundingBox();
await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.35);
await page.waitForTimeout(800);

save('ss1-text-placed.png', await page.screenshot());
console.log('✓ Text object placed and selected (right panel visible)');

// ── 2. Enable LaTeX mode via the "LaTeX" checkbox in the right panel ──────
// The checkbox sits next to the "LaTeX" label in the Text content row
const latexCheckbox = page.locator('input[type="checkbox"]').first();
const isChecked = await latexCheckbox.isChecked();
console.log(`LaTeX checkbox checked: ${isChecked}`);

if (!isChecked) {
  await latexCheckbox.click();
  await page.waitForTimeout(400);
  console.log('✓ LaTeX mode enabled');
}

save('ss2-latex-mode.png', await page.screenshot());

// ── 3. Type E=mc^2 in the textarea ───────────────────────────────────────
const textarea = page.locator('textarea').first();
await textarea.click();
await page.keyboard.press('Control+a');
await textarea.fill('E=mc^2');
console.log('✓ Typed: E=mc^2');

// Wait for MathJax to initialize and render (~1-2s first time)
await page.waitForTimeout(3500);
save('ss3-Emc2.png', await page.screenshot());

// ── 4. Type a fraction ───────────────────────────────────────────────────
await textarea.click();
await page.keyboard.press('Control+a');
await textarea.fill('\\frac{\\partial P}{\\partial T}\\bigg|_V');
await page.waitForTimeout(2500);
save('ss4-fraction.png', await page.screenshot());
console.log('✓ Typed partial derivative expression');

// ── 5. Type a geoscience expression ──────────────────────────────────────
await textarea.click();
await page.keyboard.press('Control+a');
await textarea.fill('\\Delta G = \\Delta H - T\\Delta S');
await page.waitForTimeout(2500);
save('ss5-gibbs.png', await page.screenshot());
console.log('✓ Typed Gibbs free energy expression');

// ── 6. Zoom into canvas to see math detail ───────────────────────────────
await page.keyboard.press('+');
await page.keyboard.press('+');
await page.keyboard.press('+');
await page.waitForTimeout(400);
save('ss6-zoomed.png', await page.screenshot());

console.log('\nDone. All screenshots saved.');
await browser.close();
