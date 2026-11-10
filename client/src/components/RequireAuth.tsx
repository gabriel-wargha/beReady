import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/** Wraps the /app pages. Logged-out visitors are sent to /login and brought back after. */
export function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <p className="p-8 text-ink-soft">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Wraps /login and /signup. Logged-in users go straight to the app. */
export function GuestOnly() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p className="p-8 text-ink-soft">Loading…</p>;
  if (user) return <Navigate to="/app" replace />;
  return <Outlet />;
}
