import { app, BrowserWindow, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import {
  DEFAULT_SETTINGS,
  isSettings,
  type Settings,
  type Staff,
} from '@app/types';

let database: Database.Database;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 720,
    minHeight: 520,
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
  const userDataPath =
    process.env.COLONDER_USER_DATA ?? app.getPath('userData');
  database = new Database(join(userDataPath, 'colonder.db'));
  database.pragma('journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL
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

  ipcMain.handle(
    'staff:list',
    (): Staff[] =>
      database
        .prepare(
          'SELECT id, first_name AS firstName, last_name AS lastName FROM staff ORDER BY id DESC',
        )
        .all() as Staff[],
  );

  ipcMain.handle(
    'staff:create',
    (_event, firstName: string, lastName: string): Staff => {
      const result = database
        .prepare('INSERT INTO staff (first_name, last_name) VALUES (?, ?)')
        .run(firstName, lastName);

      return database
        .prepare(
          'SELECT id, first_name AS firstName, last_name AS lastName FROM staff WHERE id = ?',
        )
        .get(result.lastInsertRowid) as Staff;
    },
  );

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
