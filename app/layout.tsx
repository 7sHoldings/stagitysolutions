import type { Metadata } from "next";
import localFont from "next/font/local";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { company } from "@/lib/content";
import "./globals.css";

// Self-hosted variable fonts (SIL Open Font License) — no request to Google at runtime.
const inter = localFont({ src: "./fonts/inter.woff2", variable: "--font-inter", weight: "100 900", display: "swap" });
const interTight = localFont({
  src: "./fonts/inter-tight.woff2",
  variable: "--font-inter-tight",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(company.url),
  title: {
    default: "Stagity Solutions — IT Services, Consulting and Data & AI | Dallas, TX",
    template: "%s | Stagity Solutions",
  },
  description:
    "Stagity Solutions designs, builds and runs applications, cloud platforms and data systems for growing enterprises. IT services, consulting and Data & AI from Dallas, Texas.",
  openGraph: {
    type: "website",
    siteName: company.name,
    locale: "en_US",
  },
};

const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: company.legalName,
  url: company.url,
  logo: `${company.url}/logo.png`,
  telephone: company.phone,
  email: company.email,
  address: {
    "@type": "PostalAddress",
    streetAddress: company.addressLine1,
    addressLocality: "Dallas",
    addressRegion: "TX",
    postalCode: "75244",
    addressCountry: "US",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </body>
    </html>
  );
}
