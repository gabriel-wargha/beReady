import { useQuery } from '@tanstack/react-query';
import type { List, Fact, Usage } from '@beready/shared';
import { api } from '../api/client';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Alert, Button, Field, RuledHeading, Sheet } from '../components/ui';
import { useAuth, useAuthActions } from '../hooks/useAuth';

/** The path from a new account to a finished resume. The fact bank is ready; job matching and documents follow. */
const path = [
  { title: 'Create your account', text: 'Done. Your data is private to this account.', done: true },
  {
    title: 'Fill your fact bank',
    text: 'Add jobs, projects and skills, then confirm each fact.',
    to: '/app/facts',
    phase: 2,
  },
  {
    title: 'Add a job posting',
    text: 'Get a match score, the evidence behind it, and your gaps.',
    to: '/app/jobs',
    phase: 3,
  },
  {
    title: 'Generate a resume and cover letter',
    text: 'One page, tailored to the posting, as Word and PDF.',
    to: '/app/documents',
    phase: 4,
  },
];

export function Dashboard() {
  const { user } = useAuth();
  const waiting = useQuery({queryKey: ['bank','waiting'], queryFn: () => api<List<Fact>>('GET','/facts?status=needs_confirmation&limit=1')});
  return (
    <Sheet className="px-6 py-8 sm:px-10 sm:py-10">
      <h1 className="font-serif text-4xl font-bold tracking-tight">Welcome, {user?.name}</h1>
      <p className="mt-2 max-w-xl text-ink-soft">
        beReady is being built in stages. Here is the path to your first resume and how far the app
        can take you today.
      </p>

      <p className="mt-5"><Link className="font-semibold underline" to="/app/confirm">{waiting.data?.page.total ?? '…'} facts waiting for confirmation</Link></p>
      <div className="mt-8 max-w-2xl">
        <RuledHeading>Your path</RuledHeading>
        <ol>
          {path.map((step, i) => (
            <li
              key={step.title}
              className="grid grid-cols-[2.25rem_1fr_auto] items-baseline gap-x-2 border-b border-rule py-4"
            >
              <span className="font-serif text-xl font-bold">{i + 1}</span>
              <div>
                <p className="font-semibold">
                  {step.to ? (
                    <Link
                      to={step.to}
                      className="underline decoration-rule underline-offset-4 hover:decoration-ink"
                    >
                      {step.title}
                    </Link>
                  ) : (
                    step.title
                  )}
                </p>
                <p className="mt-0.5 text-ink-soft">{step.text}</p>
              </div>
              {step.phase === 2 ? <span className="text-sm text-confirmed">Ready</span> : step.done ? (
                <span className="text-sm font-semibold text-confirmed">Done</span>
              ) : (
                <span className="text-sm text-ink-soft">Not built yet</span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </Sheet>
  );
}

export function ComingSoon({ title, text }: { title: string; phase: number; text: string }) {
  return (
    <Sheet className="px-6 py-8 sm:px-10 sm:py-10">
      <h1 className="font-serif text-4xl font-bold tracking-tight">{title}</h1>
      <p className="mt-3 max-w-xl text-lg text-ink-soft">{text}</p>
      <p className="mt-6 max-w-xl border-l-4 border-marker pl-3">
        This part isn&rsquo;t built yet. Your account is ready for it when it arrives.
      </p>
    </Sheet>
  );
}

export function Settings() {
  const { user } = useAuth();
  const { updateMe } = useAuthActions();
  const usage = useQuery({queryKey: ['bank','usage'], queryFn: () => api<Usage>('GET','/me/usage')});
  const [name, setName] = useState(user?.name ?? '');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [saved, setSaved] = useState<'name' | 'password' | null>(null);
  const [which, setWhich] = useState<'name' | 'password' | null>(null);
  const fields = updateMe.error instanceof ApiError ? updateMe.error.fieldErrors : {};
  const general =
    updateMe.error && Object.keys(fields).length === 0
      ? (updateMe.error as Error).message
      : undefined;

  function saveName(e: FormEvent) {
    e.preventDefault();
    setSaved(null);
    setWhich('name');
    updateMe.mutate({ name }, { onSuccess: () => setSaved('name') });
  }
  function savePassword(e: FormEvent) {
    e.preventDefault();
    setSaved(null);
    setWhich('password');
    updateMe.mutate(passwords, {
      onSuccess: () => {
        setSaved('password');
        setPasswords({ currentPassword: '', newPassword: '' });
      },
    });
  }

  return (
    <Sheet className="px-6 py-8 sm:px-10 sm:py-10">
      <h1 className="font-serif text-4xl font-bold tracking-tight">Settings</h1>
      {usage.data && <p className="mt-4">{usage.data.aiActionsToday} of {usage.data.aiDailyLimit} AI actions used today. Resets at {new Date(usage.data.resetsAt).toLocaleTimeString()}.</p>}
      <div className="mt-8 max-w-md space-y-10">
        {general && <Alert>{general}</Alert>}

        <form onSubmit={saveName} className="space-y-5" noValidate>
          <RuledHeading>Profile</RuledHeading>
          <Field label="Email" name="email" value={user?.email ?? ''} disabled readOnly />
          <Field
            label="Name"
            name="name"
            hint="This is the name printed at the top of your resume."
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={which === 'name' ? fields.name : undefined}
          />
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={updateMe.isPending}>
              Save name
            </Button>
            {saved === 'name' && (
              <span className="text-sm font-semibold text-confirmed">Saved</span>
            )}
          </div>
        </form>

        <form onSubmit={savePassword} className="space-y-5" noValidate>
          <RuledHeading>Password</RuledHeading>
          <Field
            label="Current password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            value={passwords.currentPassword}
            onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
            error={which === 'password' ? fields.currentPassword : undefined}
          />
          <Field
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            hint="At least 10 characters. Your other devices will be logged out."
            value={passwords.newPassword}
            onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
            error={which === 'password' ? fields.newPassword : undefined}
          />
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={updateMe.isPending}>
              Change password
            </Button>
            {saved === 'password' && (
              <span className="text-sm font-semibold text-confirmed">Password changed</span>
            )}
          </div>
        </form>
      </div>
    </Sheet>
  );
}

export function NotFound() {
  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="font-serif text-4xl font-bold">This page doesn&rsquo;t exist</h1>
      <Link to="/" className="mt-4 inline-block font-semibold underline underline-offset-4">
        Go to the start page
      </Link>
    </div>
  );
}
