import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast';

const ToastTrigger = () => {
  const toast = useToast();
  return (
    <button
      onClick={() => toast.failure("Couldn't save staff", 'Database unavailable.')}
    >
      Save
    </button>
  );
};

describe('ToastProvider', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <ToastProvider>
          <ToastTrigger />
        </ToastProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('announces failures and dismisses them after five seconds', () => {
    act(() => {
      container.querySelector('button')?.click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't save staff",
    );

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
