import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD, E2E_USERNAME } from './credentials';

// The outage is simulated per page with page.route; the shared webServer keeps running.

const BANNER = "Can't reach the server. Retrying…";

const banner = (page: Page) => page.getByTestId('connection-banner');

async function fillLogin(page: Page): Promise<void> {
  await page.getByLabel('Username').fill(E2E_USERNAME);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
}

async function layout(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
}

/** The banner spans the viewport, sits at the top, is at least 32px, and adds no horizontal scroll. */
async function expectBannerLayout(page: Page, width: number): Promise<void> {
  await expect(banner(page)).toHaveText(BANNER);
  const { scrollWidth, clientWidth } = await layout(page);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  const box = (await banner(page).boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  expect(Math.abs(box.width - clientWidth)).toBeLessThanOrEqual(1);
  expect(box.height).toBeGreaterThanOrEqual(32);
  // The column below is unchanged: 640px (or the viewport less the gutters), centred.
  const column = Math.min(640, width - 32);
  const col = (await page.getByTestId('shell-column').boundingBox())!;
  expect(Math.abs(col.width - column)).toBeLessThanOrEqual(1);
  expect(Math.abs(col.x - (clientWidth - column) / 2)).toBeLessThanOrEqual(1);
  expect(col.y).toBeGreaterThanOrEqual(box.y + box.height - 1);
}

for (const width of [320, 1280]) {
  test(`login at ${width}px: an unreachable server shows the banner; the next login clears it`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    // What the Vite proxy answers while the backend is down.
    await page.route('**/api/auth/token', (route) => route.fulfill({ status: 502 }));
    await page.goto('/');
    await fillLogin(page);
    await page.getByLabel('Password').press('Enter');

    await expectBannerLayout(page, width);
    await expect(page.getByRole('alert')).toHaveText('');
    await expect(page.getByLabel('Username')).toHaveValue(E2E_USERNAME);
    await expect(page.getByLabel('Password')).toHaveValue(E2E_PASSWORD);
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    await expect(page.getByTestId('announcer')).toHaveText(BANNER);
    // The card stays centred in the space below the banner, with no added vertical scroll.
    const { scrollHeight, clientHeight } = await layout(page);
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight);
    const bannerBox = (await banner(page).boundingBox())!;
    const card = (await page.getByRole('main').locator('> div').boundingBox())!;
    const below = bannerBox.y + bannerBox.height;
    const expectedCentre = below + (clientHeight - below) / 2;
    expect(Math.abs(card.y + card.height / 2 - expectedCentre)).toBeLessThanOrEqual(1);

    await page.unroute('**/api/auth/token');
    await page.getByLabel('Password').press('Enter');
    await expect(page).toHaveTitle('Today — Todo');
    await expect(banner(page)).toHaveCount(0);
    await expect(page.getByTestId('announcer')).toHaveText('Reconnected.');
  });
}

for (const width of [320, 1280]) {
  test(`main at ${width}px: a failing list load shows the banner until the server answers`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await fillLogin(page);
    await page.getByLabel('Password').press('Enter');
    await expect(page).toHaveTitle('Today — Todo');

    await page.route('**/api/tasks', (route) => route.abort());
    await page.reload();
    await expectBannerLayout(page, width);
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect(page.locator('input[name="title"]')).toBeEditable();
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

    await page.unroute('**/api/tasks');
    // The query's own retry (1 s, 2 s, 4 s … back-off) clears it.
    await expect(banner(page)).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByTestId('announcer')).toHaveText('Reconnected.');
  });
}
