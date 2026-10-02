import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { E2E_PASSWORD, E2E_USERNAME } from './e2e/credentials';

// The backend runs on a throwaway SQLite file, never the user's ./data.
const dbDir = join(tmpdir(), 'bmad-first-project-e2e');
const dbUrl = `sqlite:///${join(dbDir, 'app.db')}`;
// create-account reads the username, password and its repeat from piped stdin.
const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;
const printAccount = `printf '%s\\n%s\\n%s\\n' ${[E2E_USERNAME, E2E_PASSWORD, E2E_PASSWORD].map(shellQuote).join(' ')}`;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'backend',
      cwd: '..',
      command: `rm -rf "${dbDir}" && mkdir -p "${dbDir}" && uv run alembic upgrade head && ${printAccount} | uv run create-account && uv run uvicorn bmad_first_project.main:create_app --factory --port 8000`,
      env: { DATABASE_URL: dbUrl },
      url: 'http://localhost:8000/openapi.json',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: 'frontend',
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
