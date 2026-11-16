import Link from "next/link";

export default function NotFound() {
  return (
    <section className="container section" style={{ display: "flex", flexDirection: "column", gap: 24, alignItems: "flex-start" }}>
      <p className="eyebrow">404</p>
      <h1 className="display-md">We couldn&apos;t find that page.</h1>
      <p className="lead">It may have moved when we refreshed our website.</p>
      <div className="btn-row">
        <Link href="/" className="btn btn-primary">
          Go to homepage
        </Link>
        <Link href="/services" className="btn btn-outline">
          Our services
        </Link>
      </div>
    </section>
  );
}
