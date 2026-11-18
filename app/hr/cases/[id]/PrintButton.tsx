"use client";

export default function PrintButton() {
  return (
    <button type="button" className="btn btn-outline no-print" onClick={() => window.print()}>
      Print / save as PDF
    </button>
  );
}
