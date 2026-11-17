import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { ScheduleSegment } from '../../../types';
import { IconButton } from '../inputs/IconButton';
import { Dialog } from '../layout/Dialog';
import { PageContent } from '../layout/PageContent';
import { useToast } from '../layout/Toast';

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));

const SchedulesPage = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();
  const [segments, setSegments] = useState<ScheduleSegment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scheduleToDelete, setScheduleToDelete] = useState<ScheduleSegment | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const loadSegments = useCallback(() => {
    window.segments
      .list()
      .then(setSegments)
      .catch((error: unknown) => {
        setLoadError(
          error instanceof Error ? error.message : 'Unable to load schedules.',
        );
      });
  }, []);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  useEffect(() => {
    const state = location.state;
    if (
      typeof state !== 'object' ||
      state === null ||
      !('highlightedId' in state) ||
      typeof state.highlightedId !== 'number'
    ) {
      return;
    }

    setHighlightedId(state.highlightedId);
    const timeout = window.setTimeout(() => setHighlightedId(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [location.state]);

  const deleteSchedule = async () => {
    if (!scheduleToDelete) return;
    try {
      const deleted = await window.segments.delete(scheduleToDelete.id);
      if (!deleted) throw new Error('This schedule no longer exists.');
      setSegments(
        (current) =>
          current?.filter((segment) => segment.id !== scheduleToDelete.id) ?? [],
      );
      setScheduleToDelete(null);
      setDeleteError(null);
      toast.success(
        'Schedule deleted',
        `The ${scheduleToDelete.status === 'draft' ? 'draft' : 'schedule'} was removed.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to delete schedule.';
      setDeleteError(message);
      toast.failure("Couldn't delete schedule", message);
    }
  };

  return (
    <>
      <PageContent
        title="Schedules"
        actions={[
          {
            ariaLabel: 'Create schedule',
            icon: 'bi-plus-lg',
            variant: 'filled',
            onClick: () => navigate('/new'),
          },
        ]}
      >
        {loadError ? (
          <p role="alert">Unable to load schedules: {loadError}</p>
        ) : segments === null ? (
          <p role="status">Loading schedules…</p>
        ) : segments.length === 0 ? (
          <div className="card w-full items-start">
            <h2>No schedules yet</h2>
            <p>Every great schedule starts with a first day.</p>
            <IconButton
              ariaLabel="Create schedule"
              icon="bi-plus-lg"
              variant="filled"
              onClick={() => navigate('/new')}
            />
          </div>
        ) : (
          <div className="card w-full list-table">
            <table>
              <thead>
                <tr>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th>Staff</th>
                  <th aria-label="Actions" className="w-24 min-w-24" />
                </tr>
              </thead>
              <tbody>
                {segments.map((segment) => (
                  <tr
                    key={segment.id}
                    className={
                      highlightedId === segment.id
                        ? 'recent-confirmation cursor-pointer'
                        : 'cursor-pointer'
                    }
                    onClick={() => navigate(`/schedules/${segment.id}`)}
                  >
                    <td>
                      {dateLabel(segment.startDate)} –{' '}
                      {dateLabel(segment.endDate)}
                    </td>
                    <td>
                      <span
                        className={`chip ${segment.status === 'draft' ? 'warning' : ''}`}
                      >
                        {segment.status === 'draft' ? 'Draft' : 'Confirmed'}
                      </span>
                    </td>
                    <td>{segment.state.staffSnapshot.length}</td>
                    <td className="w-24 min-w-24">
                      <div className="flex flex-wrap gap-2">
                        {segment.status === 'draft' && (
                          <IconButton
                            ariaLabel="Resume schedule draft"
                            title="Resume schedule draft"
                            icon="bi-pencil"
                            variant="outlined"
                            className="h-8! w-8! rounded-full! border-0! hover:bg-mint-600! hover:text-white!"
                            onClick={(event) => {
                              event?.stopPropagation?.();
                              navigate(`/new?draft=${segment.id}`);
                            }}
                          />
                        )}
                        <IconButton
                          ariaLabel={
                            segment.status === 'draft'
                              ? 'Delete schedule draft'
                              : 'Delete schedule'
                          }
                          title={
                            segment.status === 'draft'
                              ? 'Delete schedule draft'
                              : 'Delete schedule'
                          }
                          icon="bi-trash"
                          variant="outlined"
                          className="h-8! w-8! rounded-full! border-0! text-cherry-600! hover:bg-cherry-600! hover:text-white!"
                          onClick={(event) => {
                            event?.stopPropagation?.();
                            setDeleteError(null);
                            setScheduleToDelete(segment);
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageContent>

      <Dialog
        open={scheduleToDelete !== null}
        title={
          scheduleToDelete?.status === 'draft'
            ? 'Delete schedule draft?'
            : 'Delete schedule?'
        }
        onCancel={() => setScheduleToDelete(null)}
        onConfirm={() => void deleteSchedule()}
        confirmLabel={
          scheduleToDelete?.status === 'draft' ? 'Delete draft' : 'Delete schedule'
        }
        confirmVariant="danger"
      >
        <div className="flex flex-col gap-3">
          <p>
            This {scheduleToDelete?.status === 'draft' ? 'draft' : 'schedule'} and
            its input will be permanently removed.
          </p>
          {deleteError && (
            <p role="alert" className="text-cherry-600">
              {deleteError}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
};

export default SchedulesPage;
