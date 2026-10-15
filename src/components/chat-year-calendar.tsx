"use client";

import {
  DOW_FR,
  MONTHS_FR,
  holidayLabel,
  monthCells,
  type CalendarPayload,
} from "@/lib/chat-calendar";

type Props = CalendarPayload & {
  className?: string;
};

export function ChatYearCalendar({ year, holidays, className = "" }: Props) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-[var(--okapi-stroke)] bg-gradient-to-b from-[#f7faf7] to-white shadow-[0_1px_0_rgba(20,38,28,0.04)] ${className}`}
    >
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--okapi-stroke)] bg-[var(--okapi-forest)] px-3.5 py-3 text-white">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/65">
            Okapi
          </p>
          <h3 className="font-[family-name:var(--font-display,Georgia,serif)] text-xl font-bold tracking-tight">
            Calendrier {year}
          </h3>
        </div>
        {holidays ? (
          <p className="max-w-[14rem] text-right text-[10px] leading-snug text-white/75">
            Fériés RDC (dates fixes) en{" "}
            <span className="font-semibold text-[var(--okapi-amber)]">ambre</span>
          </p>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
        {MONTHS_FR.map((name, monthIndex) => {
          const cells = monthCells(year, monthIndex);
          return (
            <section
              key={name}
              className="rounded-lg border border-[var(--okapi-stroke)] bg-white/90 p-2.5"
            >
              <h4 className="mb-1.5 text-[12px] font-bold text-[var(--okapi-ink)]">
                {name}
              </h4>
              <div className="mb-1 grid grid-cols-7 gap-px text-center text-[9px] font-semibold uppercase tracking-wide text-[var(--okapi-leaf)]/70">
                {DOW_FR.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px">
                {cells.map((day, i) => {
                  if (day == null) {
                    return <span key={`e-${i}`} className="aspect-square" />;
                  }
                  const label = holidays
                    ? holidayLabel(year, monthIndex + 1, day)
                    : null;
                  const isSun = i % 7 === 6;
                  return (
                    <span
                      key={`${monthIndex}-${day}`}
                      title={label || undefined}
                      className={`flex aspect-square items-center justify-center rounded-md text-[11px] tabular-nums ${
                        label
                          ? "bg-[var(--okapi-amber)]/20 font-bold text-[var(--okapi-amber-deep)] ring-1 ring-[var(--okapi-amber)]/35"
                          : isSun
                            ? "font-medium text-[var(--okapi-mahogany)]"
                            : "text-[var(--okapi-ink)]"
                      }`}
                    >
                      {day}
                    </span>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
