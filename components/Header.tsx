"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="site-header">
      <div className="container bar">
        <Link href="/" className="brand" aria-label="Stagity Solutions home">
          <Image src="/logo.png" alt="Stagity Solutions — Empowered by Innovation" width={500} height={192} priority />
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
          <Link href="/contact" className="btn btn-dark">
            Contact us
          </Link>
        </nav>
      </div>
    </header>
  );
}
