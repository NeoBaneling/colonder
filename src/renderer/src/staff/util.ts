import * as yup from 'yup';
import { Dept, Emp, Role, Staff } from '../../../types';

export type StaffFormData = Omit<Staff, 'id' | 'departments'> & {
  id?: number;
  isProc: boolean;
  isPacu: boolean;
  isPreop: boolean;
  preferredWorkingDays: boolean[];
};

const preferredDayCount = (employment: Emp): number | undefined =>
  employment === Emp.FullTime ? 4 : employment === Emp.PartTime ? 3 : undefined;

export const staffFormSchema = yup
  .object({
    id: yup.number().integer().positive().optional(),
    firstName: yup.string().required('First name is required'),
    lastName: yup.string().required('Last name is required'),
    title: yup.string().required('Job title is required'),
    role: yup
      .number()
      .oneOf([Role.Nurse, Role.Tech, Role.ChargeNurse])
      .required(),
    employment: yup
      .number()
      .oneOf([Emp.FullTime, Emp.PartTime, Emp.PRN])
      .required(),
    isProc: yup.boolean().required(),
    isPacu: yup.boolean().required(),
    isPreop: yup.boolean().required(),
    startTime: yup
      .string()
      .matches(
        /^(?:[01]\d|2[0-3]):[0-5]\d$/,
        'Enter a valid time',
      )
      .required(),
    preferredWorkingDays: yup
      .array()
      .of(yup.boolean().required())
      .length(7)
      .required()
      .test(
        'preferred-working-day-count',
        'Select four days for full time or three days for part time, or leave none selected',
        function (days) {
          const selectedDays = days?.filter(Boolean).length ?? 0;
          const requiredDays = preferredDayCount(this.parent.employment);
          return (
            selectedDays === 0 ||
            requiredDays === undefined ||
            selectedDays === requiredDays
          );
        },
      ),
    isLeader: yup.boolean().required(),
    inOrientation: yup.boolean().required(),
    ipcIds: yup.array().of(yup.number().integer().required()).required(),
  })
  .test(
    'at-least-one-department',
    'Select at least one department',
    function (values) {
      if (values?.role === Role.ChargeNurse) {
        if (values.isProc || values.isPacu || values.isPreop) {
          return this.createError({
            path: 'isProc',
            message: 'Charge nurses cannot belong to a department',
          });
        }
        return true;
      }
      if (values?.isProc || values?.isPacu || values?.isPreop) return true;
      return this.createError({ path: 'isProc' });
    },
  )
  .test(
    'leader-not-in-orientation',
    "Orientation staff can't be leaders",
    function (values) {
      if (!values?.isLeader || !values.inOrientation) return true;
      return this.createError({ path: 'isLeader' });
    },
  );

export const staffToForm = (staff: Staff): StaffFormData => {
  const depts = staff.departments;

  return {
    ...staff,
    preferredWorkingDays:
      staff.preferredWorkingDays ?? Array.from({ length: 7 }, () => false),
    isProc: depts.includes(Dept.PROC),
    isPacu: depts.includes(Dept.PACU),
    isPreop: depts.includes(Dept.PRE),
  };
};

export const formToStaff = (form: StaffFormData): Omit<Staff, 'id'> => {
  const departments: Dept[] = [];

  if (form.isProc) departments.push(Dept.PROC);
  if (form.isPacu) departments.push(Dept.PACU);
  if (form.isPreop) departments.push(Dept.PRE);

  return {
    firstName: form.firstName,
    lastName: form.lastName,
    title: form.title,
    role: form.role,
    employment: form.employment,
    departments,
    startTime: form.startTime,
    ...(form.preferredWorkingDays.some(Boolean)
      ? { preferredWorkingDays: form.preferredWorkingDays }
      : {}),
    isLeader: form.isLeader,
    inOrientation: form.inOrientation,
    ipcIds: form.ipcIds,
  };
};
