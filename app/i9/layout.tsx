import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Form I-9",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default function I9Layout({ children }: { children: React.ReactNode }) {
  return <div className="i9">{children}</div>;
}
