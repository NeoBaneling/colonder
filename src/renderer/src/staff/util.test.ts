import { describe, expect, it } from 'vitest';
import { Emp, Role } from '../../../types';
import { staffFormSchema, type StaffFormData } from './util';

const validStaffForm: StaffFormData = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  title: 'Nurse',
  role: Role.Nurse,
  employment: Emp.FullTime,
  isProc: true,
  isPacu: false,
  isPreop: false,
  startTime: '07:00',
  preferredWorkingDays: Array.from({ length: 7 }, () => false),
  isLeader: false,
  inOrientation: false,
  ipcIds: [],
};

describe('staffFormSchema', () => {
  it('requires names, job title, and at least one department', async () => {
    const invalidStaffForm = {
      ...validStaffForm,
      firstName: '',
      lastName: '',
      title: '',
      isProc: false,
    };

    await expect(
      staffFormSchema.validate(invalidStaffForm, { abortEarly: false }),
    ).rejects.toMatchObject({
      inner: expect.arrayContaining([
        expect.objectContaining({ path: 'firstName' }),
        expect.objectContaining({ path: 'lastName' }),
        expect.objectContaining({ path: 'title' }),
        expect.objectContaining({ path: 'isProc' }),
      ]),
    });
  });

  it('rejects staff who are both leaders and in orientation', async () => {
    await expect(
      staffFormSchema.validate({
        ...validStaffForm,
        isLeader: true,
        inOrientation: true,
      }),
    ).rejects.toMatchObject({
      path: 'isLeader',
      message: "Orientation staff can't be leaders",
    });
  });

  it('accepts a valid staff form', async () => {
    await expect(staffFormSchema.validate(validStaffForm)).resolves.toEqual(
      validStaffForm,
    );
  });

  it('requires four full-time or three part-time preferred days when set', async () => {
    const fourDays = [false, true, true, true, true, false, false];
    const threeDays = [false, true, true, true, false, false, false];

    await expect(
      staffFormSchema.validate({
        ...validStaffForm,
        preferredWorkingDays: fourDays,
      }),
    ).resolves.toMatchObject({ preferredWorkingDays: fourDays });
    await expect(
      staffFormSchema.validate({
        ...validStaffForm,
        preferredWorkingDays: threeDays,
        employment: Emp.PartTime,
      }),
    ).resolves.toMatchObject({ preferredWorkingDays: threeDays });
    await expect(
      staffFormSchema.validate({
        ...validStaffForm,
        preferredWorkingDays: threeDays,
      }),
    ).rejects.toMatchObject({
      path: 'preferredWorkingDays',
    });
  });

  it('accepts charge nurses without departments', async () => {
    await expect(
      staffFormSchema.validate({
        ...validStaffForm,
        role: Role.ChargeNurse,
        isProc: false,
      }),
    ).resolves.toMatchObject({
      role: Role.ChargeNurse,
      isProc: false,
      isPacu: false,
      isPreop: false,
    });
  });

  it('rejects charge nurses assigned to a department', async () => {
    await expect(
      staffFormSchema.validate({
        ...validStaffForm,
        role: Role.ChargeNurse,
      }),
    ).rejects.toMatchObject({
      path: 'isProc',
      message: 'Charge nurses cannot belong to a department',
    });
  });

  it('accepts start times at any minute', async () => {
    await expect(
      staffFormSchema.validate({ ...validStaffForm, startTime: '07:15' }),
    ).resolves.toMatchObject({ startTime: '07:15' });
  });

  it('rejects invalid start times', async () => {
    await expect(
      staffFormSchema.validate({ ...validStaffForm, startTime: '07:60' }),
    ).rejects.toMatchObject({
      path: 'startTime',
      message: 'Enter a valid time',
    });
  });
});
