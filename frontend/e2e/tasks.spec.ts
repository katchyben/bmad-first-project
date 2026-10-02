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

const grid = (page: Page) => page.getByRole('grid', { name: 'Tasks' });
const rows = (page: Page) => grid(page).getByRole('row');

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

const addInput = (page: Page) => page.getByRole('textbox', { name: 'Add a task' });

test('adds a task by title + Enter and shows it in the list', async ({ page }) => {
  await logIn(page);
  const title = `Added task ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const input = addInput(page);
  await input.click();
  await input.fill(title);
  await input.press('Enter');

  const row = rows(page).filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row).toHaveAccessibleName(`${title}, To do, due Tomorrow, 9:00 AM`);
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: 'Added' })).toHaveText(
    `Added '${title}', due Tomorrow, 9:00 AM.`,
  );
  await expect(page.getByRole('button', { name: 'Tomorrow 9:00 AM' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('adds a task with a description and the Next Monday preset', async ({ page }) => {
  const token = await logIn(page);
  const title = `Described task ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await addInput(page).fill(title);
  await page.getByRole('button', { name: 'Next Monday 9:00 AM' }).click();
  await page.getByRole('button', { name: 'Add description' }).click();
  const description = page.getByRole('textbox', { name: 'Description' });
  await expect(description).toBeFocused();
  await description.fill('First line');
  await description.press('Shift+Enter');
  await description.pressSequentially('second line');
  await description.press('Enter');

  await expect(rows(page).filter({ hasText: title })).toBeVisible();
  await expect(addInput(page)).toBeFocused();
  await expect(page.getByRole('button', { name: 'Add description' })).toBeVisible();

  const response = await page.request.get('/api/tasks', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const created = ((await response.json()) as { title: string; description: string; due_at: string }[])
    .find((t) => t.title === title)!;
  expect(created.description).toBe('First line\nsecond line');
  const due = await page.evaluate((iso) => {
    const d = new Date(iso);
    return { day: d.getDay(), hours: d.getHours(), minutes: d.getMinutes() };
  }, created.due_at);
  expect(due).toEqual({ day: 1, hours: 9, minutes: 0 });
});

test('shows a rejected blank title in the error slot and keeps the preset', async ({ page }) => {
  await logIn(page);
  await page.getByRole('button', { name: 'Next Monday 9:00 AM' }).click();
  const input = addInput(page);
  await input.press('Enter');
  const alert = page.getByRole('alert').filter({ hasText: /\S/ });
  await expect(alert).toBeVisible();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveAttribute('aria-describedby', (await alert.getAttribute('id'))!);
  await expect(page.getByRole('button', { name: 'Next Monday 9:00 AM' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('narrow: at 320px the add input, chips and link reflow with 24px targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await logIn(page);
  await page.getByRole('button', { name: 'Add description' }).click();
  await page.getByRole('textbox', { name: 'Description' }).fill('Some text');
  await addInput(page).focus();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  const targets = [
    addInput(page),
    page.getByRole('button', { name: 'Tomorrow 9:00 AM' }),
    page.getByRole('button', { name: 'Next Monday 9:00 AM' }),
    page.getByRole('textbox', { name: 'Description' }),
  ];
  for (const target of targets) {
    const box = (await target.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(box.height).toBeGreaterThanOrEqual(24);
  }
  await page.getByRole('textbox', { name: 'Description' }).fill('');
  await addInput(page).focus();
  const link = (await page.getByRole('button', { name: 'Add description' }).boundingBox())!;
  expect(link.height).toBeGreaterThanOrEqual(24);
  expect(link.x + link.width).toBeLessThanOrEqual(320);
});

/** "Oct 16, 5:35 PM" (with the year when not this year) for `daysAhead` days out at h:m, local. */
async function absoluteDue(page: Page, daysAhead: number, hour: number, minute: number) {
  return page.evaluate(
    ([days, h, m]) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      d.setHours(h, m, 0, 0);
      const sameYear = d.getFullYear() === new Date().getFullYear();
      const date = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        ...(sameYear ? {} : { year: 'numeric' }),
      }).format(d);
      const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
      return `${date}, ${time}`.replace(/[\u00a0\u202f]/g, ' ');
    },
    [daysAhead, hour, minute] as const,
  );
}

test('adds a task through "Pick date…" with a typed time and shows it in the list', async ({ page }) => {
  await logIn(page);
  const title = `Picked task ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await addInput(page).fill(title);
  const pickChip = page.getByRole('button', { name: 'Pick date…' });
  await pickChip.click();

  const popover = page.getByRole('dialog', { name: 'Pick a due date and time' });
  await expect(popover).toBeVisible();
  await expect(popover).toHaveCSS('opacity', '1');
  await expect(popover).toHaveCSS('animation-duration', '0.18s');
  const time = popover.getByLabel('Time');
  await expect(popover.getByText('Time', { exact: true })).toBeVisible();
  // Today is focused; two weeks ahead by keyboard, Enter moves to Time.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(time).toBeFocused();
  await expect(time).toHaveValue('09:00');
  await time.fill('17:35');
  await time.press('Enter');

  await expect(popover).toBeHidden();
  await expect(addInput(page)).toBeFocused();
  const expected = await absoluteDue(page, 14, 17, 35);
  const chip = page.getByRole('button', { name: `${expected}, pick another date` });
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Tomorrow 9:00 AM' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await addInput(page).press('Enter');

  const row = rows(page).filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row).toHaveAccessibleName(`${title}, To do, due ${expected}`);
  await expect(row).toContainText(expected);
  await expect(pickChip).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Tomorrow 9:00 AM' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('Esc closes the due popover without change and returns focus to the chip', async ({ page }) => {
  await logIn(page);
  const pickChip = page.getByRole('button', { name: 'Pick date…' });
  await pickChip.click();
  const popover = page.getByRole('dialog', { name: 'Pick a due date and time' });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(popover.getByLabel('Time')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(pickChip).toBeFocused();
  await expect(pickChip).toHaveAttribute('aria-pressed', 'false');
});

test('narrow: at 320px the due popover fits with 24px targets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await logIn(page);
  const pickChip = page.getByRole('button', { name: 'Pick date…' });
  // Measured before opening: the modal popover hides the rest of the page.
  expect((await pickChip.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  await pickChip.click();
  const popover = page.getByRole('dialog', { name: 'Pick a due date and time' });
  await expect(popover).toBeVisible();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  const box = (await popover.boundingBox())!;
  // Radix's collision padding keeps the gutter clear on both sides.
  expect(box.x).toBeGreaterThanOrEqual(16);
  expect(box.x + box.width).toBeLessThanOrEqual(320 - 16);
  const targets = [
    popover.getByLabel('Time'),
    popover.getByRole('button', { name: 'Set' }),
    popover.locator('td[data-today] button'),
  ];
  for (const target of targets) {
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  }
});

/** The id of the row the grid's aria-activedescendant points at. */
const activeRowId = (page: Page) => grid(page).getAttribute('aria-activedescendant');

test('moves through the tasks with the keyboard, and ⌘K / Esc move between input and list', async ({
  page,
}) => {
  const token = await logIn(page);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await createTask(page, token, `Keyboard A ${suffix}`, await localDue(page, 1, 9));
  await createTask(page, token, `Keyboard B ${suffix}`, await localDue(page, 1, 10));
  await page.reload();
  await expect(rows(page).filter({ hasText: `Keyboard B ${suffix}` })).toBeVisible();

  // Tab from the last control of the add form lands on the grid: one Tab stop.
  await page.getByRole('button', { name: 'Add description' }).focus();
  await page.keyboard.press('Tab');
  await expect(grid(page)).toBeFocused();
  await expect(grid(page)).toHaveAccessibleDescription(
    'Use arrow keys to move, S start, B move back, C complete, X cancel, E edit, Backspace delete, Z undo.',
  );
  const ids = await rows(page).evaluateAll((els) => els.map((el) => el.id));
  expect(ids.length).toBeGreaterThanOrEqual(2);
  await expect(grid(page)).toHaveAttribute('aria-activedescendant', ids[0]);
  const first = rows(page).first();
  await expect(first).toHaveAttribute('aria-selected', 'true');
  // The 2px inset ring while focused.
  await expect(first).toHaveCSS('outline-width', '2px');
  await expect(first).toHaveCSS('outline-offset', '-2px');

  // ↑ at the top stays put; ↓ moves one row.
  await page.keyboard.press('ArrowUp');
  await expect(grid(page)).toHaveAttribute('aria-activedescendant', ids[0]);
  await page.keyboard.press('ArrowDown');
  await expect(grid(page)).toHaveAttribute('aria-activedescendant', ids[1]);
  await expect(rows(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(first).toHaveAttribute('aria-selected', 'false');

  // ↓ past the end stops on the last row, without wrapping to the first.
  for (let i = 0; i < ids.length + 2; i++) await page.keyboard.press('ArrowDown');
  await expect(grid(page)).toHaveAttribute('aria-activedescendant', ids[ids.length - 1]);
  await expect(grid(page)).toBeFocused();
  await expect(rows(page).last()).toBeInViewport();

  // ⌘K (Ctrl+K off macOS) focuses the add input; Esc there returns to the list.
  // The app picks the modifier from the platform the browser reports (the
  // Desktop Chrome device may report another OS than the runner's).
  const mac = await page.evaluate(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform || nav.platform || '');
  });
  await page.keyboard.press(mac ? 'Meta+k' : 'Control+k');
  await expect(addInput(page)).toBeFocused();
  // The list kept its selection, now shown by the tint only.
  await expect(rows(page).last()).toHaveAttribute('aria-selected', 'true');
  await expect(rows(page).last()).toHaveCSS('outline-style', 'none');
  await page.keyboard.press('Escape');
  await expect(grid(page)).toBeFocused();
  expect(await activeRowId(page)).toBe(ids[ids.length - 1]);

  // Clicking a row selects it and focuses the list.
  await addInput(page).focus();
  await rows(page).filter({ hasText: `Keyboard A ${suffix}` }).click();
  await expect(grid(page)).toBeFocused();
  await expect(rows(page).filter({ hasText: `Keyboard A ${suffix}` })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
