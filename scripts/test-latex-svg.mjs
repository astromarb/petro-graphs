// Check the raw SVG MathJax 4 produces, then test visual rendering
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dir = dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch({ headless: false, slowMo: 80 });
const page    = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const logs = [];
page.on('console', m => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });

await page.goto('http://localhost:5173');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000); // let MathJax finish startup

// Inspect the raw SVG attributes from MathJax
const svgInfo = await page.evaluate(async () => {
  await MathJax.startup.promise;
  const container = MathJax.tex2svg('E=mc^2', { display: false });
  const svg = container.querySelector('svg');
  if (!svg) return { error: 'no svg' };
  return {
    width:   svg.getAttribute('width'),
    height:  svg.getAttribute('height'),
    viewBox: svg.getAttribute('viewBox'),
    outerHTML: svg.outerHTML.substring(0, 400),
  };
});
console.log('\n=== MathJax SVG attributes for E=mc^2 ===');
console.log(JSON.stringify(svgInfo, null, 2));

// Also check a display-mode fraction
const svgFrac = await page.evaluate(async () => {
  const container = MathJax.tex2svg('\\frac{\\partial P}{\\partial T}', { display: true });
  const svg = container.querySelector('svg');
  if (!svg) return { error: 'no svg' };
  return { width: svg.getAttribute('width'), height: svg.getAttribute('height') };
});
console.log('\n=== Fraction (display mode) ===');
console.log(JSON.stringify(svgFrac, null, 2));

// Now do the full visual test
await page.locator('button[title*="Text" i]').click();
await page.waitForTimeout(200);
const box = await page.locator('canvas').first().boundingBox();
await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.35);
await page.waitForTimeout(600);

const cb = page.locator('input[type="checkbox"]').first();
if (!await cb.isChecked()) await cb.click();
await page.waitForTimeout(200);

const ta = page.locator('textarea').first();
await ta.click();
await page.keyboard.press('Control+a');
await ta.fill('E=mc^2');
await page.waitForTimeout(2500);

writeFileSync(join(__dir, 'ss-v2-Emc2.png'), await page.screenshot());
console.log('\n→ ss-v2-Emc2.png saved');

await ta.click(); await page.keyboard.press('Control+a');
await ta.fill('\\frac{\\partial P}{\\partial T}\\bigg|_V');
await page.waitForTimeout(2500);

writeFileSync(join(__dir, 'ss-v2-fraction.png'), await page.screenshot());
console.log('→ ss-v2-fraction.png saved');

console.log('\n=== Warnings/errors ===');
logs.filter(l => !l.includes('[debug]')).forEach(l => console.log(l));

await browser.close();
