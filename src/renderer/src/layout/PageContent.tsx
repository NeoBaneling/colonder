import { PropsWithChildren } from 'react';

type HeaderAction = {
  className?: string;
  icon: string;
  onClick: () => void;
  variant?: 'filled' | 'outline';
};

type PageContentProps = {
  headerActions?: HeaderAction[];
  onBack?: () => void;
  title?: string;
};

export const PageContent = ({
  title,
  headerActions,
  children,
  onBack,
}: PropsWithChildren<PageContentProps>) => (
  <div className='flex flex-1 flex-col gap-4 min-h-[calc(100dvh-2rem)]'>
    <div className='flex flex-row space-between'>
      {title && <h2>{title}</h2>}
      {headerActions?.map((action) => (
        <button onClick={action.onClick}>{action.icon}</button>
      ))}
    </div>
    {children}
    {onBack && (
      <button className='mt-auto self-start' onClick={onBack}>
        back
      </button>
    )}
  </div>
);
