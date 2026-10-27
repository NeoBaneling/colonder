import { useEffect, useState } from 'react';
import { Formik, Form, Field, FieldArray } from 'formik';
import type { Settings } from '@app/types';
import { Button } from '../inputs/Button';
import { Toggle } from '../inputs/Toggle';
import { PageContent } from '../layout/PageContent';
import { DayControl } from './DayControl';

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SettingsPage = () => {
  const [initialValues, setInitialValues] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    window.settings
      .get()
      .then((settings) => {
        if (isMounted) setInitialValues(settings);
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setLoadError(
            error instanceof Error ? error.message : 'Unable to load settings.',
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <PageContent title="Settings">
      {loadError ? (
        <p role="alert">Unable to load settings: {loadError}</p>
      ) : initialValues === null ? (
        <p role="status">Loading settings…</p>
      ) : (
        <Formik
          initialValues={initialValues}
          onSubmit={async (values, { resetForm, setStatus }) => {
            try {
              const savedSettings = await window.settings.save(values);
              resetForm({ values: savedSettings });
            } catch (error) {
              setStatus(
                error instanceof Error
                  ? error.message
                  : 'Unable to save settings.',
              );
            }
          }}
        >
          {({ values, status }) => (
            <Form>
              <div className="card">
                <label>Working days</label>
                <FieldArray
                  name="workingDays"
                  render={() => (
                    <div className="flex flex-row gap-2">
                      {values.workingDays.map((day, index) => (
                        <DayControl
                          key={index}
                          index={index}
                          name={days[index]}
                          value={day}
                        />
                      ))}
                    </div>
                  )}
                />
                <div className="flex flex-row gap-6">
                  <div className="flex flex-1 flex-col gap-1">
                    <label htmlFor="targetNurses">Target nurses</label>
                    <Field
                      id="targetNurses"
                      aria-label="Target nurses"
                      type="number"
                      name="targetNurses"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <label htmlFor="targetTechs">Target techs</label>
                    <Field
                      id="targetTechs"
                      aria-label="Target techs"
                      type="number"
                      name="targetTechs"
                    />
                  </div>
                </div>
                <div className="flex flex-row gap-6">
                  <div className="flex flex-1 flex-col gap-1">
                    <label htmlFor="procRooms">Procedure rooms (PROC)</label>
                    <Field
                      id="procRooms"
                      aria-label="Procedure rooms (PROC)"
                      type="number"
                      name="procRooms"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <label htmlFor="deleteAfter">Delete after (weeks)</label>
                    <Field
                      id="deleteAfter"
                      aria-label="Delete after (weeks)"
                      type="number"
                      name="deleteAfter"
                    />
                  </div>
                </div>
                <div className="flex flex-row items-center gap-3">
                  <label>Theme</label>
                  <i className="bi bi-sun" />
                  <Toggle name="isDark" label="Dark theme" />
                  <i className="bi bi-moon" />
                </div>
                <div className="w-full flex flex-row-reverse">
                  <Button type="submit" variant="filled">
                    Save
                  </Button>
                </div>
              </div>
            </Form>
          )}
        </Formik>
      )}
    </PageContent>
  );
};

export default SettingsPage;
