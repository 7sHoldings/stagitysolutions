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
  const chevron = (d: string) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
  return (
    <div className="mp" role="group" aria-label="Month">
      <Link className="mp-arrow" href={`${base}?month=${shift(ym, -1)}${q}`} aria-label="Previous month">{chevron("M15 18l-6-6 6-6")}</Link>
      <label className="mp-mid">
        <svg className="mp-cal" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
        <select className="mp-select" value={ym} onChange={(e) => go(e.target.value)} aria-label="Choose month">
          {options.map((o) => <option key={o} value={o}>{label(o)}</option>)}
        </select>
        <svg className="mp-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </label>
      <Link className="mp-arrow" href={`${base}?month=${shift(ym, 1)}${q}`} aria-label="Next month">{chevron("M9 18l6-6-6-6")}</Link>
    </div>
  );
}
