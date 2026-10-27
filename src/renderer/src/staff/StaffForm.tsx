import { useEffect, useState, type ChangeEvent } from 'react';
import { Field, Form, Formik } from 'formik';
import { useNavigate, useParams } from 'react-router';
import { Emp, Role, type Staff } from '../../../types';
import { Button } from '../inputs/Button';
import { TextField } from '../inputs/TextField';
import { Toggle } from '../inputs/Toggle';
import { Dialog } from '../layout/Dialog';
import { PageContent } from '../layout/PageContent';
import { IpcField } from './IpcField';
import { formToStaff, staffToForm, type StaffFormData } from './util';

const emptyStaff: StaffFormData = {
  firstName: '',
  lastName: '',
  title: '',
  role: Role.Nurse,
  employment: Emp.FullTime,
  isProc: false,
  isPacu: false,
  isPreop: false,
  startTime: '07:00',
  isLeader: false,
  inOrientation: false,
  ipcIds: [],
};

export const StaffForm = () => {
  const { staffId } = useParams();
  const navigate = useNavigate();
  const isNew = staffId === 'new';
  const [staff, setStaff] = useState<Staff | null>(null);
  const [staffList, setStaffList] = useState<Staff[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDelModal, setShowDelModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const id = Number(staffId);
    setLoadError(null);
    setStaff(null);
    setStaffList(null);

    if (!isNew && (!Number.isSafeInteger(id) || id < 1)) {
      setLoadError('Invalid staff ID.');
      return () => {
        isMounted = false;
      };
    }

    Promise.all([
      window.staff.list(),
      isNew ? Promise.resolve(null) : window.staff.get(id),
    ])
      .then(([staffMembers, staffMember]) => {
        if (!isMounted) return;
        setStaffList(staffMembers);
        setStaff(staffMember);
        if (!isNew && !staffMember) {
          setLoadError('This staff member could not be found.');
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setLoadError(
            error instanceof Error ? error.message : 'Unable to load staff.',
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isNew, staffId]);

  const staffNames =
    staffList
      ?.filter((member) => member.id !== staff?.id)
      .map((member) => ({
        id: member.id,
        name: `${member.firstName} ${member.lastName}`,
      })) ?? [];
  const initialValues = staff ? staffToForm(staff) : emptyStaff;

  const handleDelete = async () => {
    if (!staff) return;

    try {
      const deleted = await window.staff.delete(staff.id);
      if (!deleted) throw new Error('This staff member no longer exists.');
      navigate('/staff', { replace: true });
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'Unable to delete staff.',
      );
    }
  };

  return (
    <>
      <PageContent
        title={
          staff
            ? `${staff.firstName} ${staff.lastName}`
            : isNew
              ? 'Add Staff'
              : 'Edit Staff'
        }
        actions={
          staff
            ? [
                {
                  ariaLabel: 'Delete staff',
                  icon: 'bi-trash',
                  onClick: () => {
                    setDeleteError(null);
                    setShowDelModal(true);
                  },
                  variant: 'outlined',
                  className:
                    'bg-white border-cherry-600 text-cherry-600 hover:bg-cherry-100 active:bg-cherry-600 active:text-cherry-100',
                },
              ]
            : []
        }
        canReturn
      >
        {loadError ? (
          <p role="alert">Unable to load staff: {loadError}</p>
        ) : staffList === null || (!isNew && !staff) ? (
          <p role="status">Loading staff…</p>
        ) : (
          <Formik
            initialValues={initialValues}
            onSubmit={async (values, { setStatus }) => {
              try {
                if (staff) {
                  await window.staff.update(staff.id, formToStaff(values));
                } else {
                  await window.staff.create(formToStaff(values));
                }
                navigate('/staff');
              } catch (error) {
                setStatus(
                  error instanceof Error
                    ? error.message
                    : 'Unable to save staff.',
                );
              }
            }}
          >
            {({ isSubmitting, setFieldValue, status }) => (
              <Form>
                <div className="card w-3/4 gap-3.5">
                  <div className="flex flex-row space-between gap-6">
                    <TextField name="firstName" label="First name" />
                    <TextField name="lastName" label="Last name" />
                  </div>
                  <div className="flex flex-row space-between gap-6">
                    <TextField name="title" label="Job title" />
                    <TextField
                      name="startTime"
                      label="Preferred start time"
                      type="time"
                    />
                  </div>
                  <div className="flex flex-row space-between gap-6">
                    <div className="flex flex-1 flex-col gap-2">
                      <label htmlFor="role">Role</label>
                      <Field
                        as="select"
                        id="role"
                        aria-label="Role"
                        name="role"
                        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                          void setFieldValue(
                            'role',
                            Number(event.currentTarget.value),
                          );
                        }}
                      >
                        <option value={Role.Nurse}>Nurse</option>
                        <option value={Role.Tech}>Tech</option>
                      </Field>
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                      <label htmlFor="employment">Employment</label>
                      <Field
                        as="select"
                        id="employment"
                        aria-label="Employment"
                        name="employment"
                        onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                          void setFieldValue(
                            'employment',
                            Number(event.currentTarget.value),
                          );
                        }}
                      >
                        <option value={Emp.FullTime}>Full time</option>
                        <option value={Emp.PartTime}>Part time</option>
                        <option value={Emp.PRN}>PRN</option>
                      </Field>
                    </div>
                  </div>
                  <div className="flex flex-row space-between gap-6">
                    <div className="flex flex-1 flex-col gap-2">
                      <label>Departments trained</label>
                      <div className="flex flex-row gap-2">
                        <Toggle name="isProc" label="PROC" />
                        <label>PROC</label>
                      </div>
                      <div className="flex flex-row gap-2">
                        <Toggle name="isPacu" label="PACU" />
                        <label>PACU</label>
                      </div>
                      <div className="flex flex-row gap-2">
                        <Toggle name="isPreop" label="PRE" />
                        <label>PRE</label>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                      <label>Staff settings</label>
                      <div className="flex flex-row gap-2">
                        <Toggle name="isLeader" label="Leader" />
                        <label>Leader</label>
                      </div>
                      <div className="flex flex-row gap-2">
                        <Toggle name="inOrientation" label="In orientation" />
                        <label>In orientation</label>
                      </div>
                    </div>
                  </div>
                  <IpcField staffNames={staffNames} />
                  {typeof status === 'string' && (
                    <p role="alert">Unable to save staff: {status}</p>
                  )}
                  <div className="flex flex-row justify-end">
                    <Button type="submit" disabled={isSubmitting}>
                      Save
                    </Button>
                  </div>
                </div>
              </Form>
            )}
          </Formik>
        )}
      </PageContent>
      <Dialog
        open={showDelModal}
        title={staff ? `Delete ${staff.firstName} ${staff.lastName}?` : ''}
        onCancel={() => setShowDelModal(false)}
        onConfirm={handleDelete}
        confirmLabel="Delete staff"
      >
        <div className="flex flex-col gap-3">
          <p>{`This removes ${staff?.firstName} from the staff list and from future schedules. Their ${staff?.ipcIds.length ?? 0} interpersonal conflicts will be cleared too. Existing schedules in History stay as they are.`}</p>
          <p className="font-semibold">This can't be undone.</p>
          {deleteError && (
            <p role="alert">Unable to delete staff: {deleteError}</p>
          )}
        </div>
      </Dialog>
    </>
  );
};

export default StaffForm;
