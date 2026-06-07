// Debug: capture browser console errors during LaTeX rendering
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch({ headless: false, slowMo: 80 });
const page    = await browser.newPage({ viewport: { width: 1400, height: 900 } });

// Capture ALL console messages and errors
const logs = [];
page.on('console', msg => {
  logs.push(`[${msg.type()}] ${msg.text()}`);
  if (msg.type() === 'error') console.error('CONSOLE ERROR:', msg.text());
});
page.on('pageerror', err => {
  logs.push(`[pageerror] ${err.message}`);
  console.error('PAGE ERROR:', err.message);
});

await page.goto('http://localhost:5173');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1500);

// Place a text object and enable LaTeX
await page.locator('button[title*="Text" i]').click();
await page.waitForTimeout(200);
const box = await page.locator('canvas').first().boundingBox();
await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.35);
await page.waitForTimeout(600);

// Enable LaTeX
const cb = page.locator('input[type="checkbox"]').first();
if (!await cb.isChecked()) await cb.click();
await page.waitForTimeout(200);

// Type a simple expression
const ta = page.locator('textarea').first();
await ta.click();
await page.keyboard.press('Control+a');
await ta.fill('E=mc^2');
console.log('\n⏳ Waiting 5s for MathJax to load and render...');
await page.waitForTimeout(5000);

writeFileSync(join(__dir, 'ss-debug.png'), await page.screenshot());

// Also inject a direct call to renderLatexToFabricImage and report result
const result = await page.evaluate(async () => {
  try {
    // The module should be importable via the dev server
    const mod = await import('/src/latexRenderer.ts');
    const fImg = await mod.renderLatexToFabricImage('E=mc^2', 16, '#000000');
    return { ok: true, width: fImg.width, height: fImg.height };
  } catch (e) {
    return { ok: false, error: String(e), stack: e?.stack };
  }
});
console.log('\n=== Direct renderLatexToFabricImage call ===');
console.log(JSON.stringify(result, null, 2));

console.log('\n=== Console log summary ===');
logs.forEach(l => console.log(l));

await browser.close();
