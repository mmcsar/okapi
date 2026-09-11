"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const MONTHS_FR = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Jun",
  "Jul",
  "Aoû",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
] as const;

type GaugeKpi = {
  id: string;
  title: string;
  format: (n: number) => string;
  series: number[];
  plan: number;
  targetMarkPct: number;
};

type OpsRow = {
  metric: string;
  series: number[];
  plan?: number;
  format: (n: number) => string;
  lyFactor: number;
};

function fmtInt(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(
    Math.round(n),
  );
}

function fmtMoney(n: number) {
  return `$${fmtInt(n)}`;
}

function fmtPct(n: number) {
  return `${n.toFixed(2).replace(".", ",")}%`;
}

const KPI_CARDS: GaugeKpi[] = [
  {
    id: "accounts",
    title: "Total Number of Accounts",
    format: (n) => `${fmtInt(n)} Accounts`,
    plan: 6400,
    targetMarkPct: 68,
    series: [4200, 4500, 4800, 5100, 5400, 5700, 5900, 6100, 6200, 6300, 6380, 6418],
  },
  {
    id: "mrr",
    title: "Monthly Recurring Revenue",
    format: (n) => `${fmtMoney(n)} MRR`,
    plan: 400000,
    targetMarkPct: 55,
    series: [
      280000, 310000, 340000, 380000, 420000, 460000, 490000, 520000, 545000,
      565000, 580000, 594050,
    ],
  },
  {
    id: "avg-mrr",
    title: "Average Monthly Recurring Revenue",
    format: (n) => `$${Math.round(n)} Avg. MRR`,
    plan: 87,
    targetMarkPct: 60,
    series: [72, 76, 80, 84, 88, 91, 94, 97, 99, 101, 103, 105],
  },
  {
    id: "cr",
    title: "Conversion Rate",
    format: (n) => `${n.toFixed(1).replace(".", ",")}% CR`,
    plan: 4.1,
    targetMarkPct: 50,
    series: [3.2, 3.4, 3.6, 3.8, 4.0, 4.3, 4.6, 4.8, 5.0, 5.2, 5.4, 5.5],
  },
  {
    id: "mrr-rr",
    title: "Monthly Recurring Revenue Retention",
    format: (n) => `${n.toFixed(1).replace(".", ",")}% MRR RR`,
    plan: 103.3,
    targetMarkPct: 78,
    series: [
      98.2, 99.1, 100.0, 100.8, 101.5, 102.2, 103.0, 103.6, 104.1, 104.6, 105.0,
      105.4,
    ],
  },
];

const PRODUCT_ROWS: OpsRow[] = [
  {
    metric: "Account Retention Rate",
    format: fmtPct,
    lyFactor: 1.5,
    series: [99.2, 99.3, 99.4, 99.5, 99.6, 99.7, 99.8, 99.85, 99.9, 99.94, 99.97, 99.99],
  },
  {
    metric: "Trial Retention Rate",
    format: fmtPct,
    lyFactor: 1.5,
    series: [96.1, 96.4, 96.8, 97.0, 97.3, 97.6, 97.8, 98.0, 98.2, 98.3, 98.4, 98.5],
  },
  {
    metric: "Uptime",
    format: fmtPct,
    lyFactor: 1.5,
    series: [98.9, 99.0, 99.1, 99.2, 99.25, 99.3, 99.35, 99.4, 99.45, 99.5, 99.52, 99.55],
  },
  {
    metric: "Apps générées / mois",
    format: fmtInt,
    lyFactor: 2.1,
    series: [420, 480, 540, 600, 680, 740, 800, 860, 920, 960, 1000, 1024],
  },
  {
    metric: "Erreurs API critiques",
    format: fmtInt,
    lyFactor: 0.4,
    series: [18, 16, 14, 12, 11, 9, 8, 7, 6, 5, 4, 3],
  },
];

