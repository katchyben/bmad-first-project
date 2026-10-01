import { expect, test, type Page } from '@playwright/test';

const FALLBACK = 'Something went wrong. Try again.';

// DESIGN.md toast tokens: [light, dark].
const TOAST_BG = { light: 'rgb(31, 31, 31)', dark: 'rgb(234, 234, 234)' };
const TOAST_FG = { light: 'rgb(244, 244, 243)', dark: 'rgb(22, 22, 22)' };

async function showErrorToast(page: Page) {
  await page.goto('/?design-check');
  await page.getByTestId('server-error').click();
  const toast = page.locator('[data-sonner-toast]');
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText(FALLBACK);
  return toast;
}

test('the toast region is labelled "Notifications", Alt+T focuses it, toasts sit bottom centre', async ({
  page,
}) => {
  const toast = await showErrorToast(page);
  await expect(page.getByRole('region', { name: /^Notifications/ })).toHaveCount(1);

  // Sonner slides the toast in; wait for it to settle before measuring.
  const viewport = page.viewportSize()!;
  await expect
    .poll(async () => {
      const box = (await toast.boundingBox())!;
      return Math.round(viewport.height - (box.y + box.height));
    })
    .toBeCloseTo(24, 0);
  const box = (await toast.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);

  await page.keyboard.press('Alt+KeyT');
  await expect(page.locator('[data-sonner-toaster]')).toBeFocused();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: the error toast uses the toast tokens and the on-toast focus ring`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const toast = await showErrorToast(page);
    await expect(toast).toHaveCSS('background-color', TOAST_BG[scheme]);
    await expect(toast).toHaveCSS('color', TOAST_FG[scheme]);
    expect(await toast.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(
      /^-apple-system,/,
    );

    const dismiss = toast.getByRole('button', { name: 'Dismiss' });
    const box = (await dismiss.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
    await expect(dismiss).toHaveCSS('color', TOAST_FG[scheme]);

    // The close button sits inside the toast, so the ring's offset shows toast-background.
    const toastBox = (await toast.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(toastBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(toastBox.x + toastBox.width);
    expect(box.y).toBeGreaterThanOrEqual(toastBox.y);
    expect(box.y + box.height).toBeLessThanOrEqual(toastBox.y + toastBox.height);

    await dismiss.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(dismiss).toBeFocused();
    await expect(dismiss).toHaveCSS('outline-style', 'solid');
    await expect(dismiss).toHaveCSS('outline-width', '2px');
    await expect(dismiss).toHaveCSS('outline-offset', '2px');
    await expect(dismiss).toHaveCSS('outline-color', TOAST_FG[scheme]);
  });
}

test('repeated failures keep exactly one toast; Dismiss closes it', async ({ page }) => {
  const toast = await showErrorToast(page);
  await page.getByTestId('server-error').click();
  await page.getByTestId('server-error').click();
  await expect(toast).toHaveCount(1);

  await toast.getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast).toHaveCount(0);
});

for (const [width, column] of [
  [320, 320 - 32],
  [1280, 640],
] as const) {
  test(`at ${width}px the column is ${column}px, centred, with no horizontal scroll`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const url of ['/', '/?design-check']) {
      await page.goto(url);
      await expect(page.getByRole('main')).toBeVisible();
      if (url !== '/') {
        // The error toast must not widen the page either.
        await page.getByTestId('server-error').click();
        const toast = page.locator('[data-sonner-toast]');
        await expect(toast).toHaveCount(1);
        if (width === 320) {
          // Sonner's mobile layout: inside the viewport, 16px side insets, 24px from the bottom.
          await expect
            .poll(async () => {
              const t = (await toast.boundingBox())!;
              return Math.abs(800 - (t.y + t.height) - 24) <= 1;
            })
            .toBe(true);
          const t = (await toast.boundingBox())!;
          expect(t.x).toBeGreaterThanOrEqual(0);
          expect(t.x + t.width).toBeLessThanOrEqual(width);
          expect(Math.abs(t.x - 16)).toBeLessThanOrEqual(1);
          expect(Math.abs(width - (t.x + t.width) - 16)).toBeLessThanOrEqual(1);
        }
      }
      const box = (await page.getByTestId('shell-column').boundingBox())!;
      expect(Math.abs(box.width - column), url).toBeLessThanOrEqual(1);
      expect(Math.abs(box.x - (width - column) / 2), url).toBeLessThanOrEqual(1);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, url).toBeLessThanOrEqual(clientWidth);
    }
  });
}
