"use client";

import { useEffect, useState } from "react";

/** Cycles through words with a soft slide. Screen readers get the full list once. */
export default function RotatingWord({ words, interval = 2200 }: { words: string[]; interval?: number }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % words.length), interval);
    return () => clearInterval(t);
  }, [words.length, interval]);

  return (
    <span className="rotating">
      <span className="sr-only">{words.join(", ")}</span>
      <span aria-hidden="true" key={i} className="rotating-word">
        {words[i]}
      </span>
    </span>
  );
}
