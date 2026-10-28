import { app, BrowserWindow, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import {
  Dept,
  DEFAULT_SETTINGS,
  Emp,
  isSettings,
  Role,
  type ScheduleSegment,
  type SegmentState,
  type Settings,
  type Staff,
} from '@app/types';

let database: Database.Database;

type StaffRow = {
  id: number;
  firstName: string;
  lastName: string;
  title: string;
  role: number;
  employment: number;
  departments: string;
  startTime: string;
  isLeader: number;
  inOrientation: number;
};

type SegmentRow = {
  id: number;
  startDate: string;
  endDate: string;
  status: 'draft' | 'confirmed';
  createdAt: string;
  state: string;
};

const isISODate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
  new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

const isDepartment = (value: unknown): value is Dept =>
  value === Dept.PACU || value === Dept.PROC || value === Dept.PRE;

const isDepartments = (value: unknown): value is Dept[] =>
  Array.isArray(value) && value.every(isDepartment);

function assertValidStaff(
  value: unknown,
): asserts value is Omit<Staff, 'id'> {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Invalid staff record.');
  }

  const staff = value as Record<string, unknown>;
  const timeIsValid =
    typeof staff.startTime === 'string' &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(staff.startTime);

  if (
    typeof staff.firstName !== 'string' ||
    staff.firstName.trim().length === 0 ||
    typeof staff.lastName !== 'string' ||
    staff.lastName.trim().length === 0 ||
    typeof staff.title !== 'string' ||
    (staff.role !== Role.Nurse && staff.role !== Role.Tech) ||
    (staff.employment !== Emp.FullTime &&
      staff.employment !== Emp.PartTime &&
      staff.employment !== Emp.PRN) ||
    !isDepartments(staff.departments) ||
    new Set(staff.departments).size !== staff.departments.length ||
    !timeIsValid ||
    typeof staff.isLeader !== 'boolean' ||
    typeof staff.inOrientation !== 'boolean' ||
    !Array.isArray(staff.ipcIds) ||
    !staff.ipcIds.every((id) => Number.isSafeInteger(id) && id > 0) ||
    new Set(staff.ipcIds).size !== staff.ipcIds.length
  ) {
    throw new TypeError('Invalid staff record.');
  }
}

const listStaff = (): Staff[] => {
  const rows = database
    .prepare(
      `SELECT id, first_name AS firstName, last_name AS lastName, title,
              role, employment, departments, start_time AS startTime,
              is_leader AS isLeader, in_orientation AS inOrientation
       FROM staff ORDER BY id DESC`,
    )
    .all() as StaffRow[];
  const conflicts = database
    .prepare(
      'SELECT staff_id AS staffId, conflict_id AS conflictId FROM staff_ipc',
    )
    .all() as { staffId: number; conflictId: number }[];
  const conflictsByStaffId = new Map<number, number[]>();

  for (const { staffId, conflictId } of conflicts) {
    const ids = conflictsByStaffId.get(staffId) ?? [];
    ids.push(conflictId);
    conflictsByStaffId.set(staffId, ids);
  }

  return rows.map((row) => {
    const departments: unknown = JSON.parse(row.departments);
    if (!isDepartments(departments)) {
      throw new Error(`Stored departments are invalid for staff ${row.id}.`);
    }

    return {
      ...row,
      role: row.role as Role,
      employment: row.employment as Emp,
      departments,
      isLeader: Boolean(row.isLeader),
      inOrientation: Boolean(row.inOrientation),
      ipcIds: conflictsByStaffId.get(row.id) ?? [],
    };
  });
};

const getStaff = (id: number): Staff | null =>
  listStaff().find((staff) => staff.id === id) ?? null;

