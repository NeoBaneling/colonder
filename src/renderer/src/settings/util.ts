import * as yup from 'yup';

export const settingsFormSchema = yup.object({
  workingDays: yup
    .array()
    .of(yup.boolean().required())
    .required()
    .test(
      'at-least-one-working-day',
      'Select at least one working day',
      (workingDays) => Boolean(workingDays?.some(Boolean)),
    ),
  targetNurses: yup
    .number()
    .typeError('Target nurses must be a positive integer')
    .integer('Target nurses must be a positive integer')
    .positive('Target nurses must be a positive integer')
    .required('Target nurses are required'),
  targetTechs: yup
    .number()
    .typeError('Target techs must be a positive integer')
    .integer('Target techs must be a positive integer')
    .positive('Target techs must be a positive integer')
    .required('Target techs are required'),
  procRooms: yup
    .number()
    .typeError('Procedure rooms must be a positive integer')
    .integer('Procedure rooms must be a positive integer')
    .positive('Procedure rooms must be a positive integer')
    .required('Procedure rooms are required'),
  deleteAfter: yup
    .number()
    .typeError('Delete after must be a non-negative integer')
    .integer('Delete after must be a non-negative integer')
    .min(0, 'Delete after must be a non-negative integer')
    .required('Delete after is required'),
  isDark: yup.boolean().required(),
});
