// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createClient } from '@hey-api/openapi-ts';
import { afterAll, describe, expect, it } from 'vitest';
import config from '../openapi-ts.config';

// The committed src/client/ must be exactly what openapi-ts generates from the
// committed openapi.json (the backend side is pinned by a pytest).

const COMMITTED = join(__dirname, 'client');

function files(root: string): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue; // .DS_Store, editor swap files
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else found.set(relative(root, path), readFileSync(path, 'utf8'));
    }
  };
  walk(root);
  return found;
}

describe('generated client', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'client-drift-'));
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it('matches a fresh generation from openapi.json', async () => {
    const base = (await config) as unknown as { output: Record<string, unknown> };
    await createClient({
      ...base,
      input: join(__dirname, '..', 'openapi.json'),
      output: { ...base.output, path: scratch },
      logs: { level: 'silent' },
    } as unknown as Parameters<typeof createClient>[0]);

    const fresh = files(scratch);
    const committed = files(COMMITTED);
    expect([...committed.keys()].sort(), 'run `npm run generate` and commit src/client/').toEqual(
      [...fresh.keys()].sort(),
    );
    for (const [name, content] of fresh) {
      expect(committed.get(name), `${name} is stale: run \`npm run generate\``).toBe(content);
    }
  }, 30_000);
});
