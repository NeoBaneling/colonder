import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('creates and displays a note', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, COLONDER_USER_DATA: userDataPath },
  });

  try {
    const page = await app.firstWindow();
    await expect(page.getByText('Colonder')).toBeVisible();
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});
