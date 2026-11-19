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

const continueFromStartDate = async (page: Page) => {
  await expect(
    page.getByRole('heading', { name: 'Select start date' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'FMLA' })).toBeVisible();
};

test('deletes a confirmed schedule after confirmation', async () => {
  const userDataPath = await mkdtemp(
    join(tmpdir(), 'colonder-delete-schedule-e2e-'),
  );
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
    await seedConfirmedSchedule(page, {
      startDate: '2026-10-05',
      endDate: '2026-11-13',
      shiftDates: ['2026-10-05'],
    });

    await page.getByRole('link', { name: 'Schedules' }).click();
    const row = page.locator('.list-table tbody tr');
    await expect(row).toContainText('Confirmed');
    await row.getByRole('button', { name: 'Delete schedule' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete schedule?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.segments.list()))
      .toHaveLength(1);

    await row.getByRole('button', { name: 'Delete schedule' }).click();
    await page
      .getByRole('dialog', { name: 'Delete schedule?' })
      .getByRole('button', { name: 'Delete schedule' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'No schedules yet' }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.segments.list()))
      .toHaveLength(0);
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('starts a fresh schedule at the start-date step after editing history', async () => {
  const userDataPath = await mkdtemp(
    join(tmpdir(), 'colonder-edit-new-schedule-e2e-'),
  );
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
    await seedConfirmedSchedule(page, {
      startDate: '2026-10-05',
      endDate: '2026-11-13',
      shiftDates: ['2026-10-05'],
    });

    await page.getByRole('link', { name: 'Schedules' }).click();
    await page.locator('.list-table tbody tr').click();
    await page.getByRole('button', { name: 'Edit schedule' }).click();
    await expect(
      page.getByRole('heading', { name: 'Edit schedule' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Create Schedule' }).click();
    await continueFromStartDate(page);
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

type ConfirmedScheduleSeed = {
  startDate: string;
  endDate: string;
  shiftDates?: string[];
  ptoDate?: string;
  onCallDate?: string;
  offDate?: string;
  includeWorkingDays?: boolean;
  includeToday?: boolean;
  includeOngoingFmla?: boolean;
};

const seedConfirmedSchedule = async (
  page: Page,
  seed: ConfirmedScheduleSeed,
) => {
  await page.evaluate(
    async ({
      startDate,
      endDate,
      shiftDates = [],
      ptoDate,
      onCallDate,
      offDate,
      includeWorkingDays = false,
      includeToday = false,
      includeOngoingFmla = false,
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
          if (settings.workingDays[date.getDay()] && toIso(date) !== offDate) {
            dates.add(toIso(date));
          }
        }
      }
      if (includeToday) dates.add(toIso(new Date()));
      if (ptoDate) dates.add(ptoDate);
      if (onCallDate) dates.add(onCallDate);
      const state = {
        step: 'review' as const,
        startDate,
        endDate,
        fmlaEntries: includeOngoingFmla
          ? [
              {
                staffId: person.id,
                onFmla: true,
                startDate,
                endDate: null,
                rolledOver: false,
              },
            ]
          : [],
        ptoDates: ptoDate ? [`${person.id}:${ptoDate}`] : [],
        prnDates: [],
        shifts: [...dates].map((date) => ({
          staffId: person.id,
          date,
          kind: includeOngoingFmla
            ? ('fmla' as const)
            : date === ptoDate
              ? ('pto' as const)
              : ('work' as const),
          countsTowardTargets: !includeOngoingFmla && date !== ptoDate,
        })),
        onCall: onCallDate ? [`${person.id}:${onCallDate}`] : [],
        onCallDepartments: onCallDate
          ? { [`${person.id}:${onCallDate}`]: 0 }
          : {},
        staffSnapshot: [person],
        settingsSnapshot: settings,
        seed: 1,
        hasManualEdits: false,
      };
      const draft = await window.segments.create(state);
      await window.segments.confirm(draft.id, state);
    },
    seed,
  );
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
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByLabel('Target nurses')).toHaveValue('13');

    await page.getByLabel('Target nurses').fill('17');
    await page.getByLabel('Target techs').fill('8');
    await page.getByLabel('Procedure rooms (PROC)').fill('6');
    await page.getByLabel('Delete after (weeks)').fill('24');
    await page.getByRole('button', { name: 'Sun' }).click();
    await page.getByRole('button', { name: 'Thu' }).click();
    await expect(
      page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.settings.get()))
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

test('recalculates the review schedule after PTO edits', async () => {
  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-pto-e2e-'));
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
    const draft = await page.evaluate(async () => {
      const [person, settings] = await Promise.all([
        window.staff.create({
          firstName: 'Pto',
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
      const startDate = '2026-10-05';
      const dates = Array.from({ length: 42 }, (_, index) => {
        const date = new Date(`${startDate}T00:00:00.000Z`);
        date.setUTCDate(date.getUTCDate() + index);
        return date.toISOString().slice(0, 10);
      }).filter(
        (date) =>
          settings.workingDays[new Date(`${date}T00:00:00.000Z`).getUTCDay()],
      );
      const state = {
        step: 'review' as const,
        startDate,
        endDate: '2026-11-13',
        fmlaEntries: [],
        ptoDates: [],
        prnDates: [],
        shifts: dates.map((date) => ({
          staffId: person.id,
          date,
          kind: 'work' as const,
          countsTowardTargets: true,
        })),
        onCall: [`${person.id}:${dates[0]}`],
        onCallDepartments: { [`${person.id}:${dates[0]}`]: 0 },
        staffSnapshot: [person],
        settingsSnapshot: settings,
        seed: 1,
        hasManualEdits: false,
      };
      return {
        id: (await window.segments.create(state)).id,
        personId: person.id,
        firstDate: dates[0],
      };
    });

    await page.evaluate((id) => {
      window.location.hash = `/new?draft=${id}`;
    }, draft.id);
    await expect(
      page.getByRole('heading', { name: 'Review & overrides' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Turn on PTO mode' }).click();
    await expect(page.getByRole('region', { name: 'PTO mode' })).toBeVisible();
    const firstWorkingCell = page
      .getByRole('button', { name: /Pto Nurse, .*: Working/ })
      .first();
    await expect(firstWorkingCell).toHaveText('W');
    await expect(firstWorkingCell).not.toHaveClass(/schedule-cell-oncall/);
    await page.getByRole('switch', { name: 'Turn off PTO mode' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Recalculate the schedule?' }),
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Turn on PTO mode' }).click();
    await expect(page.getByRole('region', { name: 'PTO mode' })).toBeVisible();

    const workingCells = page.getByRole('button', {
      name: /Pto Nurse, .*: Working/,
    });
    const startCell = await workingCells.nth(0).boundingBox();
    const endCell = await workingCells.nth(1).boundingBox();
    expect(startCell).not.toBeNull();
    expect(endCell).not.toBeNull();
    await page.mouse.move(
      startCell!.x + startCell!.width / 2,
      startCell!.y + startCell!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      endCell!.x + endCell!.width / 2,
      endCell!.y + endCell!.height / 2,
    );
    await page.mouse.up();
    const ptoCell = page
      .getByRole('button', {
        name: /Pto Nurse, .*: PTO/,
      })
      .nth(0);
    const secondPtoCell = page
      .getByRole('button', {
        name: /Pto Nurse, .*: PTO/,
      })
      .nth(1);
    const secondCell = page.locator(
      '.review-grid .schedule-cell[data-grid-row="0"][data-grid-column="1"]',
    );
    await expect(ptoCell).toHaveAttribute('aria-pressed', 'true');
    await expect(secondPtoCell).toHaveAttribute('aria-pressed', 'true');
    await expect(ptoCell).toHaveCSS('background-color', 'rgb(253, 228, 234)');
    await expect(ptoCell).not.toHaveClass(
      /schedule-cell-pto-added|schedule-cell-pto-removed/,
    );
    await expect(page.getByText('2 changes', { exact: true })).toBeVisible();
    await secondCell.click();
    await expect(secondCell).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('1 change', { exact: true })).toBeVisible();

    await page.getByRole('switch', { name: 'Turn off PTO mode' }).click();
    const recalculateDialog = page.getByRole('dialog', {
      name: 'Recalculate the schedule?',
    });
    await expect(recalculateDialog).toBeVisible();
    await recalculateDialog
      .getByRole('button', { name: 'Keep editing' })
      .click();
    await expect(
      page.getByRole('switch', { name: 'Turn off PTO mode' }),
    ).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(recalculateDialog).toBeVisible();
    await recalculateDialog
      .getByRole('button', { name: 'Recalculate' })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Recalculating around the new PTO…',
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Review & overrides' }),
    ).toBeVisible();
    await expect(page.getByRole('status')).toContainText(
      'Schedule recalculated',
    );

    await expect
      .poll(() =>
        page.evaluate(async ({ id, personId, firstDate }) => {
          const saved = (await window.segments.list()).find(
            (segment) => segment.id === id,
          );
          const key = `${personId}:${firstDate}`;
          return {
            hasPtoDate: saved?.state.ptoDates.includes(key),
            hasPtoShift: saved?.state.shifts.some(
              (shift) =>
                shift.staffId === personId &&
                shift.date === firstDate &&
                shift.kind === 'pto',
            ),
            hasWorkShift: saved?.state.shifts.some(
              (shift) =>
                shift.staffId === personId &&
                shift.date === firstDate &&
                shift.kind === 'work',
            ),
          };
        }, draft),
      )
      .toEqual({
        hasPtoDate: true,
        hasPtoShift: true,
        hasWorkShift: false,
      });
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('on-call mode applies department and weekend assignments for eligible staff', async () => {
  test.setTimeout(90_000);
  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-oncall-e2e-'));
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
    const draftId = await page.evaluate(async () => {
      const people = await Promise.all([
        window.staff.create({
          firstName: 'Full',
          lastName: 'Dual',
          title: 'RN',
          role: 0,
          employment: 0,
          departments: [0, 1],
          startTime: '07:00',
          isLeader: false,
          inOrientation: false,
          ipcIds: [],
        }),
        window.staff.create({
          firstName: 'Part',
          lastName: 'Dual',
          title: 'RN',
          role: 0,
          employment: 1,
          departments: [0, 1],
          startTime: '07:00',
          isLeader: false,
          inOrientation: false,
          ipcIds: [],
        }),
        window.staff.create({
          firstName: 'Pacu',
          lastName: 'Only',
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
          firstName: 'Proc',
          lastName: 'Only',
          title: 'RN',
          role: 0,
          employment: 0,
          departments: [1],
          startTime: '07:00',
          isLeader: false,
          inOrientation: false,
          ipcIds: [],
        }),
        window.staff.create({
          firstName: 'Orientation',
          lastName: 'Staff',
          title: 'RN',
          role: 0,
          employment: 0,
          departments: [0, 1],
          startTime: '07:00',
          isLeader: false,
          inOrientation: true,
          ipcIds: [],
        }),
        window.staff.create({
          firstName: 'Untrained',
          lastName: 'Staff',
          title: 'RN',
          role: 0,
          employment: 0,
          departments: [2],
          startTime: '07:00',
          isLeader: false,
          inOrientation: false,
          ipcIds: [],
        }),
        window.staff.create({
          firstName: 'Charge',
          lastName: 'Staff',
          title: 'RN',
          role: 2,
          employment: 0,
          departments: [],
          startTime: '07:00',
          isLeader: false,
          inOrientation: false,
          ipcIds: [],
        }),
        window.staff.create({
          firstName: 'Pto',
          lastName: 'Friday',
          title: 'RN',
          role: 0,
          employment: 0,
          departments: [0, 1],
          startTime: '07:00',
          isLeader: false,
          inOrientation: false,
          ipcIds: [],
        }),
        window.staff.create({
          firstName: 'Fmla',
          lastName: 'Monday',
          title: 'RN',
          role: 0,
          employment: 0,
          departments: [0, 1],
          startTime: '07:00',
          isLeader: false,
          inOrientation: false,
          ipcIds: [],
        }),
        window.staff.create({
          firstName: 'Rolled',
          lastName: 'Fmla',
          title: 'RN',
          role: 0,
          employment: 0,
          departments: [0, 1],
          startTime: '07:00',
          isLeader: false,
          inOrientation: false,
          ipcIds: [],
        }),
      ]);
      const settings = await window.settings.get();
      const startDate = '2026-10-05';
      const dates = Array.from({ length: 42 }, (_, index) => {
        const date = new Date(`${startDate}T00:00:00.000Z`);
        date.setUTCDate(date.getUTCDate() + index);
        return date.toISOString().slice(0, 10);
      }).filter(
        (date) =>
          settings.workingDays[new Date(`${date}T00:00:00.000Z`).getUTCDay()],
      );
      const state = {
        step: 'review' as const,
        startDate,
        endDate: '2026-11-13',
        fmlaEntries: [
          {
            staffId: people.find((person) => person.firstName === 'Fmla')!.id,
            onFmla: true,
            startDate: dates[5],
            endDate: dates[6],
            rolledOver: false,
          },
          {
            staffId: people.find((person) => person.firstName === 'Rolled')!.id,
            onFmla: true,
            startDate: '2026-09-01',
            endDate: null,
            rolledOver: true,
          },
        ],
        ptoDates: [],
        prnDates: [],
        shifts: people.flatMap((person) =>
          dates
            .filter(
              (date) => !(person.firstName === 'Full' && date === dates[0]),
            )
            .map((date) => ({
              staffId: person.id,
              date,
              kind:
                person.firstName === 'Rolled'
                  ? ('fmla' as const)
                  : person.firstName === 'Pto' && date === dates[4]
                    ? ('pto' as const)
                    : person.firstName === 'Fmla' && date === dates[5]
                      ? ('fmla' as const)
                      : ('work' as const),
              countsTowardTargets: true,
            })),
        ),
        onCall: [],
        onCallDepartments: {},
        weekendOnCall: [],
        onCallManuallyEdited: false,
        staffSnapshot: people,
        settingsSnapshot: {
          ...settings,
          targetNurses: 0,
          targetTechs: 0,
        },
        seed: 1,
        hasManualEdits: false,
      };
      return (await window.segments.create(state)).id;
    });

    await page.evaluate((id) => {
      window.location.hash = `/new?draft=${id}`;
    }, draftId);
    await expect(
      page.getByRole('heading', { name: 'Review & overrides' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Turn on on-call mode' }).click();
    await expect(
      page.getByRole('region', { name: 'On-call mode' }),
    ).toBeVisible();
    for (const action of ['Undo', 'Redo', 'Regenerate']) {
      await expect(page.getByRole('button', { name: action })).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Auto apply' }).click();
    await expect(page.getByRole('button', { name: 'Auto apply' })).toHaveCount(
      0,
    );

    await expect
      .poll(() =>
        page.evaluate(async () => {
          const draft = (await window.segments.list())[0];
          const weekendCount = (staffId: string) =>
            (draft?.state.weekendOnCall?.filter(
              (assignment) => String(assignment.staffId) === staffId,
            ).length ?? 0) * 2;
          return {
            fullTime:
              (draft?.state.onCall.filter((key) => key.startsWith('1:'))
                .length ?? 0) + weekendCount('1'),
            partTime:
              (draft?.state.onCall.filter((key) => key.startsWith('2:'))
                .length ?? 0) + weekendCount('2'),
            weekend: draft?.state.weekendOnCall?.length,
          };
        }),
      )
      .toEqual({ fullTime: 5, partTime: 3, weekend: 6 });
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const draft = (await window.segments.list())[0];
          const staffId = (firstName: string) =>
            draft?.state.staffSnapshot.find(
              (person) => person.firstName === firstName,
            )?.id;
          const weekends = draft?.state.weekendOnCall ?? [];
          const firstWeekend = weekends.find(
            (assignment) => assignment.weekStart === '2026-10-05',
          );
          return (
            firstWeekend?.staffId !== staffId('Pto') &&
            firstWeekend?.staffId !== staffId('Fmla') &&
            !weekends.some(
              (assignment) => assignment.staffId === staffId('Rolled'),
            )
          );
        }),
      )
      .toBe(true);

    const weekendPicker = page.getByRole('button', {
      name: 'Weekend OC Week 1',
    });
    await weekendPicker.click();
    const weekendOptions = page.getByRole('listbox', {
      name: 'Eligible staff for Weekend OC Week 1',
    });
    const optionLabels = await weekendOptions
      .getByRole('option')
      .allTextContents();
    expect(optionLabels).toEqual(['Assign nurse', 'Full D.', 'Part D.']);
    await expect(
      weekendOptions.getByRole('option', { name: 'Pto F.' }),
    ).toHaveCount(0);
    await expect(
      weekendOptions.getByRole('option', { name: 'Fmla M.' }),
    ).toHaveCount(0);
    await expect(
      weekendOptions.getByRole('option', { name: 'Rolled F.' }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        weekendOptions.evaluate(
          (menu) =>
            menu.getBoundingClientRect().bottom <=
            menu.parentElement!.getBoundingClientRect().top,
        ),
      )
      .toBe(true);
    await weekendOptions.getByRole('option', { name: 'Part D.' }).click();
    await expect(weekendPicker).toHaveCSS(
      'background-color',
      'rgb(11, 92, 86)',
    );

    const dualCell = page
      .getByRole('button', { name: /Full Dual, .*: (Working|On-call)/ })
      .first();
    const dualCellLabel = await dualCell.getAttribute('aria-label');
    await dualCell.click();
    const departmentPopup = page.getByRole('dialog', {
      name: /On-call department for Full Dual/,
    });
    await expect(departmentPopup).toBeVisible();
    const procOption = departmentPopup.getByRole('button', { name: 'PROC' });
    await procOption.click();
    await expect(
      page.getByRole('button', {
        name: dualCellLabel!.replace(
          /: (Working|On-call (PACU|PROC))$/,
          ': On-call PROC',
        ),
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: dualCellLabel!.replace(
          /: (Working|On-call (PACU|PROC))$/,
          ': On-call PROC',
        ),
      }),
    ).toHaveCSS('background-color', 'rgb(181, 211, 52)');
    await expect(
      page.getByRole('button', { name: 'Reset to auto' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Reset to auto' }).click();
    await expect(
      page.getByRole('button', { name: 'Reset to auto' }),
    ).toHaveCount(0);

    const orientationCell = page
      .getByRole('button', {
        name: /Orientation Staff, .*: Working/,
      })
      .first();
    await expect(orientationCell).toBeEnabled();
    await orientationCell.click();
    const orientationWarning = page.getByRole('dialog', {
      name: 'Confirm on-call assignment',
    });
    await expect(
      orientationWarning.getByText(
        'This user is in oritentation. Are you sure you want to put them on call?',
      ),
    ).toBeVisible();
    await orientationWarning.getByRole('button', { name: 'Cancel' }).click();
    await expect(orientationWarning).toHaveCount(0);
    await page
      .getByRole('button', { name: /Orientation Staff, .*: Working/ })
      .first()
      .click();
    await page
      .getByRole('dialog', { name: 'Confirm on-call assignment' })
      .getByRole('button', { name: 'Confirm' })
      .click();
    const orientationDepartment = page.getByRole('dialog', {
      name: /On-call department for Orientation Staff/,
    });
    await orientationDepartment.getByRole('button', { name: 'PACU' }).click();
    await expect(
      page.getByRole('button', { name: /Orientation Staff, .*: On-call PACU/ }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: /Untrained Staff, .*: Working/ })
      .first()
      .click();
    await page
      .getByRole('dialog', { name: 'Confirm on-call assignment' })
      .getByRole('button', { name: 'Confirm' })
      .click();
    const untrainedDepartment = page.getByRole('dialog', {
      name: /On-call department for Untrained Staff/,
    });
    await untrainedDepartment.getByRole('button', { name: 'PROC' }).click();
    await expect(
      page.getByRole('button', { name: /Untrained Staff, .*: On-call PROC/ }),
    ).toBeVisible();

    const chargeCell = page
      .getByRole('button', {
        name: /Charge Staff, .*: Working/,
      })
      .first();
    await expect(chargeCell).toBeEnabled();
    await chargeCell.click();
    const chargeDepartment = page.getByRole('dialog', {
      name: /On-call department for Charge Staff/,
    });
    await expect(
      chargeDepartment.getByRole('button', { name: 'PACU' }),
    ).toBeVisible();
    await chargeDepartment.getByRole('button', { name: 'PACU' }).click();

    const pacuCell = page
      .getByRole('button', {
        name: /Pacu Only, .*: Working/,
      })
      .first();
    const pacuWorkLabel = await pacuCell.getAttribute('aria-label');
    await pacuCell.click();
    const pacuOnCall = page.getByRole('button', {
      name: pacuWorkLabel!.replace(': Working', ': On-call PACU'),
    });
    await expect(pacuOnCall).toBeVisible();
    await expect(pacuOnCall).toHaveCSS('background-color', 'rgb(47, 84, 199)');
    await pacuOnCall.click();
    await expect(pacuCell).toBeVisible();

    const procCell = page
      .getByRole('button', {
        name: /Proc Only, .*: Working/,
      })
      .first();
    const procWorkLabel = await procCell.getAttribute('aria-label');
    await procCell.click();
    const procOnCall = page.getByRole('button', {
      name: procWorkLabel!.replace(': Working', ': On-call PROC'),
    });
    await expect(procOnCall).toBeVisible();
    await expect(procOnCall).toHaveCSS('background-color', 'rgb(181, 211, 52)');
    await procOnCall.click();
    await expect(procCell).toBeVisible();

    await expect(
      page.getByRole('button', { name: 'Reset to auto' }),
    ).toBeVisible();
    await page.evaluate(async (id) => {
      const saved = (await window.segments.list()).find(
        (item) => item.id === id,
      );
      if (!saved) throw new Error('On-call schedule draft was not found.');
      await window.segments.confirm(id, saved.state);
      window.location.hash = `/schedules/${id}`;
    }, draftId);
    await expect(page.locator('.history-details-grid')).toBeVisible();
    await expect(
      page.locator('.history-details-grid .schedule-cell-oncall-pacu').first(),
    ).toBeVisible();
    await expect(
      page.locator('.history-details-grid .schedule-cell-oncall-proc').first(),
    ).toBeVisible();
    const fullTimeHistoryRow = page
      .locator('.history-details-grid tbody tr')
      .filter({ hasText: 'Full D.' });
    await expect(fullTimeHistoryRow.locator('td').first()).not.toHaveClass(
      /schedule-cell-oncall/,
    );
    await expect(page.locator('.history-weekend-row td')).toHaveCount(6);
    const assignedWeekendHistoryCell = page
      .locator('.history-weekend-row .history-weekend-assignment')
      .first();
    await expect(assignedWeekendHistoryCell).toHaveCSS(
      'background-color',
      'rgb(11, 92, 86)',
    );
    await page.locator('.history-week-header').first().hover();
    await expect(assignedWeekendHistoryCell).toHaveCSS(
      'background-color',
      'rgb(11, 92, 86)',
    );
    expect(
      await page
        .locator('.schedule-pdf-grid .schedule-pdf-oncall-pacu')
        .count(),
    ).toBeGreaterThan(0);
    expect(
      await page
        .locator('.schedule-pdf-grid .schedule-pdf-oncall-proc')
        .count(),
    ).toBeGreaterThan(0);
    await expect(
      page.locator('.schedule-pdf-grid .schedule-pdf-weekend-heading'),
    ).toHaveCount(12);
    await expect(
      page.locator('.schedule-pdf-grid .schedule-pdf-weekend-heading').first(),
    ).toContainText('WKND');
    await expect(
      page.locator('.schedule-pdf-grid .schedule-pdf-weekend-row'),
    ).toHaveCount(0);
    await expect(page.locator('.schedule-pdf-legend')).toHaveCount(2);
    await expect(page.locator('.schedule-pdf-legend').first()).toContainText(
      'PROC Call',
    );
    await expect(page.locator('.schedule-pdf-legend').first()).toContainText(
      'PACU Call',
    );
    await expect(page.locator('.schedule-pdf-legend').first()).toContainText(
      'Weekend Call',
    );
    await page.emulateMedia({ media: 'print' });
    await expect(
      page.locator('.schedule-pdf-grid .schedule-pdf-oncall-pacu').first(),
    ).toHaveCSS('background-color', 'rgb(47, 84, 199)');
    await expect(
      page.locator('.schedule-pdf-grid .schedule-pdf-oncall-proc').first(),
    ).toHaveCSS('background-color', 'rgb(181, 211, 52)');
    await expect(
      page.locator('.schedule-pdf-grid .schedule-pdf-weekend-assigned').first(),
    ).toHaveCSS('background-color', 'rgb(11, 92, 86)');
    await expect(
      page
        .locator(
          '.schedule-pdf-grid .schedule-pdf-weekend:not(.schedule-pdf-weekend-assigned)',
        )
        .first(),
    ).toHaveCSS('background-color', 'rgb(229, 231, 235)');
    await expect(
      page
        .locator('.schedule-pdf-grid .schedule-pdf-weekend-heading span')
        .first(),
    ).toHaveCSS(
      'transform',
      /matrix\(0\.707107, -0\.707107, 0\.707107, 0\.707107,/,
    );
    await expect(
      page
        .locator('.schedule-pdf-grid tbody tr')
        .filter({ hasText: 'Full D.' })
        .locator('td')
        .first(),
    ).not.toHaveClass(/schedule-pdf-oncall/);
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
    await expect(
      page.getByText('Select at least one department'),
    ).toBeVisible();
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
    await expect(
      page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeEnabled();
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
    await expect(page.getByLabel('Preferred start time')).toHaveValue(
      '8:15 AM',
    );
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
  test.setTimeout(90_000);
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
    await continueFromStartDate(page);
    await expect(page.getByRole('heading', { name: 'FMLA' })).toBeVisible();
    await expect(page.getByText('0 on FMLA')).toBeVisible();
    const fmlaColumnWidths = await page
      .locator('.fmla-table thead th')
      .evaluateAll((cells) =>
        cells.map((cell) => Math.round(cell.getBoundingClientRect().width)),
      );
    const fmlaToggle = page.getByRole('switch', {
      name: 'On FMLA for Penny Prn',
    });
    await fmlaToggle.locator('..').click();
    await expect
      .poll(() =>
        page
          .locator('.fmla-table thead th')
          .evaluateAll((cells) =>
            cells.map((cell) => Math.round(cell.getBoundingClientRect().width)),
          ),
      )
      .toEqual(fmlaColumnWidths);
    await expect
      .poll(() =>
        page.evaluate(
          async () => (await window.segments.list())[0]?.state.startDate,
        ),
      )
      .toBeTruthy();
    const segmentStart = await page.evaluate(
      async () => (await window.segments.list())[0]!.state.startDate,
    );
    const addDate = (date: string, days: number) => {
      const value = new Date(`${date}T00:00:00.000Z`);
      value.setUTCDate(value.getUTCDate() + days);
      return value.toISOString().slice(0, 10);
    };
    const chooseDate = async (label: string, value: string) => {
      await page.getByLabel(label).click();
      const dialog = page.getByRole('dialog', { name: `${label} calendar` });
      const selectedDate = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${value}T00:00:00.000Z`));
      const visibleMonth = new Date(`${segmentStart}T00:00:00.000Z`);
      const selectedMonth = new Date(`${value}T00:00:00.000Z`);
      if (
        selectedMonth <
        new Date(
          Date.UTC(
            visibleMonth.getUTCFullYear(),
            visibleMonth.getUTCMonth(),
            1,
          ),
        )
      ) {
        await dialog.getByRole('button', { name: 'Previous month' }).click();
      } else if (
        selectedMonth.getUTCFullYear() > visibleMonth.getUTCFullYear() ||
        (selectedMonth.getUTCFullYear() === visibleMonth.getUTCFullYear() &&
          selectedMonth.getUTCMonth() > visibleMonth.getUTCMonth())
      ) {
        await dialog.getByRole('button', { name: 'Next month' }).click();
      }
      await dialog.getByRole('gridcell', { name: selectedDate }).click();
      return dialog;
    };
    const startCalendar = await chooseDate(
      'Start date for Penny Prn',
      segmentStart,
    );
    const outsideStartDate = addDate(segmentStart, -1);
    await expect(
      startCalendar.getByRole('gridcell', {
        name: new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${outsideStartDate}T00:00:00.000Z`)),
      }),
    ).toBeDisabled();
    await startCalendar.getByRole('button', { name: 'Done' }).click();
    await expect
      .poll(() =>
        page.evaluate(
          async () => (await window.segments.list())[0]?.state.fmlaEntries,
        ),
      )
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({ startDate: segmentStart }),
        ]),
      );
    await page.getByLabel('End date for Penny Prn').click();
    const endCalendar = page.getByRole('dialog', {
      name: 'End date for Penny Prn calendar',
    });
    const outsideDate = addDate(segmentStart, -1);
    await expect(
      endCalendar.getByRole('gridcell', {
        name: new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${outsideDate}T00:00:00.000Z`)),
      }),
    ).toBeDisabled();
    await endCalendar
      .getByRole('gridcell', {
        name: new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${segmentStart}T00:00:00.000Z`)),
      })
      .click();
    await endCalendar.getByRole('button', { name: 'Done' }).click();
    await expect(
      page.getByText('End date must be after start date'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    const validEnd = addDate(segmentStart, 1);
    const validEndCalendar = await chooseDate(
      'End date for Penny Prn',
      validEnd,
    );
    await expect
      .poll(() =>
        validEndCalendar
          .getByRole('gridcell', {
            name: new Intl.DateTimeFormat('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
            }).format(new Date(`${segmentStart}T00:00:00.000Z`)),
          })
          .evaluate((day) => getComputedStyle(day).backgroundColor),
      )
      .toBe('rgb(232, 228, 248)');
    await validEndCalendar.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { name: /PTO calendar/ }),
    ).toBeVisible();
    const ptoStep = page
      .locator('.schedule-step-wrap')
      .filter({ hasText: 'PTO' })
      .locator('img');
    await expect(ptoStep).toBeVisible();
    await expect(ptoStep).toHaveAttribute('src', /palm-icon/);
    await expect
      .poll(() =>
        page
          .locator('.input-grid')
          .evaluate(
            (grid) =>
              grid.closest('.schedule-grid-scroll')!.scrollWidth <=
              grid.closest('.schedule-grid-scroll')!.clientWidth,
          ),
      )
      .toBe(true);
    await page.setViewportSize({ width: 900, height: 700 });
    await expect
      .poll(() =>
        page
          .locator('.input-grid')
          .first()
          .evaluate((grid) => {
            const container = grid.closest('.schedule-grid-scroll')!;
            return container.scrollWidth > container.clientWidth;
          }),
      )
      .toBe(true);
    const inputGridScroll = page.locator('.input-grid').first();
    const inputNameCell = inputGridScroll
      .locator('.schedule-name-cell')
      .first();
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
    await expect(page.getByRole('button', { name: /Penny Prn,/ })).toHaveCount(
      0,
    );

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

    const ptoCell = page
      .getByRole('button', {
        name: /Ada Nurse,/,
      })
      .first();
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
    await expect(
      page.getByRole('heading', { name: /PRN working days/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Generate', exact: true }).locator('i'),
    ).toHaveClass(/bi-arrow-repeat/);
    const prnCell = page.getByRole('button', { name: /Penny Prn,/ }).nth(2);
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
    for (const [name, iconClass, title] of [
      ['Turn on on-call mode', 'bi-telephone', 'Turn on on-call mode'],
      ['Undo', 'bi-arrow-counterclockwise', 'Undo last change'],
      ['Redo', 'bi-arrow-clockwise', 'Redo last undone change'],
      ['Regenerate', 'bi-arrow-repeat', 'Regenerate schedule'],
    ]) {
      const control = page.getByRole('button', { name, exact: true });
      await expect(control.locator('i')).toHaveClass(new RegExp(iconClass));
      await expect(control).toHaveAttribute('title', title);
    }
    const reviewPtoCell = page.getByRole('button', {
      name: /Ada Nurse, .*: PTO/,
    });
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

    await page.getByRole('button', { name: 'Turn on on-call mode' }).click();
    await expect(
      page.getByRole('button', { name: /Ada Nurse, .*: Working/ }).first(),
    ).toBeEnabled();
    await expect(
      page.getByRole('button', { name: /Ada Nurse, .*: Off/ }).first(),
    ).toBeDisabled();
    await expect(reviewPtoCell).toHaveText('–');
    await expect(reviewPtoCell).not.toHaveClass(/schedule-cell-pto/);
    await page.getByRole('switch', { name: 'Turn off on-call mode' }).click();
    await expect(reviewPtoCell).toHaveText('P');
    await expect(reviewPtoCell).toHaveClass(/schedule-cell-pto/);
    const reviewFmlaCell = page
      .getByRole('button', { name: /Penny Prn, .*: FMLA/ })
      .first();
    await expect(reviewFmlaCell).toHaveText('F');
    await expect(reviewFmlaCell).toHaveClass(/schedule-cell-fmla/);
    await expect
      .poll(() =>
        reviewFmlaCell.evaluate(
          (cell) => getComputedStyle(cell).backgroundColor,
        ),
      )
      .toBe('rgb(232, 228, 248)');

    await page.getByRole('button', { name: 'Turn on on-call mode' }).click();
    const workingCell = page
      .getByRole('button', { name: /Ada Nurse, .*: Working/ })
      .first();
    await workingCell.click();
    const onCallCell = page
      .getByRole('button', {
        name: /Ada Nurse, .*: On-call/,
      })
      .first();
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
    await page.getByRole('switch', { name: 'Turn off on-call mode' }).click();
    const prnReviewCell = page
      .getByRole('button', { name: /Penny Prn, .*: Working/ })
      .first();
    await expect(prnReviewCell).toBeDisabled();
    await expect(page.getByLabel('PRN').first()).toHaveAttribute(
      'title',
      'PRN',
    );

    await page.setViewportSize({ width: 900, height: 700 });
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator('.review-grid-scroll')
          .evaluate((element) => element.scrollWidth > element.clientWidth),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page
          .locator('.review-grid .schedule-name-cell')
          .first()
          .evaluate((cell) => getComputedStyle(cell, '::after').display),
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
          .evaluate((cell) => getComputedStyle(cell, '::after').display),
      )
      .toBe('block');
    await expect
      .poll(() =>
        page
          .locator('.review-grid .schedule-name-cell')
          .first()
          .evaluate((cell) => {
            const container = cell.closest('.schedule-grid-scroll')!;
            return (
              Math.round(cell.getBoundingClientRect().left) -
              Math.round(container.getBoundingClientRect().left)
            );
          }),
      )
      .toBe(13);
    await expect
      .poll(() =>
        page
          .getByTestId('navbar')
          .evaluate((element) => element.getBoundingClientRect().width),
      )
      .toBeLessThan(80);
    const confirmButton = page.getByRole('button', {
      name: 'Confirm',
      exact: true,
    });
    await expect(confirmButton.locator('i')).toHaveClass(/bi-check-lg/);
    await page
      .locator('.schedule-steps')
      .getByText('Review', { exact: true })
      .waitFor();
    await confirmButton.click();
    await expect(
      page.getByRole('heading', { name: 'Confirm schedule' }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).not.toContainText(/warning/i);
    await page
      .getByRole('button', { name: 'Confirm schedule', exact: true })
      .click();

    await expect(
      page.getByRole('heading', {
        name: /^\w+ \d{1,2}, \d{4} – \w+ \d{1,2}, \d{4}$/,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Print schedule' }),
    ).toBeVisible();
    await expect(
      page.locator('.history-details-grid tbody .schedule-staff-label').first(),
    ).toHaveText('Ada N.');
    const fmlaHistoryRow = page
      .locator('.history-details-grid tbody tr')
      .filter({ hasText: 'Penny P.' });
    await expect(fmlaHistoryRow.locator('span.schedule-cell-fmla')).toHaveCount(
      2,
    );
    await expect(
      fmlaHistoryRow.locator('span.schedule-cell-fmla').first(),
    ).toHaveText('F');
    await expect(fmlaHistoryRow.locator('span.schedule-cell-pto')).toHaveCount(
      0,
    );
    await expect(page.locator('.schedule-pdf-legend').first()).toContainText(
      'X PTO',
    );
    await expect(
      page.locator('.schedule-pdf-legend').first(),
    ).not.toContainText('F FMLA');
    const fmlaPrintRow = page
      .locator('.schedule-pdf-grid tbody tr')
      .filter({ hasText: 'Penny P.' })
      .first();
    await expect(fmlaPrintRow.locator('td.schedule-pdf-pto')).toHaveCount(2);
    await expect(
      fmlaPrintRow.locator('td.schedule-pdf-pto').first(),
    ).toHaveText('X');
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

test('rolls ongoing FMLA into the next schedule and supports undo', async () => {
  test.setTimeout(60_000);
  const userDataPath = await mkdtemp(
    join(tmpdir(), 'colonder-fmla-rollover-e2e-'),
  );
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
    await seedConfirmedSchedule(page, {
      startDate: '2026-10-05',
      endDate: '2026-11-13',
      includeWorkingDays: true,
      includeOngoingFmla: true,
    });

    await page.getByRole('link', { name: 'Create Schedule' }).click();
    await continueFromStartDate(page);
    await expect(page.getByRole('heading', { name: 'FMLA' })).toBeVisible();
    await expect(
      page.getByText('1 staff member rolled over from the last schedule'),
    ).toBeVisible();
    const fmlaSwitch = page.getByRole('switch', {
      name: 'On FMLA for Ada Nurse',
    });
    await expect(fmlaSwitch).toBeChecked();
    await expect(page.getByLabel('Start date for Ada Nurse')).toHaveValue(
      'Since Oct 5',
    );
    await expect(page.getByText('Rolled over', { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator('.fmla-row-rolled')
          .evaluate((row) => getComputedStyle(row).backgroundColor),
      )
      .toBe('rgb(241, 238, 251)');

    await fmlaSwitch.locator('..').click();
    await expect(
      page.getByText('Was rolled over', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('status').filter({
        hasText: 'Ada Nurse removed from FMLA',
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(fmlaSwitch).toBeChecked();
    await expect(page.getByText('Rolled over', { exact: true })).toBeVisible();
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('creates a CSL and schedules CHARGE coverage', async () => {
  test.setTimeout(60_000);
  const userDataPath = await mkdtemp(join(tmpdir(), 'colonder-charge-e2e-'));
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
    await page.getByRole('link', { name: 'Staff' }).click();
    await page.getByRole('button', { name: 'Add staff' }).click();
    await page.getByLabel('First name').fill('Casey');
    await page.getByLabel('Last name').fill('Charge');
    await page.getByLabel('Job title').fill('Charge Nurse');
    await page.getByLabel('Role').selectOption('2');
    for (const department of ['PROC', 'PACU', 'PRE']) {
      await expect(
        page.getByRole('switch', { name: department }),
      ).toBeDisabled();
    }
    await page.getByLabel('Job title').focus();
    await page.getByLabel('Job title').blur();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.staff.list()))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            firstName: 'Casey',
            role: 2,
            departments: [],
          }),
        ]),
      );
    await page.evaluate(() =>
      window.staff.create({
        firstName: 'Jordan',
        lastName: 'Charge',
        title: 'Charge Nurse',
        role: 2,
        employment: 0,
        departments: [],
        startTime: '07:00',
        isLeader: false,
        inOrientation: false,
        ipcIds: [],
      }),
    );

    await page.getByRole('link', { name: 'Create Schedule' }).click();
    await continueFromStartDate(page);
    await expect(page.getByRole('heading', { name: 'FMLA' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByRole('heading', { name: /PTO calendar/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Review & overrides' }),
    ).toBeVisible();
    await expect(page.locator('.schedule-role-label')).toHaveCount(2);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const segments = await window.segments.list();
          const state = segments[0]?.state;
          if (!state) return null;
          const chargeIds = new Set(
            state.staffSnapshot
              .filter((person) => person.role === 2)
              .map((person) => person.id),
          );
          const worked = state.shifts.filter(
            (shift) => shift.kind === 'work' && chargeIds.has(shift.staffId),
          );
          return {
            allWorkdaysCovered: state.settingsSnapshot.workingDays
              .map((enabled, day) => ({ enabled, day }))
              .filter(({ enabled }) => enabled)
              .every(({ day }) =>
                Array.from({ length: 6 }, (_, week) => {
                  const weekDates = Array.from({ length: 5 }, (_, offset) => {
                    const date = new Date(`${state.startDate}T00:00:00.000Z`);
                    date.setUTCDate(date.getUTCDate() + week * 7 + offset);
                    return date.toISOString().slice(0, 10);
                  });
                  return weekDates.some(
                    (date) =>
                      new Date(`${date}T00:00:00.000Z`).getUTCDay() === day &&
                      worked.some((shift) => shift.date === date),
                  );
                }).every(Boolean),
              ),
            chargeWorkCounts: worked.map((shift) => shift.countsTowardTargets),
          };
        }),
      )
      .toEqual({
        allWorkdaysCovered: true,
        chargeWorkCounts: expect.arrayContaining([false]),
      });

    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toContainText(/warning/i);
    await page
      .getByRole('button', { name: 'Confirm schedule', exact: true })
      .click();
    await expect(page.locator('.schedule-role-label')).toHaveCount(2);
    await page
      .getByRole('button', { name: 'Generate weekly schedule' })
      .first()
      .click();
    await expect(page.getByRole('row', { name: /CHARGE/ })).toBeVisible();
    await expect(
      page
        .locator('.weekly-schedule-grid tbody tr')
        .filter({ hasText: 'CHARGE' })
        .locator('.weekly-assignment'),
    ).toHaveCount(8);
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('handles clean, saved, and discarded schedule drafts when leaving', async () => {
  test.setTimeout(60_000);
  const userDataPath = await mkdtemp(
    join(tmpdir(), 'colonder-draft-flow-e2e-'),
  );
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
    await continueFromStartDate(page);
    await expect(page.getByRole('heading', { name: 'FMLA' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Back to start date' }).locator('i'),
    ).toHaveClass(/bi-chevron-left/);
    await page.getByRole('link', { name: 'Staff' }).click();
    await expect(page.getByRole('heading', { name: 'Staff' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.segments.list()))
      .toEqual([]);

    await page.getByRole('link', { name: 'Create Schedule' }).click();
    await continueFromStartDate(page);
    await page.getByRole('button', { name: 'Continue' }).click();
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
    await expect(
      page.getByRole('heading', { name: 'Schedules' }),
    ).toBeVisible();
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

test('preserves PTO and off-day colors while hovering schedule details', async () => {
  const userDataPath = await mkdtemp(
    join(tmpdir(), 'colonder-detail-hover-e2e-'),
  );
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.clock.install({ time: new Date('2026-10-21T12:00:00') });
    await seedConfirmedSchedule(page, {
      startDate: '2026-10-05',
      endDate: '2026-11-15',
      shiftDates: ['2026-10-05'],
      ptoDate: '2026-10-06',
      onCallDate: '2026-10-07',
      offDate: '2026-10-08',
      includeToday: true,
    });

    await page.getByRole('link', { name: 'Schedules' }).click();
    await page.getByRole('link', { name: 'Home' }).click();
    await page
      .getByRole('button', { name: 'Open six-week schedule details' })
      .click();
    const historyGrid = page.locator('.history-details-grid');
    const ptoDetailsCell = historyGrid
      .locator('tbody span.schedule-cell-pto')
      .first();
    await historyGrid.locator('thead th[title]').nth(1).hover();
    await expect(ptoDetailsCell.locator('xpath=..')).toHaveClass(
      /history-week-hover/,
    );
    await expect(ptoDetailsCell).toHaveCSS(
      'background-color',
      'rgb(253, 228, 234)',
    );
    const offDetailsCell = historyGrid
      .locator(
        'tbody td.history-week-group-0.schedule-cell-off .schedule-cell-off',
      )
      .first();
    await expect(offDetailsCell).toBeVisible();
    await expect(offDetailsCell.locator('xpath=..')).toHaveCSS(
      'background-color',
      'rgb(244, 248, 248)',
    );
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
    await expect(
      page.getByRole('button', { name: 'Print schedule' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Home' }).click();
    await page
      .getByRole('button', { name: 'Open weekly schedule details' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Weekly schedule' }),
    ).toBeVisible();
    const weeklyConfirm = page.getByRole('button', {
      name: 'Confirm',
      exact: true,
    });
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
    const invalidDropCell = procRoomRow.locator('td').nth(sourceColumn! - 1);
    const otherDayCell = procRoomRow.locator('td').nth(sourceColumn! % 7);
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
      "Ada Nurse can't be assigned to PROC",
    );
    await expect(invalidDropContent).toHaveClass(/weekly-drop-not-allowed/);
    await expect(otherDayContent).not.toHaveAttribute('data-tooltip');
    await expect(otherDayContent).not.toHaveClass(/weekly-drop-not-allowed/);
    await expect
      .poll(() =>
        invalidDropContent.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
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
    const editor = page.getByRole('dialog', {
      name: /Start time ·.*time picker/,
    });
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
          editorBounds!.y -
            inlineInputBounds!.y -
            inlineInputBounds!.height -
            6,
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
    await editor
      .getByRole('button', { name: 'Confirm time selection' })
      .click();
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
  const userDataPath = await mkdtemp(
    join(tmpdir(), 'colonder-sunday-period-e2e-'),
  );
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
    await expect(page.getByText('Week 1 of 6', { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Today: .* nurses and .* techs\. First start/),
    ).toHaveCount(0);
    await expect(
      page.locator('[aria-label="Week 1, current week"]'),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'This week schedule' })
        .getByText('Nov 2 – Nov 6'),
    ).toBeVisible();
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('prompts users with no staff to add their first staff member', async () => {
  const userDataPath = await mkdtemp(
    join(tmpdir(), 'colonder-empty-dashboard-e2e-'),
  );
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
      page.getByText(
        'Add your staff and Colonder can start building schedules.',
      ),
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
    await expect(
      page.getByRole('heading', { name: 'Add Staff' }),
    ).toBeVisible();
    await expect(page.getByLabel('First name')).toBeVisible();
    await expect(page.getByLabel('Last name')).toBeVisible();
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('saves staff preferred working days with employment-count validation', async () => {
  const userDataPath = await mkdtemp(
    join(tmpdir(), 'colonder-staff-days-e2e-'),
  );
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('load');
    await page.getByRole('button', { name: 'Add staff' }).click();
    await page.getByLabel('First name').fill('Ada');
    await page.getByLabel('Last name').fill('Lovelace');
    await page.getByLabel('Job title').fill('RN');
    await page.getByRole('switch', { name: 'PROC' }).check({ force: true });

    await page.getByRole('button', { name: 'Mon' }).click();
    await page.getByRole('button', { name: 'Tue' }).click();
    await page.getByRole('button', { name: 'Wed' }).click();
    await expect(
      page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Thu' }).click();
    await expect(
      page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect
      .poll(() => page.evaluate(() => window.staff.list()))
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            firstName: 'Ada',
            preferredWorkingDays: [false, true, true, true, true, false, false],
          }),
        ]),
      );
  } finally {
    await app.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});

test('offers six-week generation when the next schedule is due', async () => {
  const userDataPath = await mkdtemp(
    join(tmpdir(), 'colonder-next-six-week-e2e-'),
  );
  const app = await launchApp(userDataPath);

  try {
    const page = await app.firstWindow();
    await page.clock.install({ time: new Date('2026-10-15T12:00:00') });
    await seedConfirmedSchedule(page, {
      startDate: '2026-09-12',
      endDate: '2026-10-30',
      shiftDates: ['2026-10-21'],
    });

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Up next' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create next six-week schedule' }),
    ).toBeVisible();
    await expect(page.getByText('starts in 18 days')).toBeVisible();

    await page
      .getByRole('button', { name: 'Create next six-week schedule' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Create Schedule' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Home' }).click();
    await expect(
      page.getByRole('button', { name: 'Create next six-week schedule' }),
    ).toBeVisible();
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
