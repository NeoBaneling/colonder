import { PropsWithChildren } from 'react';
import { IconButton, IconButtonProps } from '../inputs/IconButton';

type PageContentProps = {
  actions?: IconButtonProps[];
  onBack?: () => void;
  title?: string;
};

export const PageContent = ({
  title,
  actions,
  children,
  onBack,
}: PropsWithChildren<PageContentProps>) => (
  <div className="flex flex-1 flex-col gap-4 min-h-[calc(100dvh-2rem)]">
    <div className="flex flex-row justify-between">
      {title && <h2>{title}</h2>}
      <div className="flex flex-row gap-2">
        {actions?.map((action) => (
          <IconButton key={action.icon} {...action} />
        ))}
      </div>
    </div>
    {children}
    {onBack && (
      <IconButton icon="bi-chevron-left" onClick={onBack} variant="outlined" />
    )}
  </div>
);
