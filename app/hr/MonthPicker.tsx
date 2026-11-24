"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

const label = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function shift(ym: string, n: number) {
  const d = new Date(`${ym}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

/** ← [Month ▾] → : arrows for the next/previous month, plus a dropdown to jump to any month. */
export default function MonthPicker({ base, month, current, query = "" }: { base: string; month: string; current: string; query?: string }) {
  const router = useRouter();
  const ym = month.slice(0, 7);
  const now = current.slice(0, 7);
  // The last two years up to next month, newest first (plus the selected month if it's outside that range).
  const options = Array.from({ length: 26 }, (_, i) => shift(now, 1 - i));
  if (!options.includes(ym)) options.push(ym);
  const q = query ? `&${query}` : ""; // extra filters to keep, e.g. "view=due"
  const go = (m: string) => router.push(`${base}?month=${m}${q}`);
  return (
    <div className="hr-month-nav">
      <Link className="btn btn-outline hr-btn-sm" href={`${base}?month=${shift(ym, -1)}${q}`} aria-label="Previous month">←</Link>
      <select className="hr-month-select" value={ym} onChange={(e) => go(e.target.value)} aria-label="Choose month">
        {options.map((o) => <option key={o} value={o}>{label(o)}</option>)}
      </select>
      <Link className="btn btn-outline hr-btn-sm" href={`${base}?month=${shift(ym, 1)}${q}`} aria-label="Next month">→</Link>
    </div>
  );
}
