import { useField } from 'formik';
import { useEffect, useRef, useState } from 'react';

type IpcFieldProps = {
  staffNames: { id: number; name: string }[];
};

export const IpcField = ({ staffNames }: IpcFieldProps) => {
  const [{ value }, , { setValue }] = useField<number[]>('ipcIds');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const toggleConflict = (id: number) => {
    setValue(
      value.includes(id)
        ? value.filter((conflictId) => conflictId !== id)
        : [...value, id],
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="ipcIds">Interpersonal conflicts (optional)</label>
      <div ref={containerRef} className="relative">
        <div className="ipc-select-control">
          {value.map((ipcId) => {
            const staffMember = staffNames.find(({ id }) => id === ipcId);
            if (!staffMember) return null;

            return (
              <span
                key={ipcId}
                className="chip error flex items-center gap-1.5 text-sm"
              >
                {staffMember.name}
                <button
                  type="button"
                  aria-label={`Remove ${staffMember.name}`}
                  className="ipc-select-remove"
                  onClick={() => toggleConflict(ipcId)}
                >
                  <i className="bi bi-x" aria-hidden="true" />
                </button>
              </span>
            );
          })}
          <button
            id="ipcIds"
            type="button"
            aria-label="Add a conflict..."
            aria-expanded={isOpen}
            aria-controls="ipcIds-options"
            className="ipc-select-trigger"
            onClick={() => setIsOpen((open) => !open)}
          >
            <span>{value.length ? ' ' : 'Add a conflict...'}</span>
            <i
              className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`}
              aria-hidden="true"
            />
          </button>
        </div>
        {isOpen && (
          <div
            id="ipcIds-options"
            role="listbox"
            aria-label="Interpersonal conflicts"
            aria-multiselectable="true"
            className="ipc-select-options"
          >
            {staffNames.map(({ id, name }) => {
              const isSelected = value.includes(id);

              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className="ipc-select-option"
                  onClick={() => toggleConflict(id)}
                >
                  <span>{name}</span>
                  {isSelected && (
                    <i className="bi bi-check2" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
