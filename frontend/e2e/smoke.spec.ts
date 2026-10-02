import { expect, test } from '@playwright/test';

test('the app loads with lang="en"', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#root')).not.toBeEmpty();
});

test('/api is proxied to the backend and returns the error envelope', async ({ request }) => {
  const response = await request.get('/api/nope');
  expect(response.status()).toBe(404);
  const body = await response.json();
  expect(body.error.code).toBe('not_found');
  expect(typeof body.error.message).toBe('string');
});

test('only /api is proxied: the backend-only /docs page is not served through :5173', async ({
  request,
}) => {
  // /docs is FastAPI's Swagger UI on :8000. (/openapi.json can't be used here:
  // frontend/openapi.json is a committed file that Vite serves from its root.)
  const response = await request.get('/docs');
  // Vite's SPA fallback answers instead of the backend.
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');
  const text = await response.text();
  expect(text).not.toContain('swagger-ui');
});
