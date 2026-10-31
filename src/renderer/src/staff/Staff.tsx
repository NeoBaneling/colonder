import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Emp, Role, type Staff } from '../../../types';
import { PageContent } from '../layout/PageContent';
import { fmtDept, fmtTime } from '../util';

const StaffPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    window.staff
      .list()
      .then((staffList) => {
        if (isMounted) setStaff(staffList);
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
  }, []);

  const searchTerm = search.trim().toLocaleLowerCase();
  const filteredStaff =
    staff?.filter(({ firstName, lastName, title }) => {
      const fullName = `${firstName} ${lastName}`.toLocaleLowerCase();
      const reversedName = `${lastName}, ${firstName}`.toLocaleLowerCase();

      return (
        fullName.includes(searchTerm) ||
        reversedName.includes(searchTerm) ||
        title.toLocaleLowerCase().includes(searchTerm)
      );
    }) ?? [];

  return (
    <PageContent
      title="Staff"
      actions={[
        {
          ariaLabel: 'Add staff',
          icon: 'bi-plus-lg',
          variant: 'filled',
          onClick: () => navigate('/staff/new'),
        },
      ]}
    >
      {loadError ? (
        <p role="alert">Unable to load staff: {loadError}</p>
      ) : staff === null ? (
        <p role="status">Loading staff…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-row justify-between items-end">
            <input
              className="w-80"
              type="search"
              placeholder="Search by name or title"
              aria-label="Search staff by name or title"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <span aria-live="polite">{filteredStaff.length} shown</span>
          </div>
          {filteredStaff.length === 0 ? (
            <h2>
              {staff.length === 0
                ? 'No staff have been added.'
                : 'No staff match your search.'}
            </h2>
          ) : (
            <div className="card list-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Departments</th>
                    <th>Start</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map(
                    ({
                      id,
                      firstName,
                      lastName,
                      title,
                      departments,
                      startTime,
                      isLeader,
                      inOrientation,
                    }) => (
                      <tr
                        key={id}
                        tabIndex={0}
                        onClick={() => navigate(`/staff/${id}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            navigate(`/staff/${id}`);
                          }
                        }}
                      >
                        <td>
                          {lastName}, {firstName}
                        </td>
                        <td>{title}</td>
                        <td>
                          <div className="flex flex-row gap-1">
                            {departments.map((dept) => (
                              <span key={dept} className="chip">
                                {fmtDept(dept)}
                              </span>
                            ))}
                            {isLeader && (
                              <span className="chip warning">Leader</span>
                            )}
                            {inOrientation && (
                              <span className="chip error">Orientation</span>
                            )}
                          </div>
                        </td>
                        <td>{fmtTime(startTime)}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </PageContent>
  );
};

export default StaffPage;
