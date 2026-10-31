import type { MouseEvent } from 'react';
import { twMerge } from 'tailwind-merge';

export type IconButtonProps = {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  icon: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  variant: 'filled' | 'outlined';
};

export const IconButton = ({
  ariaLabel,
  disabled,
  icon,
  onClick,
  title,
  variant = 'filled',
  className,
}: IconButtonProps) => (
  <button
    aria-label={ariaLabel}
    title={title}
    disabled={disabled}
    onClick={onClick}
    className={twMerge(
      'flex items-center justify-center w-10 h-10 rounded-full cursor-pointer',
      variant === 'filled'
        ? 'bg-mint-600 text-white hover:bg-mint-300 active:bg-mint-400 active:text-mint-100'
        : 'border border-mint-600 text-mint-600 hover:bg-mint-100 active:bg-mint-200',
      className,
    )}
  >
    <i className={`bi ${icon}`} />
  </button>
);
