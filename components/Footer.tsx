import Link from "next/link";
import Image from "next/image";
import { company, coreServices } from "@/lib/content";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-col">
            <Image src="/logo.png" alt="Stagity Solutions" width={432} height={164} style={{ height: 76, width: "auto" }} />
            <p>IT services, consulting and Data &amp; AI for growing enterprises.</p>
          </div>
          <div className="footer-col">
            <p className="head">Services</p>
            {coreServices.slice(0, 4).map((s) => (
              <Link key={s.slug} href={`/services/${s.slug}`}>
                {s.title}
              </Link>
            ))}
            <Link href="/services#data-ai">Data &amp; AI</Link>
          </div>
          <div className="footer-col">
            <p className="head">Company</p>
            <Link href="/about">About</Link>
            <Link href="/industries">Industries</Link>
            <Link href="/careers">Careers</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/contact">Contact</Link>
          </div>
          <div className="footer-col">
            <p className="head">Dallas office</p>
            <p>
              {company.addressLine1}
              <br />
              {company.addressLine2}
            </p>
            <a href={company.phoneHref}>{company.phone}</a>
            <a href={`mailto:${company.email}`}>{company.email}</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>
            © {year} {company.legalName}. All rights reserved.
          </p>
          <Link href="/privacy">Privacy policy</Link>
        </div>
      </div>
    </footer>
  );
}
