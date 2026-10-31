import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../types';
import { settingsFormSchema } from './util';

describe('settingsFormSchema', () => {
  it('requires at least one working day', async () => {
    await expect(
      settingsFormSchema.validate({
        ...DEFAULT_SETTINGS,
        workingDays: Array(7).fill(false),
      }),
    ).rejects.toMatchObject({
      path: 'workingDays',
      message: 'Select at least one working day',
    });
  });

  it.each([
    ['targetNurses', 0],
    ['targetNurses', 1.5],
    ['targetTechs', -1],
    ['targetTechs', 2.5],
    ['procRooms', 0],
    ['procRooms', 1.5],
  ])('rejects invalid %s value %s', async (field, value) => {
    await expect(
      settingsFormSchema.validate({
        ...DEFAULT_SETTINGS,
        [field]: value,
      }),
    ).rejects.toMatchObject({ path: field });
  });

  it.each([-1, 1.5])('rejects invalid delete-after value %s', async (value) => {
    await expect(
      settingsFormSchema.validate({
        ...DEFAULT_SETTINGS,
        deleteAfter: value,
      }),
    ).rejects.toMatchObject({ path: 'deleteAfter' });
  });

  it('allows zero delete-after weeks and valid settings', async () => {
    await expect(
      settingsFormSchema.validate({
        ...DEFAULT_SETTINGS,
        deleteAfter: 0,
      }),
    ).resolves.toMatchObject({ ...DEFAULT_SETTINGS, deleteAfter: 0 });
  });
});
