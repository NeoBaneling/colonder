import * as yup from 'yup';
import { Dept, Emp, Role, Staff } from '../../../types';

export type StaffFormData = Omit<Staff, 'id' | 'departments'> & {
  id?: number;
  isProc: boolean;
  isPacu: boolean;
  isPreop: boolean;
};

export const staffFormSchema = yup
  .object({
    id: yup.number().integer().positive().optional(),
    firstName: yup.string().required('First name is required'),
    lastName: yup.string().required('Last name is required'),
    title: yup.string().required('Job title is required'),
    role: yup.number().oneOf([Role.Nurse, Role.Tech]).required(),
    employment: yup
      .number()
      .oneOf([Emp.FullTime, Emp.PartTime, Emp.PRN])
      .required(),
    isProc: yup.boolean().required(),
    isPacu: yup.boolean().required(),
    isPreop: yup.boolean().required(),
    startTime: yup.string().required(),
    isLeader: yup.boolean().required(),
    inOrientation: yup.boolean().required(),
    ipcIds: yup.array().of(yup.number().integer().required()).required(),
  })
  .test(
    'at-least-one-department',
    'Select at least one department',
    function (values) {
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
    isLeader: form.isLeader,
    inOrientation: form.inOrientation,
    ipcIds: form.ipcIds,
  };
};
