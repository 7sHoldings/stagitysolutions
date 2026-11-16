"use client";

import { useEffect, useRef, useState } from "react";

/** Counts from 0 to `to` the first time it scrolls into view. */
export default function CountUp({ to, duration = 1200 }: { to: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(to);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setN(0);
    const el = ref.current!;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);

  return <span ref={ref}>{n}</span>;
}
