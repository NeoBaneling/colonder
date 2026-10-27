import type { PropsWithChildren } from 'react';
import { NavLink } from 'react-router';
import Logo from '../assets/logo.svg?react';

const Navitem = ({
  icon,
  children,
  isActive,
}: PropsWithChildren<{ icon: string; isActive: boolean }>) => (
  <>
    <i
      className={`bi ${icon} text-[20px] md:font-bold ${
        isActive ? 'text-mint-600' : 'text-white group-hover:text-mint-300'
      }`}
    />
    <p
      className={`hidden md:inline font-bold text-[0.75rem] ${
        isActive ? 'text-mint-600' : 'text-white group-hover:text-mint-300'
      }`}
    >
      {children}
    </p>
  </>
);

const linkClassName = ({ isActive }: { isActive: boolean }) =>
  `group flex flex-row items-center justify-center md:justify-start min-w-11 min-h-11 gap-2.5 mx-0.5 md:py-1.5 md:px-2.5 rounded-full md:rounded-2xl ${
    isActive ? 'bg-white' : 'hover:bg-mint-100'
  }`;

export const Navbar = () => (
  <div
    data-testid="navbar"
    className="sticky flex shrink-0 flex-col gap-1 self-start bg-mint-600 w-15 md:w-48 h-fit md:h-[calc(100vh-2rem)] p-1.5 md:py-4 md:px-3 rounded-full md:rounded-3xl"
  >
    <div className="flex flex-row items-center justify-center md:justify-start gap-2.5 mx-0.5 pb-2">
      <Logo className="w-10 h-10.5" />
      <p className="hidden md:inline text-[17px] font-bold text-white">
        Colonder
      </p>
    </div>
    <nav className="flex flex-col gap-1">
      <NavLink to="/schedules" className={linkClassName}>
        {({ isActive }) => (
          <Navitem icon="bi-clock" isActive={isActive}>
            Schedules
          </Navitem>
        )}
      </NavLink>
      <NavLink to="/new" className={linkClassName}>
        {({ isActive }) => (
          <Navitem icon="bi-calendar3" isActive={isActive}>
            Create Schedule
          </Navitem>
        )}
      </NavLink>
      <NavLink to="/staff" className={linkClassName}>
        {({ isActive }) => (
          <Navitem icon="bi-person" isActive={isActive}>
            Staff
          </Navitem>
        )}
      </NavLink>
      <NavLink to="/settings" className={linkClassName}>
        {({ isActive }) => (
          <Navitem icon="bi-sliders" isActive={isActive}>
            Settings
          </Navitem>
        )}
      </NavLink>
    </nav>
  </div>
);
