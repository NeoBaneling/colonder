import { PropsWithChildren } from 'react';

export type ButtonProps = {
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'submit' | 'reset' | 'button';
  variant?: 'filled' | 'outlined';
};

export const Button = ({
  disabled,
  onClick,
  variant = 'filled',
  className,
  type = undefined,
  children,
}: PropsWithChildren<ButtonProps>) => (
  <button
    disabled={disabled}
    onClick={onClick}
    type={type}
    className={`flex items-center justify-center w-wrap min-h-11 px-4 font-sans rounded-lg cursor-pointer ${variant === 'filled' ? 'bg-mint-600 text-white hover:bg-mint-300 active:bg-mint-400 active:text-mint-100' : 'border border-mint-600 text-mint-600 hover:bg-mint-100 active:bg-mint-200'} disabled:cursor-not-allowed disabled:border-grey-50 disabled:bg-grey-50 disabled:text-grey-200 disabled:hover:bg-grey-50 disabled:active:bg-grey-50 disabled:active:text-grey-200 ${className}`}
  >
    {children}
  </button>
);
