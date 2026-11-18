import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Employee portal",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="i9">{children}</div>;
}
