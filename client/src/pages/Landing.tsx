import { Link } from 'react-router-dom';
import { SampleResume } from '../components/SampleResume';
import { Logo } from '../components/ui';
import { useAuth } from '../hooks/useAuth';

const steps = [
  {
    title: 'Add what you have done',
    text: 'Type it in, paste an old resume, upload a PDF or Word file, or import your GitHub projects.',
  },
  {
    title: 'Confirm each fact',
    text: 'beReady asks one question at a time. True, false, or "I will learn it". Only true facts get used.',
  },
  {
    title: 'Paste a job posting',
    text: 'See which requirements you already meet, with the fact that proves each one, and where the gaps are.',
  },
  {
    title: 'Download your resume',
    text: 'One page, in the posting’s own words where they are true for you, as Word and PDF.',
  },
];

export function Landing() {
  const { user } = useAuth();
  const cta = user
    ? { to: '/app', label: 'Open your dashboard' }
    : { to: '/signup', label: 'Create your account' };

  return (
    <div className="mx-auto max-w-6xl px-5">
      <header className="flex items-center justify-between py-5">
        <Logo />
        {!user && (
          <Link
            to="/login"
            className="text-sm font-semibold underline decoration-rule underline-offset-4 hover:decoration-ink"
          >
            Log in
          </Link>
        )}
      </header>

      <main>
        <section className="grid items-center gap-10 py-10 lg:grid-cols-[1fr_30rem] lg:gap-16 lg:py-20">
          <div>
            <h1 className="max-w-xl font-serif text-[2.6rem] leading-[1.08] font-bold tracking-tight sm:text-6xl">
              Your resume, rewritten for each job. Nothing made up.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-soft">
              beReady keeps a list of the things you have really done. For every job posting, it
              picks the ones that fit and words them well. If a line can&rsquo;t be traced to
              something you confirmed, it doesn&rsquo;t go on the page.
            </p>
            <Link
              to={cta.to}
              className="mt-8 inline-block rounded-sm bg-ink px-6 py-3.5 font-semibold text-paper hover:bg-ink/85"
            >
              {cta.label}
            </Link>
          </div>
          <div className="lg:rotate-1">
            <SampleResume />
          </div>
        </section>

        <section className="max-w-3xl pb-24" aria-labelledby="how">
          <h2 id="how" className="border-t border-ink pt-2 font-serif text-xl font-semibold">
            How it works
          </h2>
          <ol className="mt-2">
            {steps.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2.5rem_1fr] border-b border-rule py-5">
                <span className="font-serif text-2xl font-bold">{i + 1}</span>
                <div>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1 max-w-xl text-ink-soft">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
