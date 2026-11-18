"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { areaFor } from "@/lib/area";

/** Full website footer on public pages; a slim footer inside the employee and admin portals. */
export default function FooterGate({ children }: { children: React.ReactNode }) {
  const area = areaFor(usePathname());
  if (area === "public") return <>{children}</>;
  return (
    <footer className="site-footer portal-footer">
      <div className="container portal-footer-row">
        <span>© {new Date().getFullYear()} Stagity Solutions LLC</span>
        <span>
          Questions? <a href="mailto:hr@stagitysolutions.com">hr@stagitysolutions.com</a> · <Link href="/privacy">Privacy</Link>
        </span>
      </div>
    </footer>
  );
}
