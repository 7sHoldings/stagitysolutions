import Link from "next/link";

/** Clear "← Back to …" button used at the top of admin detail pages. */
export default function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="hr-back no-print">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      {label}
    </Link>
  );
}
