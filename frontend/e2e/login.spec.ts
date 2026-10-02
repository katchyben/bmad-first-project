import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD, E2E_USERNAME } from './credentials';

const TOKEN_KEY = 'todo.auth_token';
const INVALID = "That username and password don't match.";

const username = (page: Page) => page.getByLabel('Username');
const password = (page: Page) => page.getByLabel('Password');
const logInButton = (page: Page) => page.getByRole('button', { name: 'Log in' });

async function logIn(page: Page): Promise<void> {
  await page.goto('/');
  await username(page).fill(E2E_USERNAME);
  await password(page).fill(E2E_PASSWORD);
  await password(page).press('Enter');
  await expect(page).toHaveTitle('Today — Todo');
}

test('no token: Login shows, titled, with focus on Username', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Log in — Todo');
  await expect(page.getByRole('heading', { level: 1, name: 'Todo App' })).toBeVisible();
  await expect(username(page)).toBeFocused();
  await expect(username(page)).toHaveAttribute('autocomplete', 'username');
  await expect(password(page)).toHaveAttribute('autocomplete', 'current-password');
});

test('valid login: Enter in Password logs in and stores the token', async ({ page }) => {
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  const token = await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY);
  expect(token).toBeTruthy();

  // A reload keeps the session.
  await page.reload();
  await expect(page).toHaveTitle('Today — Todo');
});

test('invalid credentials keep the username, clear and focus the password', async ({ page }) => {
  await page.goto('/');
  await username(page).fill(E2E_USERNAME);
  await password(page).fill('not-the-password');
  await username(page).press('Enter');

  const alert = page.getByRole('alert');
  await expect(alert).toHaveText(INVALID);
  await expect(page).toHaveTitle('Log in — Todo');
  await expect(username(page)).toHaveValue(E2E_USERNAME);
  await expect(password(page)).toHaveValue('');
  await expect(password(page)).toBeFocused();
  for (const field of [username(page), password(page)]) {
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAttribute('aria-describedby', (await alert.getAttribute('id'))!);
  }
  expect(await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY)).toBeNull();
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
});

test('wiring: after login, requests go same-origin to /api on :5173 with the bearer token', async ({
  page,
}) => {
  await logIn(page);
  const token = await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY);
  // The dev-only fixture sends one request through the app's configured client.
  await page.goto('/?design-check');
  const requestPromise = page.waitForRequest((r) => r.url().includes('/api/'));
  await page.getByTestId('auth-request').click();
  const request = await requestPromise;
  expect(new URL(request.url()).origin).toBe('http://localhost:5173');
  expect(new URL(request.url()).pathname).toMatch(/^\/api\//);
  expect(await request.headerValue('authorization')).toBe(`Bearer ${token}`);
  const response = await request.response();
  expect(response?.status()).toBeLessThan(400);
});

test('narrow: at 320px Login has no horizontal scroll and every target is at least 24px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await expect(logInButton(page)).toBeVisible();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  for (const target of [username(page), password(page), logInButton(page)]) {
    const box = (await target.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(24);
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
});

test('log in → main screen → log out', async ({ page }) => {
  await logIn(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  const expectedDate = await page.evaluate(() =>
    new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(
      new Date(),
    ),
  );
  await expect(page.getByText(expectedDate, { exact: true })).toBeVisible();

  const oldToken = await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY);
  const logout = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/auth/logout',
  );
  await page.getByRole('button', { name: 'Log out' }).click();
  const response = await logout;
  expect(response.request().headers()['authorization']).toBe(`Bearer ${oldToken}`);
  expect(response.status()).toBe(204);

  await expect(page).toHaveTitle('Log in — Todo');
  await expect(username(page)).toBeFocused();
  expect(await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY)).toBeNull();
  // The old session is gone server-side too: its token is now rejected.
  const reuse = await page.request.post('/api/auth/logout', {
    headers: { Authorization: `Bearer ${oldToken}` },
  });
  expect(reuse.status()).toBe(401);
  await page.reload();
  await expect(page).toHaveTitle('Log in — Todo');
});

test('narrow: at 320px the main screen has no horizontal scroll and Log out is at least 24px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await logIn(page);
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  const box = (await page.getByRole('button', { name: 'Log out' }).boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(24);
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  // The heading sits beside Log out without overlapping it.
  const heading = (await page.getByRole('heading', { level: 1, name: 'Today' }).boundingBox())!;
  expect(heading.x + heading.width).toBeLessThanOrEqual(box.x);
});
