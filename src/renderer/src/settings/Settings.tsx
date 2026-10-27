import { useEffect, useState } from 'react';
import { Formik, Form, Field, FieldArray } from 'formik';
import type { Settings } from '@app/types';
import { Button } from '../inputs/Button';
import { Toggle } from '../inputs/Toggle';
import { PageContent } from '../layout/PageContent';
import { DayControl } from './DayControl';
import { TextField } from '../inputs/TextField';

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
          {({ values }) => (
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
                  <TextField
                    name="targetNurses"
                    label="Target nurses"
                    type="number"
                  />
                  <TextField
                    name="targetTechs"
                    label="Target techs"
                    type="number"
                  />
                </div>
                <div className="flex flex-row gap-6">
                  <TextField
                    name="procRooms"
                    label="Procedure rooms (PROC)"
                    type="number"
                  />
                  <TextField
                    name="deleteAfter"
                    label="Delete after (weeks)"
                    type="number"
                  />
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
