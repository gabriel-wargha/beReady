import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Field({
  label,
  error,
  hint,
  ...input
}: { label: string; error?: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = input.id ?? input.name;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`mt-1.5 block w-full rounded-sm border bg-paper px-3 py-2.5 text-base disabled:bg-desk disabled:text-ink-soft ${
          error ? 'border-pencil' : 'border-ink/40'
        }`}
        {...input}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-pencil">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  ...props
}: {
  children: ReactNode;
  variant?: 'primary' | 'quiet';
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles =
    variant === 'primary'
      ? 'bg-ink text-paper hover:bg-ink/85 disabled:opacity-60'
      : 'text-ink underline decoration-rule underline-offset-4 hover:decoration-ink';
  return (
    <button className={`rounded-sm px-4 py-2.5 text-sm font-semibold ${styles}`} {...props}>
      {children}
    </button>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="border-l-4 border-pencil bg-pencil/5 px-3 py-2 text-sm text-pencil"
    >
      {children}
    </div>
  );
}

export function Logo() {
  return <span className="font-serif text-xl font-bold tracking-tight">beReady</span>;
}

/** A white sheet of paper. The main surface of the app. */
export function Sheet({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-paper shadow-sheet ${className}`}>{children}</div>;
}

/** A section heading set like a resume heading: serif, with a rule above. */
export function RuledHeading({ children }: { children: ReactNode }) {
  return <h2 className="border-t border-ink pt-2 font-serif text-lg font-semibold">{children}</h2>;
}
