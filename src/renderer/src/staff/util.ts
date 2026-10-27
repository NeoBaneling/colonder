import { Dept, Staff } from '../../../types';

export type StaffFormData = Omit<Staff, 'id' | 'departments'> & {
  id?: number;
  isProc: boolean;
  isPacu: boolean;
  isPreop: boolean;
};

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
