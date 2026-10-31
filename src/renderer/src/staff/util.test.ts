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
});
