import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { ScheduleSegment } from '../../../types';
import { IconButton } from '../inputs/IconButton';
import { Dialog } from '../layout/Dialog';
import { PageContent } from '../layout/PageContent';

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));

const SchedulesPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [segments, setSegments] = useState<ScheduleSegment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftToDelete, setDraftToDelete] = useState<ScheduleSegment | null>(null);
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

  const deleteDraft = async () => {
    if (!draftToDelete) return;
    try {
      const deleted = await window.segments.deleteDraft(draftToDelete.id);
      if (!deleted) throw new Error('This draft no longer exists.');
      setSegments((current) =>
        current?.filter((segment) => segment.id !== draftToDelete.id) ?? [],
      );
      setDraftToDelete(null);
      setDeleteError(null);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'Unable to delete schedule draft.',
      );
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
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {segments.map((segment) => (
                  <tr
                    key={segment.id}
                    className={highlightedId === segment.id ? 'recent-confirmation' : ''}
                  >
                    <td>
                      {dateLabel(segment.startDate)} – {dateLabel(segment.endDate)}
                    </td>
                    <td>
                      <span className={`chip ${segment.status === 'draft' ? 'warning' : ''}`}>
                        {segment.status === 'draft' ? 'Draft' : 'Confirmed'}
                      </span>
                    </td>
                    <td>{segment.state.staffSnapshot.length}</td>
                    <td>
                      {segment.status === 'draft' ? (
                        <div className="flex flex-wrap gap-2">
                          <IconButton
                            ariaLabel="Resume schedule draft"
                            title="Resume schedule draft"
                            icon="bi-pencil"
                            variant="outlined"
                            className="h-8! w-8! rounded-lg!"
                            onClick={() => navigate(`/new?draft=${segment.id}`)}
                          />
                          <IconButton
                            ariaLabel="Delete schedule draft"
                            title="Delete schedule draft"
                            icon="bi-trash"
                            variant="outlined"
                            className="h-8! w-8! rounded-lg! border-cherry-600! text-cherry-600! hover:bg-cherry-100!"
                            onClick={() => {
                              setDeleteError(null);
                              setDraftToDelete(segment);
                            }}
                          />
                        </div>
                      ) : (
                        <span className="text-grey-200">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageContent>

      <Dialog
        open={draftToDelete !== null}
        title="Delete schedule draft?"
        onCancel={() => setDraftToDelete(null)}
        onConfirm={() => void deleteDraft()}
        confirmLabel="Delete draft"
        confirmVariant="danger"
      >
        <div className="flex flex-col gap-3">
          <p>This draft and its input will be permanently removed.</p>
          {deleteError && <p role="alert" className="text-cherry-600">{deleteError}</p>}
        </div>
      </Dialog>
    </>
  );
};

export default SchedulesPage;
