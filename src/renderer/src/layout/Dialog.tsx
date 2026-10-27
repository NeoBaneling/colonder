import { PropsWithChildren, ReactNode, useEffect, useId } from 'react';
import { Button } from '../inputs/Button';

type DialogProps = {
  open?: boolean;
  onCancel?: () => void;
  onConfirm?: () => void;
  title?: ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
};

export const Dialog = ({
  open = false,
  onCancel,
  onConfirm,
  title,
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  children,
}: PropsWithChildren<DialogProps>) => {
  const titleId = useId();

  useEffect(() => {
    if (!open || !onCancel) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-grey-900/60 p-4 sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel?.();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className="flex w-full max-w-3xl flex-col gap-6 rounded-4xl bg-white p-6 shadow-xl sm:gap-8 sm:p-10"
      >
        {title && (
          <h1 id={titleId} className="font-header text-2xl sm:text-[2rem]">
            {title}
          </h1>
        )}
        <div className="font-body text-base leading-relaxed text-grey-900 sm:text-xl">
          {children}
        </div>
        {(onCancel || onConfirm) && (
          <div className="flex flex-wrap justify-end gap-3 sm:gap-5">
            {onCancel && (
              <Button
                type="button"
                variant="outlined"
                onClick={onCancel}
                className="min-h-12 px-6 text-lg font-bold"
              >
                {cancelLabel}
              </Button>
            )}
            {onConfirm && (
              <Button
                type="button"
                onClick={onConfirm}
                className="min-h-12 rounded-xl bg-orange px-6 text-lg font-bold text-white hover:bg-cherry-600!"
              >
                {confirmLabel}
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