const MARKETING_ROWS: OpsRow[] = [
  {
    metric: "Trial Starts",
    format: fmtInt,
    plan: 150000,
    lyFactor: 1.9,
    series: [
      90000, 100000, 110000, 120000, 130000, 145000, 155000, 165000, 175000,
      185000, 190000, 195700,
    ],
  },
  {
    metric: "Consumers",
    format: fmtInt,
    plan: 8000,
    lyFactor: 1.7,
    series: [5200, 5600, 6000, 6400, 6800, 7200, 7600, 8000, 8300, 8600, 8800, 8950],
  },
  {
    metric: "WWW Users",
    format: fmtInt,
    plan: 7500,
    lyFactor: 1.8,
    series: [4800, 5200, 5600, 6000, 6400, 6800, 7200, 7600, 7900, 8100, 8300, 8420],
  },
  {
    metric: "Leads WhatsApp RDC",
    format: fmtInt,
    plan: 1000,
    lyFactor: 2.4,
    series: [320, 400, 480, 560, 650, 740, 840, 940, 1040, 1140, 1220, 1280],
  },
  {
    metric: "Installations PWA",
    format: fmtInt,
    plan: 500,
    lyFactor: 3.0,
    series: [80, 120, 170, 230, 290, 350, 410, 470, 520, 570, 610, 640],
  },
];

const SALES_ROWS: OpsRow[] = [
  {
    metric: "Average MRR",
    format: fmtMoney,
    plan: 480000,
    lyFactor: 1.9,
    series: [
      280000, 310000, 340000, 380000, 420000, 460000, 490000, 520000, 545000,
      565000, 580000, 594050,
    ],
  },
  {
    metric: "MRR / compte",
    format: (n) => `$${Math.round(n)}`,
    plan: 87,
    lyFactor: 1.6,
    series: [72, 76, 80, 84, 88, 91, 94, 97, 99, 101, 103, 105],
  },
  {
    metric: "Revenue",
    format: fmtMoney,
    plan: 500000,
    lyFactor: 1.8,
    series: [
      270000, 300000, 330000, 370000, 410000, 450000, 480000, 510000, 535000,
      555000, 572000, 586365,
    ],
  },
  {
    metric: "Pipeline clients Okapi",
    format: fmtMoney,
    plan: 40000,
    lyFactor: 1.4,
    series: [
      18000, 21000, 24000, 27000, 30000, 33000, 36000, 39000, 42000, 44000, 46000,
      48200,
    ],
  },
  {
    metric: "Deals closés (trim.)",
    format: fmtInt,
    plan: 36,
    lyFactor: 1.3,
    series: [18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 39, 42],
  },
];

/** Point on upper semicircle: 0% = left, 100% = right */
function polar(cx: number, cy: number, radius: number, pct: number) {
  const p = Math.max(0, Math.min(100, pct));
  const a = Math.PI * (1 - p / 100);
  return {
    x: cx + radius * Math.cos(a),
    y: cy - radius * Math.sin(a),
  };
}

