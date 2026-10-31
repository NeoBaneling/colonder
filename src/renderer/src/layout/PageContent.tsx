import { PropsWithChildren } from 'react';
import { IconButton, IconButtonProps } from '../inputs/IconButton';
import { useNavigate } from 'react-router';

type PageContentProps = {
  actions?: IconButtonProps[];
  canReturn?: boolean;
  title?: string;
};

export const PageContent = ({
  title,
  actions,
  children,
  canReturn,
}: PropsWithChildren<PageContentProps>) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-1 flex-col gap-4 min-h-[calc(100dvh-2rem)]">
      <div className="flex flex-row justify-between items-end">
        {title && <h1>{title}</h1>}
        <div className="flex flex-row gap-2">
          {actions?.map((action) => (
            <IconButton key={action.icon} {...action} />
          ))}
        </div>
      </div>
      {children}
      {canReturn && (
        <IconButton
          ariaLabel="Back"
          icon="bi-chevron-left"
          onClick={() => navigate(-1)}
          variant="outlined"
        />
      )}
    </div>
  );
};