function assertValidSegmentState(value: unknown): asserts value is SegmentState {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Invalid schedule draft.');
  }
  const state = value as Record<string, unknown>;
  if (
    !['pto', 'prn', 'review'].includes(String(state.step)) ||
    !isISODate(state.startDate) ||
    !isISODate(state.endDate) ||
    !Array.isArray(state.ptoDates) ||
    !state.ptoDates.every((key) => typeof key === 'string') ||
    !Array.isArray(state.prnDates) ||
    !state.prnDates.every((key) => typeof key === 'string') ||
    !Array.isArray(state.onCall) ||
    !state.onCall.every((key) => typeof key === 'string') ||
    !Array.isArray(state.shifts) ||
    !state.shifts.every(
      (shift) =>
        typeof shift === 'object' &&
        shift !== null &&
        Number.isSafeInteger((shift as Record<string, unknown>).staffId) &&
        isISODate((shift as Record<string, unknown>).date) &&
        ['work', 'pto'].includes(
          String((shift as Record<string, unknown>).kind),
        ) &&
        typeof (shift as Record<string, unknown>).countsTowardTargets ===
          'boolean',
    ) ||
    !Array.isArray(state.staffSnapshot) ||
    !state.staffSnapshot.every(
      (staffer) =>
        typeof staffer === 'object' &&
        staffer !== null &&
        Number.isSafeInteger((staffer as Record<string, unknown>).id) &&
        Number((staffer as Record<string, unknown>).id) > 0,
    ) ||
    !isSettings(state.settingsSnapshot) ||
    !Number.isSafeInteger(state.seed) ||
    typeof state.hasManualEdits !== 'boolean'
  ) {
    throw new TypeError('Invalid schedule draft.');
  }

  for (const staffer of state.staffSnapshot as Staff[]) {
    assertValidStaff(staffer);
  }
}

const mapSegmentRow = (row: SegmentRow): ScheduleSegment => {
  const state: unknown = JSON.parse(row.state);
  assertValidSegmentState(state);
  return {
    id: row.id,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    createdAt: row.createdAt,
    state,
  };
};

const listSegments = (): ScheduleSegment[] =>
  (database
    .prepare(
      `SELECT id, start_date AS startDate, end_date AS endDate, status,
              created_at AS createdAt, state
       FROM schedule_segment ORDER BY created_at DESC, id DESC`,
    )
    .all() as SegmentRow[]).map(mapSegmentRow);

