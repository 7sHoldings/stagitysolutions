"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Fades and lifts elements into view as the visitor scrolls.
 * Targets: anything with [data-reveal], plus common blocks (section heads, rows, cards).
 * Respects the visitor's "reduce motion" setting.
 */
const AUTO = ".section-head, .split > .side, .num-row, .grid-cell, .step, .industry-card, .cap, .arrow-list li, .tile, .cta, .media, .job-row, [data-reveal]";

export default function Reveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>(AUTO)).filter(
      (el) => !el.closest(".hero") && el.getBoundingClientRect().top > window.innerHeight * 0.9,
    );
    // Stagger siblings that share a parent (e.g. a row of cards).
    const order = new Map<Element, number>();
    els.forEach((el) => {
      const parent = el.parentElement!;
      const i = order.get(parent) ?? 0;
      order.set(parent, i + 1);
      el.style.setProperty("--reveal-delay", `${Math.min(i, 5) * 70}ms`);
      el.classList.add("reveal");
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);

  return null;
}
