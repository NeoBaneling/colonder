import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('saves and restores settings from SQLite', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-e2e-'));
  const launchApp = () =>
    electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        COLONDER_USER_DATA: userDataPath,
        COLONDER_E2E_HEADLESS: '1',
      },
    });
  let app = await launchApp();

  try {
    let page = await app.firstWindow();
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
      ),
    ).toBe(true);
    await expect(page.getByText('Colonder', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(
      page.getByRole('heading', { name: 'Settings' }),
    ).toBeVisible();
    await expect(page.getByLabel('Target nurses')).toHaveValue('13');

    await page.getByLabel('Target nurses').fill('17');
    await page.getByLabel('Target techs').fill('8');
    await page.getByLabel('Procedure rooms (PROC)').fill('6');
    await page.getByLabel('Delete after (weeks)').fill('24');
    await page.getByRole('button', { name: 'Sun' }).click();
    await page.getByRole('button', { name: 'Thu' }).click();
    await page.locator('.toggle').click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect
      .poll(() =>
        page.evaluate(() => window.settings.get()),
      )
      .toMatchObject({
        workingDays: [true, true, true, true, false, true, false],
        targetNurses: 17,
        targetTechs: 8,
        procRooms: 6,
        deleteAfter: 24,
        isDark: true,
      });

    await app.close();
    app = await launchApp();
    page = await app.firstWindow();
    await page.getByRole('link', { name: 'Settings' }).click();

    await expect(page.getByLabel('Target nurses')).toHaveValue('17');
    await expect(page.getByLabel('Target techs')).toHaveValue('8');
    await expect(page.getByLabel('Procedure rooms (PROC)')).toHaveValue('6');
    await expect(page.getByLabel('Delete after (weeks)')).toHaveValue('24');
    await expect(page.getByRole('button', { name: 'Sun' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Thu' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(
      page.getByRole('switch', { name: 'Dark theme' }),
    ).toBeChecked();
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('creates, edits, reloads, and deletes staff in SQLite', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-staff-e2e-'));
  const launchApp = () =>
    electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        COLONDER_USER_DATA: userDataPath,
        COLONDER_E2E_HEADLESS: '1',
      },
    });
  let app = await launchApp();

  try {
    let page = await app.firstWindow();
    await page.getByRole('link', { name: 'Staff' }).click();
    await expect(page.getByText('No staff have been added.')).toBeVisible();

    await page.getByRole('button', { name: 'Add staff' }).click();
    await page.getByLabel('First name').fill('Ada');
    await page.getByLabel('Last name').fill('First');
    await page.getByLabel('Job title').fill('RN');
    await page.getByLabel('Preferred start time').fill('07:00');
    await page.locator('.toggle').nth(0).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Staff' })).toBeVisible();
    await expect(page.getByText('First, Ada')).toBeVisible();

    await page.getByRole('button', { name: 'Add staff' }).click();
    await page.getByLabel('First name').fill('Bob');
    await page.getByLabel('Last name').fill('Second');
    await page.getByLabel('Job title').fill('Tech');
    await page.getByLabel('Preferred start time').fill('07:30');
    await page.getByLabel('Role').selectOption('1');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Second, Bob')).toBeVisible();

    await page.getByText('First, Ada').click();
    await page.getByLabel('Job title').fill('Senior RN');
    await page.getByLabel('Preferred start time').fill('08:15');
    await page.getByLabel('Role').selectOption('1');
    await page.getByLabel('Employment').selectOption('1');
    await page.locator('.toggle').nth(3).click();
    await page.getByRole('button', { name: 'Add a conflict...' }).click();
    await page.getByRole('option', { name: 'Bob Second' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect
      .poll(() => page.evaluate(() => window.staff.list()))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            firstName: 'Ada',
            lastName: 'First',
            title: 'Senior RN',
            role: 1,
            employment: 1,
            startTime: '08:15',
            departments: [1],
            isLeader: true,
            ipcIds: [expect.any(Number)],
          }),
          expect.objectContaining({
            firstName: 'Bob',
            lastName: 'Second',
            ipcIds: [expect.any(Number)],
          }),
        ]),
      );

    await app.close();
    app = await launchApp();
    page = await app.firstWindow();
    await page.getByRole('link', { name: 'Staff' }).click();
    await page.getByText('First, Ada').click();
    await expect(page.getByLabel('Job title')).toHaveValue('Senior RN');
    await expect(page.getByLabel('Preferred start time')).toHaveValue('08:15');
    await expect(page.getByLabel('Role')).toHaveValue('1');
    await expect(page.getByLabel('Employment')).toHaveValue('1');
    await expect(page.getByRole('switch', { name: 'Leader' })).toBeChecked();
    await expect(page.getByText('Bob Second')).toBeVisible();

    await page.getByRole('link', { name: 'Staff' }).click();
    await page.getByText('Second, Bob').click();
    await page.getByRole('button', { name: 'Delete staff' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete staff' })
      .click();
    await expect(page.getByText('Second, Bob')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.staff.list()))
      .toEqual([
        expect.objectContaining({
          firstName: 'Ada',
          ipcIds: [],
        }),
      ]);

    await page.getByText('First, Ada').click();
    await page.getByRole('button', { name: 'Delete staff' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete staff' })
      .click();
    await expect(page.getByText('No staff have been added.')).toBeVisible();
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});
