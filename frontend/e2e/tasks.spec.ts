import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD, E2E_USERNAME } from './credentials';

// The e2e database is shared across tests: every task here has a unique title,
// and the tests assert relative order and visibility, never the whole list.

const TOKEN_KEY = 'todo.auth_token';

async function logIn(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Username').fill(E2E_USERNAME);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveTitle('Today — Todo');
  return (await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY))!;
}

/** An ISO instant for `daysAhead` days from now at `hour`:00 in the browser's time zone. */
async function localDue(page: Page, daysAhead: number, hour: number): Promise<string> {
  return page.evaluate(
    ([days, h]) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      d.setHours(h, 0, 0, 0);
      return d.toISOString();
    },
    [daysAhead, hour] as const,
  );
}

async function createTask(page: Page, token: string, title: string, dueAt: string) {
  const response = await page.request.post('/api/tasks', {
    headers: { Authorization: `Bearer ${token}` },
    data: { title, due_at: dueAt },
  });
  expect(response.status()).toBe(201);
}

const rows = (page: Page) => page.getByRole('list', { name: 'Tasks' }).getByRole('listitem');

test('the main screen lists tasks in API order with their due text', async ({ page }) => {
  const token = await logIn(page);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const later = `Later task ${suffix}`;
  const sooner = `Sooner task ${suffix}`;
  // Created later-first, so creation order and due order differ.
  await createTask(page, token, later, await localDue(page, 2, 10));
  await createTask(page, token, sooner, await localDue(page, 1, 9));

  await page.reload();
  const soonerRow = rows(page).filter({ hasText: sooner });
  const laterRow = rows(page).filter({ hasText: later });
  await expect(soonerRow).toBeVisible();
  await expect(laterRow).toBeVisible();
  await expect(soonerRow).toHaveAccessibleName(`${sooner}, To do, due Tomorrow, 9:00 AM`);
  await expect(soonerRow).toContainText('Tomorrow, 9:00 AM');

  const titles = await rows(page).allTextContents();
  const soonerIndex = titles.findIndex((t) => t.includes(sooner));
  const laterIndex = titles.findIndex((t) => t.includes(later));
  expect(soonerIndex).toBeGreaterThanOrEqual(0);
  expect(soonerIndex).toBeLessThan(laterIndex);
  await expect(page.getByText('Loading…')).toHaveCount(0);
});

test('narrow: at 320px a long-titled list has no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const token = await logIn(page);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const long = `Narrow ${suffix} ${'unbreakable'.repeat(12)} and some ordinary words that wrap`;
  await createTask(page, token, long, await localDue(page, 3, 9));

  await page.reload();
  const row = rows(page).filter({ hasText: `Narrow ${suffix}` });
  await expect(row).toBeVisible();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  const box = (await row.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  // The title is clamped to two lines (16px at 1.5 line height).
  const title = row.getByTestId('task-title');
  expect((await title.boundingBox())!.height).toBeLessThanOrEqual(2 * 24 + 1);
  const name = await row.getAttribute('aria-label');
  expect(name?.startsWith(`${long}, To do, due `)).toBe(true);
});
