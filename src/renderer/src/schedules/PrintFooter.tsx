type PrintFooterProps = {
  pageNumber: number;
  totalPages: number;
};

export const PrintFooter = ({ pageNumber, totalPages }: PrintFooterProps) => (
  <div className="schedule-print-footer">
    <span>
      Generated{' '}
      {new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date())}
    </span>
    <span>Page {pageNumber} of {totalPages}</span>
  </div>
);