/** Aiguille cadrée en coordonnées polaires (pas de CSS rotate). */
function Gauge({ pct, targetMark }: { pct: number; targetMark: number }) {
  const [shown, setShown] = useState(pct);
  const shownRef = useRef(pct);

  useEffect(() => {
    const start = shownRef.current;
    const end = Math.max(0, Math.min(100, pct));
    const t0 = performance.now();
    const dur = 650;
    let raf = 0;
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / dur);
      const e = 1 - (1 - u) ** 3;
      const next = start + (end - start) * e;
      shownRef.current = next;
      setShown(next);
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pct]);

  const cx = 80;
  const cy = 78;
  const trackR = 58;
  const needleR = 48;
  const tip = polar(cx, cy, needleR, shown);
  const mark = polar(cx, cy, trackR + 2, targetMark);
  const a = Math.PI * (1 - shown / 100);
  const px = Math.sin(a) * 4.5;
  const py = Math.cos(a) * 4.5;
  const base1 = { x: cx - px, y: cy - py };
  const base2 = { x: cx + px, y: cy + py };
  const arcLen = Math.PI * trackR;
  const dash = (shown / 100) * arcLen;

  return (
    <svg
      viewBox="0 0 160 92"
      className="mx-auto block h-[84px] w-full max-w-[160px]"
    >
      {/* Track */}
      <path
        d={`M ${cx - trackR} ${cy} A ${trackR} ${trackR} 0 0 0 ${cx + trackR} ${cy}`}
        fill="none"
        stroke="#e5ebe7"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d={`M ${cx - trackR} ${cy} A ${trackR} ${trackR} 0 0 0 ${cx + trackR} ${cy}`}
        fill="none"
        stroke="#1b4f3a"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${arcLen}`}
      />

      {/* Ticks */}
      {[0, 25, 50, 75, 100].map((t) => {
        const inner = polar(cx, cy, trackR - 10, t);
        const outer = polar(cx, cy, trackR - 1, t);
        return (
          <line
            key={t}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke="#14261c"
            strokeOpacity="0.28"
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
      })}

      {/* Target mark */}
      <circle cx={mark.x} cy={mark.y} r="3.5" fill="#e8892a" />

      {/* Needle body — polygon tip → base */}
      <polygon
        points={`${tip.x},${tip.y} ${base1.x},${base1.y} ${base2.x},${base2.y}`}
        fill="#14261c"
      />
      {/* Amber tip accent */}
      <circle cx={tip.x} cy={tip.y} r="3" fill="#e8892a" />

      {/* Hub */}
      <circle cx={cx} cy={cy} r="9" fill="#1b4f3a" />
      <circle cx={cx} cy={cy} r="5" fill="#e8892a" />
      <circle cx={cx} cy={cy} r="2" fill="#fff" />
    </svg>
  );
}

function SparkBars({
  values,
  activeIndex,
  color = "#2f6b4f",
  onSelect,
}: {
  values: number[];
  activeIndex: number;
  color?: string;
  onSelect?: (i: number) => void;
}) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-8 items-end gap-[2px]">
      {values.map((v, i) => (
        <button
          key={i}
          type="button"
          title={MONTHS_FR[i]}
          onClick={() => onSelect?.(i)}
          className="w-[5px] rounded-sm transition hover:opacity-100"
          style={{
            height: `${Math.max((v / max) * 100, 8)}%`,
            backgroundColor: color,
            opacity: i === activeIndex ? 1 : 0.4,
            outline: i === activeIndex ? "1px solid #e8892a" : undefined,
            outlineOffset: 1,
          }}
        />
      ))}
    </div>
  );
}

function MonthNav({
  monthIndex,
  onPrev,
  onNext,
}: {
  monthIndex: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[var(--okapi-stroke)] bg-white/90 p-1">
      <button
        type="button"
        aria-label="Mois précédent"
        onClick={onPrev}
        disabled={monthIndex <= 0}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold text-okapi-forest hover:bg-okapi-mist disabled:opacity-30"
      >
        ←
      </button>
      <div className="min-w-[88px] text-center">
        <p className="text-sm font-bold">{MONTHS_FR[monthIndex]} 2026</p>
        <p className="text-[10px] text-okapi-ink/40">{monthIndex + 1}/12</p>
      </div>
      <button
        type="button"
        aria-label="Mois suivant"
        onClick={onNext}
        disabled={monthIndex >= 11}
        className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold text-okapi-forest hover:bg-okapi-mist disabled:opacity-30"
      >
        →
      </button>
    </div>
  );
}

function KpiCard({
  kpi,
  monthIndex,
  onSelectMonth,
}: {
  kpi: GaugeKpi;
  monthIndex: number;
  onSelectMonth: (i: number) => void;
}) {
  const value = kpi.series[monthIndex] ?? kpi.series[kpi.series.length - 1];
  const vsPlanPct = Math.round((value / Math.max(kpi.plan, 0.0001)) * 100);
  const gaugePct = Math.min(100, Math.round((value / (kpi.plan * 1.2)) * 100));

  return (
    <article className="flex flex-col rounded-2xl border border-[var(--okapi-stroke)] bg-white p-3 shadow-sm">
      <p className="min-h-[36px] text-center text-[11px] font-semibold leading-snug text-okapi-ink/70">
        {kpi.title}
      </p>
      <div className="py-1">
        <Gauge pct={gaugePct} targetMark={kpi.targetMarkPct} />
      </div>
      <div className="rounded-md bg-okapi-forest px-2 py-2 text-center">
        <p className="text-[13px] font-bold leading-tight text-white">
          {kpi.format(value)}
        </p>
      </div>
      <p className="mt-2 text-center text-[11px] font-semibold text-okapi-ink/55">
        {vsPlanPct}% VS Plan
      </p>
      <div className="mt-2 flex justify-center">
        <SparkBars
          values={kpi.series}
          activeIndex={monthIndex}
          color="#1b4f3a"
          onSelect={onSelectMonth}
        />
      </div>
    </article>
  );
}

function OpsTable({
  title,
  rows,
  showPlan,
  monthIndex,
  sortDir,
  onToggleSort,
  onSelectMonth,
}: {
  title: string;
  rows: OpsRow[];
  showPlan?: boolean;
  monthIndex: number;
  sortDir: "asc" | "desc";
  onToggleSort: () => void;
  onSelectMonth: (i: number) => void;
}) {
  const sorted = useMemo(() => {
    const withMeta = rows.map((row) => ({
      row,
      value: row.series[monthIndex] ?? 0,
      vs: row.lyFactor,
    }));
    withMeta.sort((a, b) =>
      sortDir === "desc" ? b.vs - a.vs : a.vs - b.vs,
    );
    return withMeta;
  }, [rows, monthIndex, sortDir]);

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--okapi-stroke)] bg-white shadow-sm">
      <div className="bg-okapi-leaf px-3 py-2">
        <p className="text-center text-sm font-bold text-white">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[280px] text-left text-[12px]">
          <thead>
            <tr className="bg-okapi-forest/90 text-white">
              <th className="px-2 py-2 font-semibold">Metric</th>
              <th className="px-2 py-2 font-semibold">
                {showPlan ? "Total" : "Values"}
              </th>
              {showPlan ? (
                <th className="px-2 py-2 font-semibold">Plan</th>
              ) : null}
              <th className="px-2 py-2 font-semibold">
                <button
                  type="button"
                  onClick={onToggleSort}
                  className="inline-flex items-center gap-1 hover:bg-white/15"
                >
                  Vs LY {sortDir === "desc" ? "▼" : "▲"}
                </button>
              </th>
              <th className="px-2 py-2 font-semibold">Monthly Trend</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ row, value, vs }, i) => {
              const up = vs >= 1;
              return (
                <tr
                  key={row.metric}
                  className={i % 2 === 0 ? "bg-okapi-mist/70" : "bg-white"}
                >
                  <td className="border-r border-[var(--okapi-stroke)] bg-okapi-leaf/15 px-2 py-2 font-semibold">
                    {row.metric}
                  </td>
                  <td className="px-2 py-2 font-medium">{row.format(value)}</td>
                  {showPlan ? (
                    <td className="px-2 py-2 text-okapi-ink/60">
                      {row.plan != null ? row.format(row.plan) : "—"}
                    </td>
                  ) : null}
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={onToggleSort}
                      className={`font-semibold ${
                        up ? "text-okapi-forest" : "text-okapi-amber-deep"
                      }`}
                    >
                      {up ? "▲" : "▼"} {vs.toFixed(1)} X
                    </button>
                  </td>
                  <td className="px-2 py-2">
                    <SparkBars
                      values={row.series}
                      activeIndex={monthIndex}
                      color="#2f6b4f"
                      onSelect={onSelectMonth}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminExecutiveDashboard() {
  const [monthIndex, setMonthIndex] = useState(11);
  const [sortProduct, setSortProduct] = useState<"asc" | "desc">("desc");
  const [sortMarketing, setSortMarketing] = useState<"asc" | "desc">("desc");
  const [sortSales, setSortSales] = useState<"asc" | "desc">("desc");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-okapi-amber-deep">
            Ops · Exécutif
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight text-okapi-ink lg:text-3xl">
            Tableau de bord exécutif — ventes & opérations
          </h2>
          <p className="mt-1 text-sm text-okapi-ink/50">
            ← → pour changer de mois · flèches Vs LY pour trier
          </p>
        </div>
        <MonthNav
          monthIndex={monthIndex}
          onPrev={() => setMonthIndex((m) => Math.max(0, m - 1))}
          onNext={() => setMonthIndex((m) => Math.min(11, m + 1))}
        />
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {KPI_CARDS.map((kpi) => (
          <KpiCard
            key={kpi.id}
            kpi={kpi}
            monthIndex={monthIndex}
            onSelectMonth={setMonthIndex}
          />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <OpsTable
          title="Product"
          rows={PRODUCT_ROWS}
          monthIndex={monthIndex}
          sortDir={sortProduct}
          onToggleSort={() =>
            setSortProduct((d) => (d === "desc" ? "asc" : "desc"))
          }
          onSelectMonth={setMonthIndex}
        />
        <OpsTable
          title="Marketing"
          rows={MARKETING_ROWS}
          showPlan
          monthIndex={monthIndex}
          sortDir={sortMarketing}
          onToggleSort={() =>
            setSortMarketing((d) => (d === "desc" ? "asc" : "desc"))
          }
          onSelectMonth={setMonthIndex}
        />
        <OpsTable
          title="Sales"
          rows={SALES_ROWS}
          showPlan
          monthIndex={monthIndex}
          sortDir={sortSales}
          onToggleSort={() =>
            setSortSales((d) => (d === "desc" ? "asc" : "desc"))
          }
          onSelectMonth={setMonthIndex}
        />
      </section>
    </div>
  );
}
