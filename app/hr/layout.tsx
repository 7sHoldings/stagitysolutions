import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HR portal",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return <div className="i9">{children}</div>;
}
