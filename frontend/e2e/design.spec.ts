import { expect, test, type Page } from '@playwright/test';

// DESIGN.md `colors`: [light, dark].
const COLORS: Record<string, [string, string]> = {
  background: ['#F4F4F3', '#161616'],
  foreground: ['#1F1F1F', '#EAEAEA'],
  card: ['#FFFFFF', '#1E1E1E'],
  'card-foreground': ['#1F1F1F', '#EAEAEA'],
  popover: ['#FFFFFF', '#1E1E1E'],
  'popover-foreground': ['#1F1F1F', '#EAEAEA'],
  'muted-foreground': ['#5F5F5F', '#A0A0A0'],
  border: ['#E2E2E0', '#333333'],
  input: ['#8A8A8A', '#707070'],
  ring: ['#1F1F1F', '#EAEAEA'],
  'ring-on-toast': ['#F4F4F3', '#161616'],
  primary: ['#1F1F1F', '#EAEAEA'],
  'primary-foreground': ['#FFFFFF', '#161616'],
  accent: ['#F7F7F6', '#242424'],
  'accent-foreground': ['#1F1F1F', '#EAEAEA'],
  destructive: ['#1F1F1F', '#EAEAEA'],
  'destructive-foreground': ['#FFFFFF', '#161616'],
  overdue: ['#C2341A', '#FF7A5C'],
  'overdue-tint': ['#FDEEEA', '#352019'],
  'in-progress': ['#3D3D3D', '#CFCFCF'],
  finished: ['#6A6A6A', '#9A9A9A'],
  'row-hover': ['#F7F7F6', '#242424'],
  'row-selected': ['#F0F0EE', '#262626'],
  'toast-background': ['#1F1F1F', '#EAEAEA'],
  'toast-foreground': ['#F4F4F3', '#161616'],
  'toast-action': ['#FF8A70', '#B32E15'],
};

// A Tailwind `ring-*`: a box-shadow layer with zero offset and blur and a non-zero spread.
const RING_SHADOW = /0px 0px 0px [1-9]/;

function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

async function openFixture(page: Page) {
  await page.goto('/?design-check');
  await expect(page.getByTestId('button')).toBeVisible();
}

function style(page: Page, testId: string, prop: string): Promise<string> {
  return page
    .getByTestId(testId)
    .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
}

for (const [scheme, index] of [
  ['light', 0],
  ['dark', 1],
] as const) {
  test(`${scheme} theme: every DESIGN.md colour is a CSS variable and a Tailwind colour`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openFixture(page);

    for (const [token, values] of Object.entries(COLORS)) {
      const expected = values[index];
      const variable = await page.evaluate(
        (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
        `--${token}`,
      );
      expect(variable.toUpperCase(), `--${token}`).toBe(expected);

      const swatch = await page
        .locator(`[data-swatch="${token}"]`)
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(swatch, `bg-${token}`).toBe(rgb(expected));
    }

    const body = await page.evaluate(() => {
      const s = getComputedStyle(document.body);
      return { bg: s.backgroundColor, fg: s.color };
    });
    expect(body).toEqual({ bg: rgb(COLORS.background[index]), fg: rgb(COLORS.foreground[index]) });
  });
}

test('the font is the system stack; kbd is monospace; no Geist is loaded', async ({ page }) => {
  const fontRequests: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'font' || /geist/i.test(r.url())) fontRequests.push(r.url());
  });
  await openFixture(page);

  expect(await style(page, 'button', 'font-family')).toMatch(/^-apple-system,/);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(
    /^-apple-system,/,
  );
  expect(await style(page, 'kbd', 'font-family')).toMatch(/^ui-monospace,/);

  const families = await page.evaluate(() => [...document.fonts].map((f) => f.family));
  expect(families.filter((f) => /geist/i.test(f))).toEqual([]);
  expect(fontRequests).toEqual([]);
});

test('radii: a Button is 10px, a rounded-lg surface is 12px', async ({ page }) => {
  await openFixture(page);
  expect(await style(page, 'button', 'border-top-left-radius')).toBe('10px');
  expect(await style(page, 'input', 'border-top-left-radius')).toBe('10px');
  expect(await style(page, 'surface', 'border-top-left-radius')).toBe('12px');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: Tab onto each focusable fixture control shows the solid 2px ring with a 2px offset`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openFixture(page);
    const ring = rgb(COLORS.ring[scheme === 'light' ? 0 : 1]);

    for (const testId of ['button', 'input', 'textarea', 'tab', 'link', 'invalid-input']) {
      await page.keyboard.press('Tab');
      const target = page.getByTestId(testId);
      await expect(target).toBeFocused();
      expect(await target.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
      // toHaveCSS retries, so shadcn's transition-all settles before the final check.
      await expect(target).toHaveCSS('outline-style', 'solid');
      await expect(target).toHaveCSS('outline-width', '2px');
      await expect(target).toHaveCSS('outline-color', ring);
      await expect(target).toHaveCSS('outline-offset', '2px');
      // No shadcn ring-ring/50 / 3px box-shadow ring alongside it (drop shadows are fine).
      const shadow = await target.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(shadow, `${testId} box-shadow`).not.toMatch(RING_SHADOW);
    }
  });
}

test('an invalid Input keeps its border but has no box-shadow ring', async ({ page }) => {
  await openFixture(page);
  expect(await style(page, 'invalid-input', 'box-shadow')).not.toMatch(RING_SHADOW);
});

test('component animations are off under prefers-reduced-motion: reduce', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openFixture(page);
  await page.getByTestId('popover-trigger').click();
  const content = page.getByTestId('popover-content');
  await expect(content).toBeVisible();
  const duration = await content.evaluate((el) => getComputedStyle(el).animationDuration);
  // 0.01ms: effectively instant, but still fires animationend for Radix Presence.
  expect(parseFloat(duration)).toBeLessThan(0.001);
  expect(await style(page, 'button', 'transition-duration')).toBe('0s');
});

test('min-target gives a 24px minimum height', async ({ page }) => {
  await openFixture(page);
  expect(await style(page, 'min-target', 'min-height')).toBe('24px');
  expect(await style(page, 'min-target', 'min-width')).toBe('24px');
});

test('the fade is a 180ms opacity transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openFixture(page);
  expect(await style(page, 'fade', 'transition-property')).toBe('opacity');
  expect(await style(page, 'fade', 'transition-duration')).toBe('0.18s');
});

test('the fade applies no transition under prefers-reduced-motion: reduce', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openFixture(page);
  const property = await style(page, 'fade', 'transition-property');
  const duration = await style(page, 'fade', 'transition-duration');
  expect({ property, duration }).toEqual({ property: 'none', duration: '0s' });
});

test('without ?design-check the app renders, not the fixture', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  await expect(page.getByTestId('button')).toHaveCount(0);

  // With a stored token, the logged-in placeholder.
  await page.evaluate(() => localStorage.setItem('todo.auth_token', 'any'));
  await page.reload();
  await expect(page.getByRole('main')).toHaveText('Todo');
  await expect(page.getByTestId('button')).toHaveCount(0);
});

test('a Button fades colour and opacity only and does not move when pressed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openFixture(page);
  expect(await style(page, 'button', 'transition-property')).toBe(
    'color, background-color, border-color, opacity',
  );
  const button = page.getByTestId('button');
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await style(page, 'button', 'translate')).toBe('none');
  expect(await style(page, 'button', 'transform')).toBe('none');
  await page.mouse.up();
});
