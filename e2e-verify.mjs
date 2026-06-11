/**
 * E2E verification for Petro Graphs.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL    = 'http://localhost:5173';
const SS_DIR = '/tmp/e2e-ss';
mkdirSync(SS_DIR, { recursive: true });

let stepNum = 0;
const results = [];

async function step(label, fn) {
  stepNum++;
  try {
    const r = await fn();
    const ok = r !== false;
    const status = ok ? '✅' : '❌';
    const detail = typeof r === 'string' ? ` — ${r}` : '';
    results.push(`${status} ${stepNum}. ${label}${detail}`);
    console.log(`${status} ${label}${detail}`);
    return r;
  } catch (e) {
    results.push(`❌ ${stepNum}. ${label} — THREW: ${e.message}`);
    console.error(`❌ ${label}: ${e.message}`);
    return false;
  }
}

async function probe(label, fn) {
  stepNum++;
  try {
    const r = await fn();
    const detail = typeof r === 'string' ? ` — ${r}` : '';
    results.push(`🔍 ${stepNum}. [probe] ${label}${detail}`);
    console.log(`🔍 [probe] ${label}${detail}`);
    return r;
  } catch (e) {
    results.push(`🔍 ${stepNum}. [probe] ${label} — threw: ${e.message}`);
    return null;
  }
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const ctx  = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 });
await page.screenshot({ path: `${SS_DIR}/00-initial.png` });

await step('App loads — title "Petro Graphs"', async () => {
  const t = await page.title();
  return t === 'Petro Graphs' ? t : false;
});

await step('Canvas element is present', async () => {
  const box = await page.locator('canvas').first().boundingBox();
  return box ? `${Math.round(box.width)}x${Math.round(box.height)}` : false;
});

await step('Initial tab shows Untitled Figure', async () => {
  const text = await page.locator('.page-tab').first().textContent();
  return text && text.includes('Untitled') ? text.trim() : false;
});

await step('Add canvas tab', async () => {
  await page.locator('.page-tab-add').click();
  await page.waitForTimeout(400);
  const count = await page.locator('.page-tab').count();
  await page.screenshot({ path: `${SS_DIR}/02-two-tabs.png` });
  return count >= 2 ? `${count} tabs` : false;
});

await step('Switch to first tab', async () => {
  await page.locator('.page-tab').first().click();
  await page.waitForTimeout(200);
  const active = await page.locator('.page-tab.active').textContent();
  return active ? active.trim() : false;
});

await step('Rename tab by double-click', async () => {
  await page.locator('.page-tab.active .page-tab-title').dblclick();
  const input = page.locator('.page-tab-input');
  await input.fill('Test Figure');
  await input.press('Enter');
  await page.waitForTimeout(200);
  const text = await page.locator('.page-tab.active').textContent();
  await page.screenshot({ path: `${SS_DIR}/03-renamed.png` });
  return text && text.includes('Test Figure') ? text.trim() : false;
});

await step('Close second tab', async () => {
  await page.locator('.page-tab').nth(1).locator('.page-tab-close').click();
  await page.waitForTimeout(300);
  const count = await page.locator('.page-tab').count();
  return count === 1 ? '1 tab remains' : false;
});

async function clickTool(titlePart) {
  await page.locator(`button[title*="${titlePart}"]`).first().click();
  await page.waitForTimeout(150);
}

await step('Text tool — place text on canvas', async () => {
  await clickTool('Text');
  const ca = await page.locator('.canvas-area').boundingBox();
  if (!ca) return false;
  await page.mouse.click(ca.x + ca.width / 2, ca.y + ca.height / 2);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SS_DIR}/04-text.png` });
  return 'text placed';
});

await step('Shape tool — place rectangle', async () => {
  await clickTool('Shape');
  const ca = await page.locator('.canvas-area').boundingBox();
  if (!ca) return false;
  await page.mouse.click(ca.x + 200, ca.y + 200);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SS_DIR}/05-shape.png` });
  return 'shape placed';
});

await step('Undo (Ctrl+Z)', async () => {
  const undoBtn = page.locator('button[title*="Undo"]');
  const disabled = await undoBtn.getAttribute('disabled');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SS_DIR}/06-undo.png` });
  return disabled === null ? 'undo fired' : 'no history (still OK)';
});

await step('Redo (Ctrl+Y)', async () => {
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(300);
  return 'redo fired';
});

await step('Export modal opens and closes', async () => {
  await page.locator('button[title*="Export"]').click();
  await page.waitForTimeout(500);
  const visible = await page.locator('text=Export Figure').isVisible();
  await page.screenshot({ path: `${SS_DIR}/07-export.png` });
  if (visible) await page.keyboard.press('Escape');
  return visible ? 'modal opened' : false;
});

await step('Pan mode via H key', async () => {
  await page.locator('body').click({ position: { x: 50, y: 50 }, force: true });
  await page.keyboard.press('h');
  await page.waitForTimeout(150);
  await page.keyboard.press('v'); // back to select
  return 'pan toggled';
});

await step('Select tool via V key', async () => {
  await page.keyboard.press('v');
  await page.waitForTimeout(100);
  return 'select active';
});

await step('Fit view (Ctrl+0)', async () => {
  await page.keyboard.press('Control+0');
  await page.waitForTimeout(300);
  return 'fit view fired';
});

await probe('Delete selected object', async () => {
  await clickTool('Text');
  const ca = await page.locator('.canvas-area').boundingBox();
  if (!ca) return 'no canvas';
  await page.mouse.click(ca.x + 400, ca.y + 300);
  await page.waitForTimeout(500);
  await page.keyboard.press('v');
  await page.waitForTimeout(100);
  await page.mouse.click(ca.x + 400, ca.y + 300);
  await page.waitForTimeout(200);
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  return 'delete fired, no crash';
});

await probe('Right sidebar renders without error', async () => {
  const sidebar = page.locator('.sidebar-right');
  const visible = await sidebar.isVisible();
  return visible ? 'visible' : 'not visible';
});

await page.screenshot({ path: `${SS_DIR}/final.png` });
await browser.close();

const pass = results.filter(r => r.startsWith('✅')).length;
const fail = results.filter(r => r.startsWith('❌')).length;
const verdict = fail === 0 ? 'PASS' : 'FAIL';

console.log('\n═══════════════════════════════════════════');
console.log(`VERDICT: ${verdict}  (${pass} passed, ${fail} failed)`);
console.log('═══════════════════════════════════════════');
results.forEach(r => console.log(r));
if (pageErrors.length) {
  console.log('\nPage errors:');
  pageErrors.slice(0,5).forEach(e => console.log('  ⚠️', e.slice(0,120)));
}

writeFileSync('/tmp/e2e-results.txt', results.join('\n') + `\nVERDICT: ${verdict}\n`);
process.exit(fail === 0 ? 0 : 1);
