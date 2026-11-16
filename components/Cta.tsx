import Link from "next/link";

export default function Cta({
  title = "Let's build what's next.",
  text = "Tell us where you want to go. We'll come back to you within one business day.",
  button = "Talk to our team",
}: {
  title?: string;
  text?: string;
  button?: string;
}) {
  return (
    <section className="container" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <div className="cta">
        <div>
          <h2>{title}</h2>
          {text ? <p>{text}</p> : null}
        </div>
        <Link href="/contact" className="btn btn-light">
          {button}
        </Link>
      </div>
    </section>
  );
}