const saveStaff = (staff: Omit<Staff, 'id'>, id?: number): Staff => {
  assertValidStaff(staff);

  const save = database.transaction(() => {
    let staffId = id;
    if (staffId === undefined) {
      const result = database
        .prepare(
          `INSERT INTO staff
            (first_name, last_name, title, role, employment, departments,
             start_time, is_leader, in_orientation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          staff.firstName.trim(),
          staff.lastName.trim(),
          staff.title.trim(),
          staff.role,
          staff.employment,
          JSON.stringify(staff.departments),
          staff.startTime,
          Number(staff.isLeader),
          Number(staff.inOrientation),
        );
      staffId = Number(result.lastInsertRowid);
    } else {
      const exists = database
        .prepare('SELECT 1 FROM staff WHERE id = ?')
        .get(staffId);
      if (!exists) throw new Error(`Staff member ${staffId} does not exist.`);

      database
        .prepare(
          `UPDATE staff
           SET first_name = ?, last_name = ?, title = ?, role = ?,
               employment = ?, departments = ?, start_time = ?,
               is_leader = ?, in_orientation = ?
           WHERE id = ?`,
        )
        .run(
          staff.firstName.trim(),
          staff.lastName.trim(),
          staff.title.trim(),
          staff.role,
          staff.employment,
          JSON.stringify(staff.departments),
          staff.startTime,
          Number(staff.isLeader),
          Number(staff.inOrientation),
          staffId,
        );
    }

    database
      .prepare('DELETE FROM staff_ipc WHERE staff_id = ? OR conflict_id = ?')
      .run(staffId, staffId);
    const addConflict = database.prepare(
      'INSERT INTO staff_ipc (staff_id, conflict_id) VALUES (?, ?)',
    );
    for (const conflictId of staff.ipcIds) {
      if (conflictId === staffId) {
        throw new TypeError('A staff member cannot have a conflict with themself.');
      }
      addConflict.run(staffId, conflictId);
      addConflict.run(conflictId, staffId);
    }

    return staffId;
  });

  const savedId = save();
  const savedStaff = getStaff(savedId);
  if (!savedStaff) throw new Error('Unable to load the saved staff member.');
  return savedStaff;
};

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 640,
    minHeight: 520,
    show: process.env.COLONDER_E2E_HEADLESS !== '1',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  if (
    process.env.COLONDER_E2E_HEADLESS === '1' &&
    process.platform === 'darwin'
  ) {
    app.dock?.hide();
  }

  const userDataPath =
    process.env.COLONDER_USER_DATA ?? app.getPath('userData');
  database = new Database(join(userDataPath, 'colonder.db'));
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      role INTEGER NOT NULL DEFAULT 0,
      employment INTEGER NOT NULL DEFAULT 0,
      departments TEXT NOT NULL DEFAULT '[]',
      start_time TEXT NOT NULL DEFAULT '07:00',
      is_leader INTEGER NOT NULL DEFAULT 0,
      in_orientation INTEGER NOT NULL DEFAULT 0
    )
  `);
  const staffColumns = new Set(
    (database.pragma('table_info(staff)') as { name: string }[]).map(
      ({ name }) => name,
    ),
  );
  const staffMigrations = [
    ['title', "TEXT NOT NULL DEFAULT ''"],
    ['role', 'INTEGER NOT NULL DEFAULT 0'],
    ['employment', 'INTEGER NOT NULL DEFAULT 0'],
    ['departments', "TEXT NOT NULL DEFAULT '[]'"],
    ['start_time', "TEXT NOT NULL DEFAULT '07:00'"],
    ['is_leader', 'INTEGER NOT NULL DEFAULT 0'],
    ['in_orientation', 'INTEGER NOT NULL DEFAULT 0'],
  ] as const;
  for (const [column, definition] of staffMigrations) {
    if (!staffColumns.has(column)) {
      database.exec(`ALTER TABLE staff ADD COLUMN ${column} ${definition}`);
    }
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS staff_ipc (
      staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      conflict_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      PRIMARY KEY (staff_id, conflict_id),
      CHECK (staff_id <> conflict_id)
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      working_days TEXT NOT NULL,
      target_nurses INTEGER NOT NULL,
      target_techs INTEGER NOT NULL,
      proc_rooms INTEGER NOT NULL,
      delete_after INTEGER NOT NULL,
      is_dark INTEGER NOT NULL CHECK (is_dark IN (0, 1))
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS schedule_segment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'confirmed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      state TEXT NOT NULL
    )
  `);
  database
    .prepare(
      `INSERT OR IGNORE INTO settings
        (id, working_days, target_nurses, target_techs, proc_rooms, delete_after, is_dark)
       VALUES (1, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      JSON.stringify(DEFAULT_SETTINGS.workingDays),
      DEFAULT_SETTINGS.targetNurses,
      DEFAULT_SETTINGS.targetTechs,
      DEFAULT_SETTINGS.procRooms,
      DEFAULT_SETTINGS.deleteAfter,
      Number(DEFAULT_SETTINGS.isDark),
    );

  ipcMain.handle('staff:list', (): Staff[] => listStaff());
  ipcMain.handle('staff:get', (_event, id: number): Staff | null => {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new TypeError('Invalid staff ID.');
    }
    return getStaff(id);
  });
  ipcMain.handle('staff:create', (_event, staff: unknown): Staff => {
    assertValidStaff(staff);
    return saveStaff(staff);
  });
  ipcMain.handle(
    'staff:update',
    (_event, id: number, staff: unknown): Staff => {
      if (!Number.isSafeInteger(id) || id < 1) {
        throw new TypeError('Invalid staff ID.');
      }
      assertValidStaff(staff);
      return saveStaff(staff, id);
    },
  );
  ipcMain.handle('staff:delete', (_event, id: number): boolean => {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new TypeError('Invalid staff ID.');
    }
    return database.prepare('DELETE FROM staff WHERE id = ?').run(id).changes > 0;
  });

  ipcMain.handle('settings:get', (): Settings => {
    const row = database
      .prepare(
        `SELECT working_days AS workingDays,
                target_nurses AS targetNurses,
                target_techs AS targetTechs,
                proc_rooms AS procRooms,
                delete_after AS deleteAfter,
                is_dark AS isDark
         FROM settings WHERE id = 1`,
      )
      .get() as Omit<Settings, 'workingDays' | 'isDark'> & {
      workingDays: string;
      isDark: number;
    };
    const settings: Settings = {
      ...row,
      workingDays: JSON.parse(row.workingDays) as boolean[],
      isDark: Boolean(row.isDark),
    };

    if (!isSettings(settings)) {
      throw new Error('Stored settings are invalid.');
    }

    return settings;
  });

  ipcMain.handle('settings:save', (_event, settings: unknown): Settings => {
    if (!isSettings(settings)) {
      throw new TypeError('Invalid settings.');
    }

    database
      .prepare(
        `UPDATE settings
         SET working_days = ?, target_nurses = ?, target_techs = ?,
             proc_rooms = ?, delete_after = ?, is_dark = ?
         WHERE id = 1`,
      )
      .run(
        JSON.stringify(settings.workingDays),
        settings.targetNurses,
        settings.targetTechs,
        settings.procRooms,
        settings.deleteAfter,
        Number(settings.isDark),
      );

    return settings;
  });

  ipcMain.handle('segments:list', (): ScheduleSegment[] => listSegments());
  ipcMain.handle(
    'segments:create',
    (_event, state: unknown): ScheduleSegment => {
      assertValidSegmentState(state);
      const result = database
        .prepare(
          `INSERT INTO schedule_segment (start_date, end_date, status, state)
           VALUES (?, ?, 'draft', ?)`,
        )
        .run(state.startDate, state.endDate, JSON.stringify(state));
      const saved = listSegments().find(
        ({ id }) => id === Number(result.lastInsertRowid),
      );
      if (!saved) throw new Error('Unable to load the new schedule draft.');
      return saved;
    },
  );
  ipcMain.handle(
    'segments:save-draft',
    (_event, id: number, state: unknown): ScheduleSegment => {
      if (!Number.isSafeInteger(id) || id < 1) {
        throw new TypeError('Invalid schedule ID.');
      }
      assertValidSegmentState(state);
      const result = database
        .prepare(
          `UPDATE schedule_segment
           SET start_date = ?, end_date = ?, state = ?
           WHERE id = ? AND status = 'draft'`,
        )
        .run(state.startDate, state.endDate, JSON.stringify(state), id);
      if (result.changes === 0) {
        throw new Error('This draft no longer exists or is already confirmed.');
      }
      const saved = listSegments().find((segment) => segment.id === id);
      if (!saved) throw new Error('Unable to load the saved schedule draft.');
      return saved;
    },
  );
  ipcMain.handle(
    'segments:confirm',
    (_event, id: number, state: unknown): ScheduleSegment => {
      if (!Number.isSafeInteger(id) || id < 1) {
        throw new TypeError('Invalid schedule ID.');
      }
      assertValidSegmentState(state);
      const confirmSegment = database.transaction(() => {
        const overlap = database
          .prepare(
            `SELECT id FROM schedule_segment
             WHERE status = 'confirmed' AND id <> ?
               AND start_date <= ? AND end_date >= ?`,
          )
          .get(id, state.endDate, state.startDate);
        if (overlap) {
          throw new Error(
            'This date range overlaps an existing confirmed schedule.',
          );
        }
        const result = database
          .prepare(
            `UPDATE schedule_segment
             SET start_date = ?, end_date = ?, status = 'confirmed', state = ?
             WHERE id = ? AND status = 'draft'`,
          )
          .run(state.startDate, state.endDate, JSON.stringify(state), id);
        if (result.changes === 0) {
          throw new Error(
            'This draft no longer exists or is already confirmed.',
          );
        }
      });
      confirmSegment();
      const saved = listSegments().find((segment) => segment.id === id);
      if (!saved) throw new Error('Unable to load the confirmed schedule.');
      return saved;
    },
  );
  ipcMain.handle('segments:delete-draft', (_event, id: number): boolean => {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new TypeError('Invalid schedule ID.');
    }
    return (
      database
        .prepare(
          `DELETE FROM schedule_segment WHERE id = ? AND status = 'draft'`,
        )
        .run(id).changes > 0
    );
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  database?.close();
});
