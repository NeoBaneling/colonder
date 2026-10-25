import { Outlet } from 'react-router';
import { Navbar } from './layout/Navbar';

function App(): React.JSX.Element {
  return (
    <main className='h-screen overflow-hidden p-4'>
      <div className='flex h-full flex-row gap-6'>
        <Navbar />
        <div className='min-h-0 min-w-0 flex-1 overflow-y-auto'>
          <Outlet />
        </div>
      </div>
    </main>
  );
}

export default App;
