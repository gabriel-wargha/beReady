import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Alert, Button, Field, Logo, Sheet } from '../components/ui';
import { useAuthActions } from '../hooks/useAuth';

function AuthCard({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md px-5 py-8 sm:py-16">
      <Link to="/">
        <Logo />
      </Link>
      <Sheet className="mt-6 px-6 py-8 sm:px-9">
        <h1 className="mb-6 font-serif text-3xl font-bold tracking-tight">{title}</h1>
        {children}
      </Sheet>
      <p className="mt-5 text-sm text-ink-soft">{footer}</p>
    </div>
  );
}

/** Splits a server error into per-field messages and one general message. */
function readError(error: unknown, knownFields: string[]) {
  if (!(error instanceof ApiError))
    return { fields: {} as Record<string, string>, general: undefined };
  const fields = error.fieldErrors;
  const hasKnownField = knownFields.some((f) => fields[f]);
  return { fields, general: hasKnownField ? undefined : error.message };
}

export function Signup() {
  const { signup } = useAuthActions();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const { fields, general } = readError(signup.error, ['name', 'email', 'password']);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    signup.mutate(form, { onSuccess: () => navigate('/app') });
  }

  return (
    <AuthCard
      title="Create your account"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-ink underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {general && <Alert>{general}</Alert>}
        <Field
          label="Name"
          name="name"
          autoComplete="name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={fields.name}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={fields.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters."
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={fields.password}
        />
        <Button type="submit" disabled={signup.isPending}>
          {signup.isPending ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
}

export function Login() {
  const { login } = useAuthActions();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';
  const [form, setForm] = useState({ email: '', password: '' });
  const { fields, general } = readError(login.error, ['email', 'password']);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate(form, { onSuccess: () => navigate(from, { replace: true }) });
  }

  return (
    <AuthCard
      title="Log in"
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="font-semibold text-ink underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {general && <Alert>{general}</Alert>}
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={fields.email}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={fields.password}
        />
        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </AuthCard>
  );
}
