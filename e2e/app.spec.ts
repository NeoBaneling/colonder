import { _electron as electron, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const launchApp = (userDataPath: string) =>
  electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      COLONDER_USER_DATA: userDataPath,
      COLONDER_E2E_HEADLESS: '1',
    },
  });

type ConfirmedScheduleSeed = {
  startDate: string;
  endDate: string;
  shiftDates?: string[];
  includeWorkingDays?: boolean;
  includeToday?: boolean;
};

const seedConfirmedSchedule = async (
  page: Page,
  seed: ConfirmedScheduleSeed,
) => {
  await page.evaluate(async ({
    startDate,
    endDate,
    shiftDates = [],
    includeWorkingDays = false,
    includeToday = false,
  }) => {
    const [person, settings] = await Promise.all([
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
      window.settings.get(),
    ]);
    const dates = new Set(shiftDates);
    const toIso = (value: Date) =>
      `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    const fromIso = (value: string) => {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day);
    };
    if (includeWorkingDays) {
      for (
        const date = fromIso(startDate);
        date <= fromIso(endDate);
        date.setDate(date.getDate() + 1)
      ) {
        if (settings.workingDays[date.getDay()]) dates.add(toIso(date));
      }
    }
    if (includeToday) dates.add(toIso(new Date()));
    const state = {
      step: 'review' as const,
      startDate,
      endDate,
      ptoDates: [],
      prnDates: [],
      shifts: [...dates].map((date) => ({
        staffId: person.id,
        date,
        kind: 'work' as const,
        countsTowardTargets: true,
      })),
      onCall: [],
      staffSnapshot: [person],
      settingsSnapshot: settings,
      seed: 1,
      hasManualEdits: false,
    };
    const draft = await window.segments.create(state);
    await window.segments.confirm(draft.id, state);
  }, seed);
};

test('saves and restores settings from SQLite', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-e2e-'));
  let app = await launchApp(userDataPath);

  try {
    let page = await app.firstWindow();
    await page.waitForLoadState('load');
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
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
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
        isDark: false,
      });
    await expect(
      page.getByRole('heading', { name: 'Let’s meet the team' }),
    ).toBeVisible();

    await app.close();
    app = await launchApp(userDataPath);
    page = await app.firstWindow();
    await page.waitForLoadState('load');
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
    await expect
      .poll(() => page.evaluate(() => window.settings.get()))
      .toMatchObject({ isDark: false });
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('creates, edits, reloads, and deletes staff in SQLite', async () => {
  test.setTimeout(120_000);

  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-staff-e2e-'));
  let app = await launchApp(userDataPath);

  try {
    let page = await app.firstWindow();
    await page.getByRole('link', { name: 'Staff' }).click();
    await expect(page.getByText('No staff have been added.')).toBeVisible();

    await page.getByRole('button', { name: 'Add staff' }).click();
    await page.getByLabel('First name').fill('Ada');
    await page.getByLabel('Last name').fill('First');
    await page.getByLabel('Job title').fill('RN');
    const startTimeInput = page.getByRole('textbox', {
      name: 'Preferred start time',
      exact: true,
    });
    await expect(startTimeInput).toHaveAttribute('type', 'text');
    await startTimeInput.click();
    const timePicker = page.getByRole('dialog', {
      name: 'Preferred start time time picker',
    });
    await expect(
      timePicker.getByRole('button', { name: '30', exact: true }),
    ).toBeVisible();
    await startTimeInput.fill('07:00');
    await timePicker
      .getByRole('button', { name: 'Confirm time selection' })
      .click();
    const procToggle = page
      .locator('.toggle')
      .filter({ has: page.getByRole('switch', { name: 'PROC' }) });
    await procToggle.click();
    await expect(page.getByRole('switch', { name: 'PROC' })).toBeChecked();
    const saveButton = page.getByRole('button', { name: 'Save', exact: true });
    await expect(saveButton).toBeEnabled();
    await procToggle.click();
    await expect(page.getByRole('switch', { name: 'PROC' })).not.toBeChecked();
    await expect(saveButton).toBeDisabled();
    await expect(page.getByText('Select at least one department')).toBeVisible();
    await procToggle.click();
    await expect(saveButton).toBeEnabled();

    await page
      .locator('.toggle')
      .filter({ has: page.getByRole('switch', { name: 'Leader' }) })
      .click();
    await expect(saveButton).toBeEnabled();
    await page
      .locator('.toggle')
      .filter({ has: page.getByRole('switch', { name: 'In orientation' }) })
      .click();
    await expect(saveButton).toBeDisabled();
    await expect(
      page.getByText("Orientation staff can't be leaders"),
    ).toBeVisible();
    await page
      .locator('.toggle')
      .filter({ has: page.getByRole('switch', { name: 'Leader' }) })
      .click();
    await expect(saveButton).toBeEnabled();
    await page
      .locator('.toggle')
      .filter({ has: page.getByRole('switch', { name: 'In orientation' }) })
      .click();

    await page.getByLabel('Job title').focus();
    await page.getByLabel('Job title').fill('');
    await expect(saveButton).toBeEnabled();
    await page.getByLabel('Job title').blur();
    await expect(saveButton).toBeDisabled();
    await page.getByLabel('Job title').fill('RN');
    await expect(saveButton).toBeDisabled();
    await page.getByLabel('Job title').blur();
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByRole('heading', { name: 'Staff' })).toBeVisible();
    await expect(page.getByText('First, Ada')).toBeVisible();

    await page.getByRole('button', { name: 'Add staff' }).click();
    await page.getByLabel('First name').fill('Bob');
    await page.getByLabel('Last name').fill('Second');
    await page.getByLabel('Job title').fill('Tech');
    await page.getByLabel('Preferred start time').fill('07:30');
    await page.getByLabel('Role').selectOption('1');
    const pacuToggle = page
      .locator('.toggle')
      .filter({ has: page.getByRole('switch', { name: 'PACU' }) });
    await pacuToggle.click();
    await expect(page.getByRole('switch', { name: 'PACU' })).toBeChecked();
    await page.getByLabel('Job title').focus();
    await page.getByLabel('Job title').blur();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Second, Bob')).toBeVisible();

    await page.getByText('First, Ada').click();
    await page.getByLabel('Job title').fill('Senior RN');
    await page.getByLabel('Preferred start time').fill('08:15');
    await page.getByLabel('Role').selectOption('1');
    await page.getByLabel('Employment').selectOption('1');
    const leaderToggle = page
      .locator('.toggle')
      .filter({ has: page.getByRole('switch', { name: 'Leader' }) });
    await leaderToggle.click();
    await expect(page.getByRole('switch', { name: 'Leader' })).toBeChecked();
    await page.getByLabel('Job title').focus();
    await page.getByLabel('Job title').blur();
    await page.getByRole('button', { name: 'Add a conflict...' }).click();
    await page.getByRole('option', { name: 'Bob Second' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

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
    app = await launchApp(userDataPath);
    page = await app.firstWindow();
    await page.waitForLoadState('load');
    await page.getByRole('link', { name: 'Staff' }).click();
    await page.getByText('First, Ada').click();
    await expect(page.getByLabel('Job title')).toHaveValue('Senior RN');
    await expect(page.getByLabel('Preferred start time')).toHaveValue('8:15 AM');
    await expect(page.getByLabel('Role')).toHaveValue('1');
    await expect(page.getByLabel('Employment')).toHaveValue('1');
    await expect(page.getByRole('switch', { name: 'PROC' })).toBeChecked();
    await expect(page.getByRole('switch', { name: 'PACU' })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: 'PRE' })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: 'Leader' })).toBeChecked();
    await expect(
      page.getByRole('switch', { name: 'In orientation' }),
    ).not.toBeChecked();
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
  test.setTimeout(60_000);
  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-schedule-e2e-'));
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
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
    await expect
      .poll(() => page.evaluate(() => window.segments.list()))
      .toEqual([
        expect.objectContaining({
          status: 'draft',
          state: expect.objectContaining({
            ptoDates: [expect.stringMatching(/^1:/)],
          }),
        }),
      ]);
    await page.getByRole('link', { name: 'Schedules' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Save draft' })
      .click();
    await page.getByRole('button', { name: 'Resume schedule draft' }).click();
    const resumedPtoCell = page.getByRole('button', {
      name: ptoLabel!.replace('not selected', 'selected'),
    });
    await expect(resumedPtoCell).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { name: /PRN working days/ })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Generate', exact: true }).locator('i'),
    ).toHaveClass(/bi-arrow-repeat/);
    const prnCell = page.getByRole('button', { name: /Penny Prn,/ }).first();
    await prnCell.click();
    await expect(prnCell).toHaveClass(/schedule-cell-prn/);
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Review & overrides' }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Schedule warnings' }),
    ).toHaveCount(0);
    await expect(page.locator('.chip.error')).toHaveCount(0);
    await expect(
      page.locator('.schedule-steps').getByText('Confirm', { exact: true }),
    ).toHaveCount(0);
    for (const [name, iconClass, title] of [
      ['On-call mode', 'bi-telephone', 'Toggle on-call mode'],
      ['Undo', 'bi-arrow-counterclockwise', 'Undo last change'],
      ['Redo', 'bi-arrow-clockwise', 'Redo last undone change'],
      ['Regenerate', 'bi-arrow-repeat', 'Regenerate schedule'],
    ]) {
      const control = page.getByRole('button', { name, exact: true });
      await expect(control.locator('i')).toHaveClass(new RegExp(iconClass));
      await expect(control).toHaveAttribute('title', title);
    }
    const reviewPtoCell = page.getByRole('button', { name: /Ada Nurse, .*: PTO/ });
    await expect(reviewPtoCell).toBeVisible();
    const ptoBeforeHover = await reviewPtoCell.evaluate((cell) => ({
      background: getComputedStyle(cell).backgroundColor,
      color: getComputedStyle(cell).color,
    }));
    await reviewPtoCell.locator('xpath=..').hover();
    await expect
      .poll(() =>
        reviewPtoCell.evaluate((cell) => ({
          background: getComputedStyle(cell).backgroundColor,
          color: getComputedStyle(cell).color,
        })),
      )
      .toEqual(ptoBeforeHover);

    await page.getByRole('button', { name: 'On-call mode' }).click();
    await expect(
      page.getByRole('button', { name: /Ada Nurse, .*: Working/ }).first(),
    ).toBeEnabled();
    await expect(
      page.getByRole('button', { name: /Ada Nurse, .*: Off/ }).first(),
    ).toBeDisabled();
    await expect(reviewPtoCell).toHaveText('–');
    await expect(reviewPtoCell).not.toHaveClass(/schedule-cell-pto/);
    await page.getByRole('button', { name: 'On-call mode' }).click();
    await expect(reviewPtoCell).toHaveText('P');
    await expect(reviewPtoCell).toHaveClass(/schedule-cell-pto/);

    await page.getByRole('button', { name: 'On-call mode' }).click();
    const workingCell = page
      .getByRole('button', { name: /Ada Nurse, .*: Working/ })
      .first();
    await workingCell.click();
    const onCallCell = page.getByRole('button', {
      name: /Ada Nurse, .*: On-call/,
    }).first();
    await expect(onCallCell).toBeVisible();
    const onCallBeforeHover = await onCallCell.evaluate((cell) => ({
      background: getComputedStyle(cell).backgroundColor,
      color: getComputedStyle(cell).color,
    }));
    await onCallCell.locator('xpath=..').hover();
    await expect
      .poll(() =>
        onCallCell.evaluate((cell) => ({
          background: getComputedStyle(cell).backgroundColor,
          color: getComputedStyle(cell).color,
        })),
      )
      .toEqual(onCallBeforeHover);
    await page.getByRole('button', { name: 'On-call mode' }).click();
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
    const confirmButton = page.getByRole('button', { name: 'Confirm', exact: true });
    await expect(confirmButton.locator('i')).toHaveClass(/bi-check-lg/);
    await page.locator('.schedule-steps').getByText('Review', { exact: true }).waitFor();
    await confirmButton.click();
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

    await expect(
      page.getByRole('heading', {
        name: /^\w+ \d{1,2}, \d{4} – \w+ \d{1,2}, \d{4}$/,
      }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print schedule' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Generate weekly schedule' }),
    ).toHaveCount(6);
    await page.getByRole('link', { name: 'Schedules' }).click();
    const confirmedRow = page
      .locator('.list-table tbody tr')
      .filter({ hasText: 'Confirmed' });
    await expect(confirmedRow).toHaveCount(1);
    await expect(confirmedRow.locator('td')).toHaveCount(4);
    await expect(confirmedRow.locator('td').last()).toBeEmpty();
    await expect
      .poll(() =>
        confirmedRow
          .locator('td')
          .last()
          .evaluate((cell) => cell.getBoundingClientRect().width),
      )
      .toBeGreaterThanOrEqual(96);
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('handles clean, saved, and discarded schedule drafts when leaving', async () => {
  test.setTimeout(60_000);
  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-draft-flow-e2e-'));
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
    await page.evaluate(() =>
      window.staff.create({
        firstName: 'Ada',
        lastName: 'Nurse',
        title: 'RN',
        role: 0,
        employment: 0,
        departments: [0, 2],
        startTime: '07:00',
        isLeader: false,
        inOrientation: false,
        ipcIds: [],
      }),
    );

    await page.getByRole('link', { name: 'Create Schedule' }).click();
    await expect(
      page.getByRole('heading', { name: /PTO calendar/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Back' }).locator('i'),
    ).toHaveClass(/bi-chevron-left/);
    await page.getByRole('link', { name: 'Staff' }).click();
    await expect(page.getByRole('heading', { name: 'Staff' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.segments.list()))
      .toEqual([]);

    await page.getByRole('link', { name: 'Create Schedule' }).click();
    const ptoCell = page.getByRole('button', { name: /Ada Nurse,/ }).first();
    await ptoCell.click();
    await page.getByRole('link', { name: 'Schedules' }).click();
    const leaveDialog = page.getByRole('dialog');
    await expect(leaveDialog).toBeVisible();
    await expect(
      leaveDialog.getByText(/Save this draft to continue it later/),
    ).toBeVisible();

    await leaveDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(leaveDialog).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: /PTO calendar/ }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Schedules' }).click();
    await leaveDialog.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('heading', { name: 'Schedules' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.segments.list()))
      .toEqual([
        expect.objectContaining({
          status: 'draft',
          state: expect.objectContaining({
            ptoDates: [expect.stringMatching(/^1:/)],
          }),
        }),
      ]);
    const draftRow = page.locator('.list-table tbody tr');
    await expect(draftRow.locator('td')).toHaveCount(4);
    await expect
      .poll(() =>
        draftRow
          .locator('td')
          .last()
          .evaluate((cell) => cell.getBoundingClientRect().width),
      )
      .toBeGreaterThanOrEqual(96);

    await page.getByRole('button', { name: 'Resume schedule draft' }).click();
    await expect(
      page.getByRole('heading', { name: /PTO calendar/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Review & overrides' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Discard draft' })
      .click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.segments.list()))
      .toEqual([]);
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('shows current schedules on the dashboard and opens both detail views', async () => {
  test.setTimeout(60_000);
  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-dashboard-e2e-'));
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.clock.install({ time: new Date('2026-10-21T12:00:00') });
    await seedConfirmedSchedule(page, {
      startDate: '2026-10-05',
      endDate: '2026-11-15',
      includeWorkingDays: true,
      includeToday: true,
    });

    await page.getByRole('link', { name: 'Schedules' }).click();
    await page.getByRole('link', { name: 'Home' }).click();
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Current six-week schedule' }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'This week schedule' }),
    ).toBeVisible();
    await expect(
      page.getByText('Today: 1 nurses and 0 techs. First start 7:00 AM.'),
    ).toBeVisible();
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('schedules:print');
      ipcMain.removeHandler('schedules:export-pdf');
      ipcMain.handle('schedules:print', () => undefined);
      ipcMain.handle('schedules:export-pdf', () => ({ canceled: true }));
    });
    const dashboardUrl = page.url();
    for (const action of [
      'Print six-week schedule',
      'Download six-week schedule',
      'Print weekly schedule',
      'Download weekly schedule',
    ]) {
      await page.getByRole('button', { name: action }).click();
      await expect(page).toHaveURL(dashboardUrl);
    }

    await page
      .getByRole('button', { name: 'Open six-week schedule details' })
      .click();
    await expect(page.getByRole('button', { name: 'Print schedule' })).toBeVisible();

    await page.getByRole('link', { name: 'Home' }).click();
    await page
      .getByRole('button', { name: 'Open weekly schedule details' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Weekly schedule' }),
    ).toBeVisible();
    const weeklyConfirm = page.getByRole('button', { name: 'Confirm', exact: true });
    await expect(weeklyConfirm).toBeDisabled();
    const assignment = page
      .getByRole('button', { name: /Edit .* start time for/ })
      .first();
    const sourceColumn = await assignment.evaluate(
      (element) => element.closest('td')?.cellIndex,
    );
    expect(sourceColumn).toBeGreaterThan(0);
    const procRoomRow = page
      .locator('.weekly-schedule-grid tbody tr')
      .filter({ has: page.getByRole('rowheader', { name: 'PR 1' }) });
    const invalidDropCell = procRoomRow
      .locator('td')
      .nth(sourceColumn! - 1);
    const otherDayCell = procRoomRow
      .locator('td')
      .nth(sourceColumn! % 7);
    await assignment.evaluate((element) => {
      element.dispatchEvent(
        new DragEvent('dragstart', {
          bubbles: true,
          dataTransfer: new DataTransfer(),
        }),
      );
    });
    const invalidDropContent = invalidDropCell.locator(
      '.weekly-assignment-list',
    );
    const otherDayContent = otherDayCell.locator('.weekly-assignment-list');
    await expect(invalidDropContent).not.toHaveClass(/weekly-drop-not-allowed/);
    await invalidDropCell.evaluate((element) => {
      element.dispatchEvent(
        new DragEvent('dragover', {
          bubbles: true,
          dataTransfer: new DataTransfer(),
        }),
      );
    });
    await expect(invalidDropContent).toHaveAttribute(
      'data-tooltip',
      "Ada Nurse can't work in PROC",
    );
    await expect(invalidDropContent).toHaveClass(/weekly-drop-not-allowed/);
    await expect(otherDayContent).not.toHaveAttribute('data-tooltip');
    await expect(otherDayContent).not.toHaveClass(/weekly-drop-not-allowed/);
    await expect
      .poll(() =>
        invalidDropContent.evaluate((element) =>
          getComputedStyle(element).backgroundColor,
        ),
      )
      .toBe('rgb(253, 228, 234)');
    await expect
      .poll(() =>
        invalidDropContent.evaluate(
          (element) => getComputedStyle(element).borderRadius,
        ),
      )
      .toBe('4px');
    await expect
      .poll(() =>
        invalidDropContent.evaluate(
          (element) => getComputedStyle(element, '::after').visibility,
        ),
      )
      .toBe('visible');
    await assignment.evaluate((element) => {
      element.dispatchEvent(
        new DragEvent('dragend', {
          bubbles: true,
          dataTransfer: new DataTransfer(),
        }),
      );
    });
    const assignmentBounds = await assignment.boundingBox();
    const timeBounds = await assignment
      .locator('.weekly-assignment-time')
      .boundingBox();
    await assignment.click();
    const editingAssignment = page.locator('.weekly-assignment-editing');
    const editingBounds = await editingAssignment.boundingBox();
    expect(editingBounds?.width).toBe(assignmentBounds?.width);
    expect(editingBounds?.height).toBe(assignmentBounds?.height);
    const editor = page.getByRole('dialog', { name: /Start time ·.*time picker/ });
    const timeInput = page.getByRole('textbox', { name: /Start time ·/ });
    const inlineInputBounds = await timeInput.boundingBox();
    const pickerPlacement = await editor.getAttribute('data-placement');
    const editorBounds = await editor.boundingBox();
    expect(inlineInputBounds).not.toBeNull();
    expect(editorBounds).not.toBeNull();
    expect(Math.abs(editorBounds!.x - assignmentBounds!.x)).toBeLessThan(2);
    if (pickerPlacement === 'above') {
      expect(
        Math.abs(
          editorBounds!.y + editorBounds!.height + 6 - inlineInputBounds!.y,
        ),
      ).toBeLessThan(2);
    } else {
      expect(
        Math.abs(
          editorBounds!.y - inlineInputBounds!.y - inlineInputBounds!.height - 6,
        ),
      ).toBeLessThan(2);
    }
    await expect(editor.locator('select')).toHaveCount(0);
    await expect(editor.locator('.time-picker-heading')).toHaveCount(0);
    await expect(editor.getByText(/^Start time ·/)).toHaveCount(0);
    await expect(editor.locator('.time-picker-columns')).toBeVisible();
    await expect(
      editor.getByRole('button', { name: '15', exact: true }),
    ).toBeVisible();
    const editedTimeBounds = await timeInput.boundingBox();
    expect(editedTimeBounds?.width).toBe(timeBounds?.width);
    await editor.getByRole('button', { name: '15', exact: true }).click();
    await expect(timeInput).toHaveValue(/:15 /);
    expect(await editor.boundingBox()).toEqual(editorBounds);
    await timeInput.fill('7:25 AM');
    expect(await editor.boundingBox()).toEqual(editorBounds);
    await editor.getByRole('button', { name: 'Confirm time selection' }).click();
    await expect(page.getByText('7:25 AM').first()).toBeVisible();
    await expect(weeklyConfirm).toBeEnabled();
    await expect(
      page.getByText('Assignment updated. Confirm to save your changes.'),
    ).toHaveCount(0);
    await weeklyConfirm.click();
    await expect(weeklyConfirm).toBeDisabled();
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('includes the Sunday before a schedule start in its first schedule week', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-sunday-period-e2e-'));
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
    await page.clock.install({ time: new Date('2026-11-01T12:00:00') });
    await seedConfirmedSchedule(page, {
      startDate: '2026-11-02',
      endDate: '2026-12-11',
      shiftDates: ['2026-11-02'],
    });

    await page.reload();
    await expect(
      page.getByRole('region', { name: 'Current six-week schedule' }),
    ).toBeVisible();
    await expect(
      page.getByText('Week 1 of 6', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Today: .* nurses and .* techs\. First start/),
    ).toHaveCount(0);
    await expect(
      page.locator('[aria-label="Week 1, current week"]'),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'This week schedule' }).getByText('Nov 2 – Nov 6'),
    ).toBeVisible();
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('prompts users with no staff to add their first staff member', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-empty-dashboard-e2e-'));
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Let’s meet the team' }),
    ).toBeVisible();
    await expect(
      page.getByText('Add your staff and Colonder can start building schedules.'),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Up next' })).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Current schedules' }),
    ).toHaveCount(0);

    await page.getByRole('link', { name: 'Create Schedule' }).click();
    await expect(
      page.getByRole('heading', { name: 'Let’s meet the team' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add staff' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Next' })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Generate', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('link', { name: 'Home' }).click();

    await page.getByRole('button', { name: 'Add staff' }).click();
    await expect(page.getByRole('heading', { name: 'Add Staff' })).toBeVisible();
    await expect(page.getByLabel('First name')).toBeVisible();
    await expect(page.getByLabel('Last name')).toBeVisible();
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('offers six-week generation when the next schedule is due', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-next-six-week-e2e-'));
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.clock.install({ time: new Date('2026-10-21T12:00:00') });
    await seedConfirmedSchedule(page, {
      startDate: '2026-09-12',
      endDate: '2026-10-23',
      shiftDates: ['2026-10-21'],
    });

    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Up next' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create next six-week schedule' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Generate next weekly schedule' }),
    ).toHaveCount(0);

    await page
      .getByRole('button', { name: 'Create next six-week schedule' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Create Schedule' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Home' }).click();
    await expect(
      page.getByRole('button', { name: 'Create next six-week schedule' }),
    ).toHaveCount(0);
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('offers weekly generation only for an unscheduled week in a confirmed schedule', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-next-week-e2e-'));
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.clock.install({ time: new Date('2026-10-21T12:00:00') });
    await seedConfirmedSchedule(page, {
      startDate: '2026-10-05',
      endDate: '2026-11-13',
      shiftDates: ['2026-10-21'],
    });

    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Generate next weekly schedule' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create next six-week schedule' }),
    ).toHaveCount(0);

    await page
      .getByRole('button', { name: 'Generate next weekly schedule' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Weekly schedule' }),
    ).toBeVisible();
    await expect(page.getByLabel('Week of')).toHaveValue('2026-10-26');

    await page.getByRole('link', { name: 'Home' }).click();
    await expect(
      page.getByRole('button', { name: 'Generate next weekly schedule' }),
    ).toHaveCount(0);
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});
