import { useEffect, useState } from 'react';
import { Formik, Form, FieldArray } from 'formik';
import type { Settings } from '@app/types';
import { Button } from '../inputs/Button';
import { PageContent } from '../layout/PageContent';
import { DayControl } from './DayControl';
import { TextField } from '../inputs/TextField';
import { settingsFormSchema } from './util';

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
          validationSchema={settingsFormSchema}
          validateOnBlur
          validateOnChange={false}
          validateOnMount
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
          {({
            errors,
            isSubmitting,
            isValid,
            isValidating,
            touched,
            values,
          }) => (
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
                <p
                  className="min-h-4 text-xs text-cherry-600"
                  role={
                    touched.workingDays && errors.workingDays
                      ? 'alert'
                      : undefined
                  }
                  aria-live="polite"
                >
                  {touched.workingDays && typeof errors.workingDays === 'string'
                    ? errors.workingDays
                    : ' '}
                </p>
                <div className="flex flex-row gap-6">
                  <TextField
                    name="targetNurses"
                    label="Target nurses"
                    type="number"
                    reserveErrorSpace
                  />
                  <TextField
                    name="targetTechs"
                    label="Target techs"
                    type="number"
                    reserveErrorSpace
                  />
                </div>
                <div className="flex flex-row gap-6">
                  <TextField
                    name="procRooms"
                    label="Procedure rooms (PROC)"
                    type="number"
                    reserveErrorSpace
                  />
                  <TextField
                    name="deleteAfter"
                    label="Delete after (weeks)"
                    type="number"
                    reserveErrorSpace
                  />
                </div>
                <div className="w-full flex flex-row-reverse">
                  <Button
                    type="submit"
                    variant="filled"
                    disabled={isSubmitting || isValidating || !isValid}
                  >
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
