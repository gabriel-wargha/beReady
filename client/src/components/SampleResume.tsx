/**
 * The picture on the landing page: a slice of a resume being checked.
 * Words that match the job posting are highlighted, confirmed lines are ticked,
 * and one claim that is not in the fact bank is struck out.
 * The person is fictional.
 */
function Tick() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="mt-1 h-4 w-4 shrink-0 text-confirmed"
      aria-label="Confirmed"
    >
      <path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function SampleResume() {
  return (
    <figure className="bg-paper px-6 py-7 font-serif shadow-sheet sm:px-9 sm:py-9">
      <figcaption className="sr-only">
        A sample resume where each line is checked against confirmed facts
      </figcaption>
      <p className="text-center text-2xl font-bold">Alex Rivera</p>
      <p className="mt-1 text-center text-sm text-ink-soft">
        Rexburg, Idaho | alex.rivera@example.com
      </p>

      <p className="mt-6 border-t border-ink pt-1.5 text-[15px] font-semibold">Experience</p>
      <div className="mt-2 flex items-baseline justify-between gap-4 text-[15px]">
        <span className="font-bold">Faculty Support Assistant</span>
        <span className="shrink-0 font-bold">Mar 2025 to Dec 2025</span>
      </div>
      <p className="text-[15px] italic">Campus Technology Center, Rexburg, ID</p>

      <ul className="mt-3 space-y-2 text-[15px] leading-snug">
        <li className="flex gap-2.5">
          <Tick />
          <span>
            Resolved 300+ <span className="marker">support calls and emails</span> from faculty,
            often close to semester deadlines
          </span>
        </li>
        <li className="flex gap-2.5">
          <Tick />
          <span>
            Wrote step-by-step <span className="marker">tutorials</span> and set up 200+ online
            courses
          </span>
        </li>
        <li className="flex gap-2.5">
          <svg
            viewBox="0 0 16 16"
            className="mt-1 h-4 w-4 shrink-0 text-pencil"
            aria-label="Left out"
          >
            <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span>
            <s className="text-ink-soft decoration-pencil decoration-2">
              Managed a team of 12 student employees
            </s>
            <span className="mt-0.5 block font-sans text-[13px] text-pencil">
              Not in your confirmed facts, so it was left out.
            </span>
          </span>
        </li>
      </ul>
    </figure>
  );
}
