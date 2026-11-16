"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { faqs, faqCategories, popularFaqs, type Faq, type FaqCategory } from "@/lib/faq";
import { matchQuestion } from "@/lib/faqMatch";
import { logChatQuestion } from "@/app/chat/actions";
import { submitContact, type ContactState } from "@/app/contact/actions";

type Msg =
  | { id: number; from: "user"; text: string }
  | { id: number; from: "bot"; kind: "text"; text: string; chips?: Faq[]; topics?: boolean }
  | { id: number; from: "bot"; kind: "answer"; faq: Faq; related: Faq[] }
  | { id: number; from: "bot"; kind: "contact"; question: string; intro: string; chips?: Faq[] };

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

let nextId = 1;
const welcome = (): Msg[] => [
  {
    id: nextId++,
    from: "bot",
    kind: "text",
    text: "Hi! I'm the Stagity assistant. 👋 Ask me anything about our services, industries, careers or how to work with us — or tap a question below.",
    chips: popularFaqs.slice(0, 6),
    topics: true,
  },
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && msgs.length === 0) setMsgs(welcome());
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, msgs.length]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const botSay = (m: DistOmit<Msg, "id">) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs((prev) => [...prev, { ...(m as Msg), id: nextId++ }]);
    }, 450);
  };

  const ask = (text: string, faq?: Faq) => {
    const q = text.trim();
    if (!q) return;
    setInput("");
    setMsgs((prev) => [...prev, { id: nextId++, from: "user", text: q }]);

    if (faq) {
      const related = faqs.filter((f) => f.category === faq.category && f.id !== faq.id).slice(0, 3);
      botSay({ from: "bot", kind: "answer", faq, related });
      return;
    }
    const r = matchQuestion(q);
    if (r.kind === "smalltalk") {
      botSay({ from: "bot", kind: "text", text: r.reply, chips: popularFaqs.slice(0, 4) });
    } else if (r.kind === "answer") {
      logChatQuestion(q, r.faq.id).catch(() => {});
      botSay({ from: "bot", kind: "answer", faq: r.faq, related: r.related });
    } else {
      logChatQuestion(q, null).catch(() => {});
      botSay({
        from: "bot",
        kind: "contact",
        question: q,
        intro:
          "I don't have an answer for that yet — but our team does. Leave your details and we'll get back to you within one business day.",
        chips: r.suggestions,
      });
    }
  };

  const showTopic = (cat: FaqCategory) => {
    setMsgs((prev) => [...prev, { id: nextId++, from: "user", text: cat }]);
    botSay({
      from: "bot",
      kind: "text",
      text: `Here are common questions about ${cat.toLowerCase()}:`,
      chips: faqs.filter((f) => f.category === cat),
    });
  };

  const openContact = () => {
    botSay({
      from: "bot",
      kind: "contact",
      question: "",
      intro: "Sure — leave your details and our team will get back to you within one business day.",
    });
  };

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        className={`chat-launcher${open ? " is-open" : ""}`}
        aria-label={open ? "Close chat" : "Open chat — ask us a question"}
        aria-expanded={open}
        aria-controls="chat-panel"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
              <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
            </svg>
            <span className="chat-launcher-label">Ask us anything</span>
          </>
        )}
      </button>

      {open && (
        <div id="chat-panel" className="chat-panel" role="dialog" aria-label="Stagity assistant">
          <div className="chat-head">
            <span className="chat-avatar" aria-hidden="true">
              <svg viewBox="0 0 48 48" width="22" height="22">
                <ellipse cx="24" cy="24" rx="17" ry="10" fill="none" stroke="#13A1E9" strokeWidth="4" strokeLinecap="round" strokeDasharray="38 80" transform="rotate(-18 24 24)" />
                <ellipse cx="24" cy="24" rx="17" ry="10" fill="none" stroke="#FF870E" strokeWidth="4" strokeLinecap="round" strokeDasharray="38 80" strokeDashoffset="-42" transform="rotate(-18 24 24)" />
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="chat-title">Stagity Assistant</p>
              <p className="chat-sub">
                <span className="chat-online" aria-hidden="true" /> Instant answers, 24/7
              </p>
            </div>
            <button type="button" className="chat-icon-btn" aria-label="Restart conversation" onClick={() => setMsgs(welcome())}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
            <button type="button" className="chat-icon-btn" aria-label="Close chat" onClick={() => setOpen(false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="chat-log" ref={logRef} aria-live="polite">
            {msgs.map((m) =>
              m.from === "user" ? (
                <div key={m.id} className="bubble user">
                  {m.text}
                </div>
              ) : m.kind === "text" ? (
                <div key={m.id} className="bot-block">
                  <div className="bubble bot">{m.text}</div>
                  {m.chips && m.chips.length > 0 && <Chips items={m.chips} onPick={(f) => ask(f.q, f)} />}
                  {m.topics && (
                    <div className="chat-topics">
                      <p className="chat-mini">Browse by topic</p>
                      <div className="chips">
                        {faqCategories.map((c) => (
                          <button key={c} type="button" className="chip chip-topic" onClick={() => showTopic(c)}>
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : m.kind === "answer" ? (
                <div key={m.id} className="bot-block">
                  <div className="bubble bot">
                    <p>{m.faq.a}</p>
                    {m.faq.links && m.faq.links.length > 0 && (
                      <div className="bubble-links">
                        {m.faq.links.map((l) =>
                          l.href.startsWith("/") ? (
                            <Link key={l.href + l.label} href={l.href} onClick={() => setOpen(false)}>
                              {l.label} →
                            </Link>
                          ) : (
                            <a key={l.href + l.label} href={l.href}>
                              {l.label} →
                            </a>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                  {m.related.length > 0 && (
                    <>
                      <p className="chat-mini">Related questions</p>
                      <Chips items={m.related} onPick={(f) => ask(f.q, f)} />
                    </>
                  )}
                  <button type="button" className="chat-text-btn" onClick={openContact}>
                    Not what you needed? Talk to our team
                  </button>
                </div>
              ) : (
                <div key={m.id} className="bot-block">
                  <div className="bubble bot">{m.intro}</div>
                  <ChatContactForm question={m.question} />
                  {m.chips && m.chips.length > 0 && (
                    <>
                      <p className="chat-mini">Or maybe one of these helps</p>
                      <Chips items={m.chips} onPick={(f) => ask(f.q, f)} />
                    </>
                  )}
                </div>
              ),
            )}
            {typing && (
              <div className="bubble bot typing" aria-label="Assistant is typing">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <label htmlFor="chat-q" className="sr-only">
              Type your question
            </label>
            <input
              id="chat-q"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question…"
              autoComplete="off"
              maxLength={300}
            />
            <button type="submit" aria-label="Send" disabled={!input.trim()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function Chips({ items, onPick }: { items: Faq[]; onPick: (f: Faq) => void }) {
  return (
    <div className="chips">
      {items.map((f) => (
        <button key={f.id} type="button" className="chip" onClick={() => onPick(f)}>
          {f.q}
        </button>
      ))}
    </div>
  );
}

const initial: ContactState = { status: "idle" };

function ChatContactForm({ question }: { question: string }) {
  const [state, action, pending] = useActionState(submitContact, initial);
  const uid = useId();

  if (state.status === "ok") {
    return <div className="bubble bot ok">✓ Thanks! Your message has been sent. Our team will reply within one business day.</div>;
  }

  return (
    <form action={action} className="chat-form">
      <input type="hidden" name="interest" value="Chat assistant" />
      <label className="sr-only" htmlFor={`cn-${uid}`}>
        Your name
      </label>
      <input id={`cn-${uid}`} name="name" required placeholder="Your name" autoComplete="name" />
      <label className="sr-only" htmlFor={`ce-${uid}`}>
        Email
      </label>
      <input id={`ce-${uid}`} name="email" type="email" required placeholder="Email" autoComplete="email" />
      <label className="sr-only" htmlFor={`cp-${uid}`}>
        Phone (optional)
      </label>
      <input id={`cp-${uid}`} name="phone" type="tel" placeholder="Phone (optional)" autoComplete="tel" />
      <label className="sr-only" htmlFor={`cm-${uid}`}>
        Your question
      </label>
      <textarea id={`cm-${uid}`} name="message" required rows={3} defaultValue={question} placeholder="How can we help?" />
      <div className="hp" aria-hidden="true">
        <input name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state.status === "error" && (
        <p className="form-status err" role="alert" style={{ fontSize: 13.5, padding: "10px 12px" }}>
          {state.message}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending} style={{ minHeight: 44, padding: "10px 18px", fontSize: 15 }}>
        {pending ? "Sending…" : "Send to our team"}
      </button>
    </form>
  );
}
