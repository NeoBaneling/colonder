import { Button } from '../inputs/Button';
import Logo from '../assets/logo.svg?react';

export const TeamWelcome = ({ onAddStaff }: { onAddStaff: () => void }) => (
  <div className="card w-full max-w-2xl items-center justify-center gap-4 py-10 text-center sm:py-14">
    <Logo aria-hidden="true" className="h-20 w-20" />
    <h2 className="text-xl! text-mint-600">Let’s meet the team</h2>
    <p className="text-sm!">
      Add your staff and Colonder can start building schedules.
    </p>
    <Button onClick={onAddStaff}>
      <i className="bi bi-plus-lg mr-2" aria-hidden="true" />
      Add staff
    </Button>
  </div>
);
