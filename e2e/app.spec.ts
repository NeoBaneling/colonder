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

test('creates and confirms a six-week schedule', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-schedule-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      COLONDER_USER_DATA: userDataPath,
      COLONDER_E2E_HEADLESS: '1',
    },
  });

  try {
    const page = await app.firstWindow();
    await page.evaluate(() =>
      Promise.all([
        window.staff.create({
          firstName: 'Ada',
          lastName: 'Nurse',
          title: 'RN',
          role: 0,
          employment: 0,
          departments: [0],
          startTime: '07:00',
          isLeader: false,
          inOrientation: false,
          ipcIds: [],
        }),
        window.staff.create({
          firstName: 'Penny',
          lastName: 'Prn',
          title: 'RN',
          role: 0,
          employment: 2,
          departments: [0],
          startTime: '07:00',
          isLeader: false,
          inOrientation: false,
          ipcIds: [],
        }),
      ]),
    );

    await page.getByRole('link', { name: 'Create Schedule' }).click();
    await expect(
      page.getByRole('heading', { name: 'Create Schedule' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /PTO calendar/ })).toBeVisible();
    await expect
      .poll(() =>
        page.locator('.input-grid').evaluate(
          (grid) => grid.closest('.schedule-grid-scroll')!.scrollWidth <=
            grid.closest('.schedule-grid-scroll')!.clientWidth,
        ),
      )
      .toBe(true);
    await page.setViewportSize({ width: 900, height: 700 });
    await expect
      .poll(() =>
        page.locator('.input-grid').first().evaluate((grid) => {
          const container = grid.closest('.schedule-grid-scroll')!;
          return container.scrollWidth > container.clientWidth;
        }),
      )
      .toBe(true);
    const inputGridScroll = page.locator('.input-grid').first();
    const inputNameCell = inputGridScroll.locator('.schedule-name-cell').first();
    await expect
      .poll(() =>
        inputNameCell.evaluate(
          (cell) => getComputedStyle(cell, '::before').display,
        ),
      )
      .toBe('none');
    await inputGridScroll.evaluate((grid) => {
      grid.closest('.schedule-grid-scroll')!.scrollLeft = 120;
    });
    await expect
      .poll(() =>
        inputNameCell.evaluate(
          (cell) => getComputedStyle(cell, '::before').display,
        ),
      )
      .toBe('block');
    await expect
      .poll(() =>
        inputNameCell.evaluate(
          (cell) => getComputedStyle(cell, '::before').width,
        ),
      )
      .toBe('13px');
    await inputGridScroll.evaluate((grid) => {
      grid.closest('.schedule-grid-scroll')!.scrollLeft = 0;
    });
    await expect(
      page.getByRole('button', { name: /Penny Prn,/ }),
    ).toHaveCount(0);

    await page.locator('.input-grid tbody tr').first().hover();
    await expect
      .poll(() =>
        page
          .locator('.input-grid tbody tr')
          .first()
          .locator('.schedule-cell')
          .first()
          .evaluate((cell) => getComputedStyle(cell).backgroundColor),
      )
      .toBe('rgb(224, 242, 240)');

    const ptoCell = page.getByRole('button', {
      name: /Ada Nurse,/,
    }).first();
    const ptoLabel = await ptoCell.getAttribute('aria-label');
    await ptoCell.click();
    await expect(ptoCell).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(600);
    await page.getByRole('link', { name: 'Schedules' }).click();
    await page.getByRole('button', { name: 'Resume schedule draft' }).click();
    const resumedPtoCell = page.getByRole('button', {
      name: ptoLabel!.replace('not selected', 'selected'),
    });
    await expect(resumedPtoCell).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { name: /PRN working days/ })).toBeVisible();
    const prnCell = page.getByRole('button', { name: /Penny Prn,/ }).first();
    await prnCell.click();
    await expect(prnCell).toHaveClass(/schedule-cell-prn/);
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Review & overrides' }),
    ).toBeVisible();
    const reviewPtoCell = page.getByRole('button', { name: /Ada Nurse, .*: PTO/ });
    await expect(reviewPtoCell).toBeVisible();
    const prnReviewCell = page.getByRole('button', { name: /Penny Prn, .*: Working/ }).first();
    await expect(prnReviewCell).toBeDisabled();
    await expect(page.getByLabel('PRN').first()).toHaveAttribute('title', 'PRN');

    await page.setViewportSize({ width: 900, height: 700 });
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect
      .poll(() =>
        page.locator('.review-grid-scroll').evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page
          .locator('.review-grid .schedule-name-cell')
          .first()
          .evaluate(
            (cell) => getComputedStyle(cell, '::after').display,
          ),
      )
      .toBe('none');
    await page.locator('.review-grid-scroll').evaluate((element) => {
      element.scrollLeft = 120;
    });
    await expect
      .poll(() =>
        page
          .locator('.review-grid .schedule-name-cell')
          .first()
          .evaluate(
            (cell) => getComputedStyle(cell, '::after').display,
          ),
      )
      .toBe('block');
    await expect
      .poll(() =>
        page
          .locator('.review-grid .schedule-name-cell')
          .first()
          .evaluate((cell) => {
            const container = cell.closest('.schedule-grid-scroll')!;
            return Math.round(cell.getBoundingClientRect().left) -
              Math.round(container.getBoundingClientRect().left);
          }),
      )
      .toBe(13);
    await expect
      .poll(() =>
        page.getByTestId('navbar').evaluate(
          (element) => element.getBoundingClientRect().width,
        ),
      )
      .toBeLessThan(80);
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Confirm schedule' }),
    ).toBeVisible();
    await page.getByRole('dialog').locator('.toggle').click();
    await expect(
      page.getByRole('switch', { name: 'Acknowledge warnings' }),
    ).toBeChecked();
    await page
      .getByRole('button', { name: 'Confirm schedule', exact: true })
      .click();

    await expect(page.getByRole('heading', { name: 'Schedules' })).toBeVisible();
    await expect(page.getByText('Confirmed', { exact: true })).toBeVisible();
    await expect(page.locator('.recent-confirmation')).toBeVisible();
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});
