// Test panning, scroll-to-zoom, and PDF export
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const save = (name, buf) => { writeFileSync(join(__dir, name), buf); console.log(`  → ${name}`); };

const browser = await chromium.launch({ headless: false, slowMo: 80 });
const page    = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto('http://localhost:5173');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1500);

const canvasEl = page.locator('canvas').first();
const box = await canvasEl.boundingBox();
const cx = box.x + box.width  / 2;
const cy = box.y + box.height / 2;

// ── Baseline ─────────────────────────────────────────────────────────────────
save('pan-0-baseline.png', await page.screenshot());
console.log('✓ Baseline captured (100% zoom)');

// ── Scroll-to-zoom in ─────────────────────────────────────────────────────────
await page.mouse.move(cx, cy);
await page.mouse.wheel(0, -200); // scroll up = zoom in
await page.waitForTimeout(300);
await page.mouse.wheel(0, -200);
await page.waitForTimeout(300);
save('pan-1-zoomed-in.png', await page.screenshot());

// Read zoom indicator to confirm it changed
const zoomText = await page.locator('text=/\\d+%/').first().textContent().catch(() => 'n/a');
console.log(`✓ After zoom-in — zoom indicator: ${zoomText}`);

// ── Scroll-to-zoom out ────────────────────────────────────────────────────────
await page.mouse.wheel(0, 600);
await page.waitForTimeout(300);
save('pan-2-zoomed-out.png', await page.screenshot());

const zoomText2 = await page.locator('text=/\\d+%/').first().textContent().catch(() => 'n/a');
console.log(`✓ After zoom-out — zoom indicator: ${zoomText2}`);

// ── Pan with middle-mouse drag ────────────────────────────────────────────────
// Return to default zoom first
await page.mouse.wheel(0, -100);
await page.waitForTimeout(300);

// Middle-mouse drag (pan mode)
await page.mouse.move(cx, cy);
await page.mouse.down({ button: 'middle' });
await page.mouse.move(cx - 150, cy - 100, { steps: 10 });
await page.mouse.up({ button: 'middle' });
await page.waitForTimeout(300);
save('pan-3-panned.png', await page.screenshot());
console.log('✓ Middle-mouse pan executed');

// ── Switch to hand tool and drag-pan ─────────────────────────────────────────
const handBtn = page.locator('button[title*="Pan" i], button[title*="Hand" i]').first();
if (await handBtn.count() > 0) {
  await handBtn.click();
  await page.waitForTimeout(200);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 80, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  save('pan-4-hand-pan.png', await page.screenshot());
  console.log('✓ Hand-tool drag pan executed');
} else {
  console.log('⚠ Hand/Pan button not found by title — skipping hand-tool drag');
}

// ── PDF export ────────────────────────────────────────────────────────────────
console.log('\n--- Testing PDF Export ---');

// Open export modal
const exportBtn = page.locator('button:has-text("Export"), button[title*="Export"]').first();
await exportBtn.click();
await page.waitForTimeout(500);
save('export-0-modal-open.png', await page.screenshot());

// Check the modal is visible
const modal = page.locator('[role="dialog"], .modal, div:has-text("Export")').first();
const modalVisible = await modal.isVisible().catch(() => false);
console.log(`Export modal visible: ${modalVisible}`);

// Look for PDF option
const pdfOption = page.locator('label:has-text("PDF"), button:has-text("PDF"), input[value*="pdf" i]').first();
const pdfCount = await pdfOption.count();
console.log(`PDF option found: ${pdfCount > 0}`);

if (pdfCount > 0) {
  await pdfOption.click();
  await page.waitForTimeout(200);
  save('export-1-pdf-selected.png', await page.screenshot());
  console.log('✓ PDF format selected');
}

// Check PNG/PNG resolution options
const pngOption = page.locator('label:has-text("PNG"), button:has-text("PNG"), input[value*="png" i]').first();
const pngCount = await pngOption.count();
if (pngCount > 0) {
  await pngOption.click();
  await page.waitForTimeout(200);
  console.log('✓ PNG format visible');
}

// Look for resolution dropdown (72, 150, 300 dpi or 1x, 2x)
const resSel = page.locator('select, [role="listbox"]').first();
const resCount = await resSel.count();
console.log(`Resolution selector found: ${resCount > 0}`);
save('export-2-options.png', await page.screenshot());

// Close modal / press Escape
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
save('export-3-closed.png', await page.screenshot());

console.log('\nAll tests done. Check screenshots in scripts/');
await browser.close();
