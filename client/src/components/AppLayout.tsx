import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, useAuthActions } from '../hooks/useAuth';
import { Button, Logo } from './ui';

const nav = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/app/facts', label: 'Fact bank' },
  { to: '/app/jobs', label: 'Jobs' },
  { to: '/app/documents', label: 'Documents' },
  { to: '/app/review', label: 'Review' },
  { to: '/app/settings', label: 'Settings' },
];

export function AppLayout() {
  const { user } = useAuth();
  const { logout } = useAuthActions();
  const navigate = useNavigate();

  return (
    <div className="mx-auto min-h-screen max-w-6xl md:grid md:grid-cols-[13rem_1fr]">
      <aside className="flex flex-col px-5 pt-6 pb-4 md:sticky md:top-0 md:h-screen md:pb-6">
        <Logo />
        <nav className="mt-4 flex flex-wrap gap-x-5 gap-y-1 md:mt-8 md:flex-col" aria-label="Main">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `py-1 text-[15px] ${isActive ? 'font-semibold' : 'text-ink-soft hover:text-ink'}`
              }
            >
              {({ isActive }) => (
                <span className={isActive ? 'marker' : undefined}>{item.label}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 flex items-center gap-3 text-sm md:mt-auto md:block">
          <p className="truncate text-ink-soft">{user?.email}</p>
          <Button
            variant="quiet"
            style={{ paddingLeft: 0 }}
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}
          >
            Log out
          </Button>
        </div>
      </aside>
      <main className="px-4 pb-16 md:px-6 md:pt-6">
        <Outlet />
      </main>
    </div>
  );
}
