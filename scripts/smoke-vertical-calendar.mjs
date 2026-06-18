// Headless smoke check for the vertical calendar against the running dev server.
// Verifies: vertical view is default, seeded events render, busy-day 8-cap +
// "+N more" overflow + 13-char truncation, quick-jump popover, and view toggle.
import { chromium } from 'playwright'

const BASE = 'http://localhost:3001'
const results = []
function check(name, cond) { results.push({ name, ok: !!cond }); console.log(`${cond ? '✓' : '✗'} ${name}`) }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } })
page.on('pageerror', e => console.log('PAGE ERROR:', e.message))

await page.goto(`${BASE}/calendar`, { waitUntil: 'networkidle' })

// Vertical view is the default (a month section is present, carousel is not).
await page.waitForSelector('[data-month]', { timeout: 15000 })
check('vertical view is default (data-month present)', await page.locator('[data-month]').count() > 0)
check('carousel NOT rendered by default', await page.locator('[data-testid="month-carousel"]').count() === 0)

// Regression: the month-section count must be stable (no runaway auto-extension).
const countA = await page.locator('[data-month]').count()
await page.waitForTimeout(1500)
const countB = await page.locator('[data-month]').count()
check(`no runaway extension (sections stable: ${countA} -> ${countB})`, countA === countB && countB <= 31)

// Regression: opens anchored on the current month, not 12 months in the past.
const topMonthVisible = await page.getByTestId('vcal-month-pill').first().textContent()
check(`opens near today's month (pill: "${topMonthVisible?.trim()}")`, /2026/.test(topMonthVisible ?? ''))

// Busy day Jun 18 (11 events) → 8-cap shows 7 chips + "+N more".
const busy = page.getByTestId('vcal-day-2026-06-18')
await busy.scrollIntoViewIfNeeded()
const chipCount = await busy.locator('[data-testid="vcal-chip"]').count()
check('busy day Jun 18 caps chips at 7', chipCount === 7)
check('busy day Jun 18 shows "+N more" overflow', (await busy.textContent())?.includes('more'))

// 13-char truncation — "Quarterly business review meeting" → "Quarterly bus…"
check('long title truncated to 13 chars + ellipsis', await page.getByText('Quarterly bus…').count() > 0)

// A recurring occurrence shows (1:1 with manager every Wednesday) somewhere.
check('recurring event "1:1 with manager" renders', await page.getByText('1:1 with mana…').count() > 0 || await page.getByText('1:1 with manager').count() > 0)

// Quick-jump popover opens.
await page.getByTestId('vcal-month-pill').first().click()
check('quick-jump popover opens with 12 months', await page.getByTestId('vcal-jump-month').count() === 12)
await page.keyboard.press('Escape').catch(() => {})

await page.screenshot({ path: 'scripts/smoke-vertical-default.png', fullPage: false })

// Toggle to Month → carousel appears.
await page.getByTestId('calendar-view-toggle').getByRole('button', { name: /month/i }).click()
await page.waitForTimeout(600)
check('toggling to Month shows the carousel', await page.locator('[data-testid="month-carousel"]').count() > 0)
await page.screenshot({ path: 'scripts/smoke-month-carousel.png', fullPage: false })

await browser.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
