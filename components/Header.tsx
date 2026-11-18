"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { areaFor } from "@/lib/area";
import { signOutPortal } from "@/app/portal/actions";

const employeeLinks = [
  { href: "/portal", label: "Timesheets" },
  { href: "/portal/i9", label: "Form I-9" },
  { href: "/portal/set-password", label: "Change password" },
];

const links = [
  { href: "/services", label: "Services" },
  { href: "/services#data-ai", label: "Data & AI" },
  { href: "/industries", label: "Industries" },
  { href: "/about", label: "Company" },
  { href: "/careers", label: "Careers" },
];

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const area = areaFor(pathname);

  useEffect(() => setOpen(false), [pathname]);

  // Inside the portals, show only that portal's options, not the public website menu.
  if (area !== "public") {
    const home = area === "employee" ? "/portal" : "/hr";
    return (
      <header className="site-header">
        <div className="container bar">
          <Link href={home} className="brand portal-brand" aria-label={area === "employee" ? "Employee portal home" : "Admin portal home"}>
            <Image src="/logo.png" alt="Stagity Solutions" width={432} height={164} priority />
            <span className="portal-tag">{area === "employee" ? "Employee portal" : "Admin portal"}</span>
          </Link>
          {area === "employee" && (
            <>
              <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="portal-nav" onClick={() => setOpen((o) => !o)}>
                {open ? "Close" : "Menu"}
              </button>
              <nav id="portal-nav" aria-label="Employee portal" className={`nav${open ? " open" : ""}`}>
                {employeeLinks.map((l) => (
                  <Link key={l.href} href={l.href} className="nav-link" aria-current={pathname === l.href || (l.href === "/portal" && pathname.startsWith("/portal/timesheets")) ? "page" : undefined}>
                    {l.label}
                  </Link>
                ))}
                <form action={signOutPortal}>
                  <button className="btn btn-outline" style={{ width: "100%" }}>Sign out</button>
                </form>
              </nav>
            </>
          )}
        </div>
      </header>
    );
  }

  return (
    <header className="site-header">
      <div className="container bar">
        <Link href="/" className="brand" aria-label="Stagity Solutions home">
          <Image src="/logo.png" alt="Stagity Solutions — Empowered by Innovation" width={432} height={164} priority />
        </Link>
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Close" : "Menu"}
        </button>
        <nav id="main-nav" aria-label="Main" className={`nav${open ? " open" : ""}`}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="nav-link"
              aria-current={pathname === l.href ? "page" : undefined}
            >
              {l.label}
            </Link>
          ))}
          <Link href="/sign-in" className="btn btn-outline" aria-current={pathname === "/sign-in" ? "page" : undefined}>
            Sign in
          </Link>
          <Link href="/contact" className="btn btn-dark">
            Contact us
          </Link>
        </nav>
      </div>
    </header>
  );
}
