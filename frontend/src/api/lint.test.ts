// @vitest-environment node
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cwd = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd });

async function banErrors(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath, warnIgnored: false });
  return (result?.messages ?? [])
    .filter((m) => m.severity === 2)
    .map((m) => m.ruleId ?? 'fatal');
}

describe('hand-written HTTP ban', () => {
  it.each([
    ['fetch call', "export const r = fetch('/api/tasks');"],
    ['window.fetch', "export const r = window.fetch('/api/tasks');"],
    ['globalThis.fetch', "export const r = globalThis.fetch('/api/tasks');"],
    ['axios import', "import axios from 'axios';\nexport const r = axios.get('/api/tasks');"],
    ['dynamic axios import', "export const r = import('axios');"],
    ['self.fetch', "export const r = self.fetch('/api/tasks');"],
    ['axios subpath import', "import a from 'axios/lib/core';\nexport const r = a;"],
    ['require of axios', "module.exports = require('axios');", 'src/features/tasks.js'],
    ['XMLHttpRequest', 'export const r = new XMLHttpRequest();'],
    ['EventSource', "export const r = new EventSource('/x');"],
    ['navigator.sendBeacon', "export const r = navigator.sendBeacon('/x');"],
    ['fetch in an .mjs file', "export const r = fetch('/api');", 'src/features/tasks.mjs'],
    [
      'client.gen import outside src/api',
      "import { client } from '../client/client.gen';\nexport const r = client;",
    ],
  ])('fails on a %s outside src/client/', async (_label, code, filePath = 'src/features/tasks.ts') => {
    const errors = await banErrors(code, filePath);
    expect(errors.some((id) => id.startsWith('no-restricted-'))).toBe(true);
  });

  it('allows fetch inside the generated src/client/', async () => {
    expect(await banErrors("export const r = fetch('/api');", 'src/client/client.gen.ts')).toEqual(
      [],
    );
  });

  it('allows src/api/ to import client.gen', async () => {
    const code = "import { client } from '../client/client.gen';\nexport const r = client;";
    expect(await banErrors(code, 'src/api/client.ts')).toEqual([]);
  });

  it('passes ordinary code', async () => {
    expect(await banErrors('export const x = 1;', 'src/features/tasks.ts')).toEqual([]);
  });
});
