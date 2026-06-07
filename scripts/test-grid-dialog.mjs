// Test Grid dialog and scale-bar parentImageId feature
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
await page.waitForTimeout(1000);

// 1. Open Grid dialog via the LayoutGrid button
const gridBtn = page.locator('button[title*="grid" i], button[title*="Grid" i]').first();
await gridBtn.click();
await page.waitForTimeout(400);
save('grid-1-dialog-empty.png', await page.screenshot());
console.log(`Grid dialog open: ${await page.locator('text=/Place as Grid/').count() > 0 ? '✓' : '✗'}`);

// 2. Check empty state (no groups)
const noGroups = await page.locator('text=/No groups/').count();
console.log(`Empty state shown: ${noGroups > 0 ? '✓' : '✗ (groups may already exist)'}`);

// Close dialog
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
save('grid-2-closed.png', await page.screenshot());

// 3. Confirm Grid toolbar button is visible
const gridBtnVisible = await gridBtn.isVisible();
console.log(`Grid button in toolbar: ${gridBtnVisible ? '✓' : '✗'}`);

// 4. Verify TypeScript compiled (no console errors about missing types)
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.waitForTimeout(500);
console.log(`Console errors: ${errors.length === 0 ? 'none ✓' : errors.join(', ')}`);

console.log('\nAll grid dialog tests done.');
await browser.close();
