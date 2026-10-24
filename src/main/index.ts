import { app, BrowserWindow, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import type { Staff } from '@app/types';

let database: Database.Database;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 640,
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
