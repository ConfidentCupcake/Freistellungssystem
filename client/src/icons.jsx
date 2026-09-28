/*
 * The icons the dashboards share. Drawn as inline SVG rather than set in a
 * glyph font, so they scale and take their colour from the element they sit in
 * (`stroke="currentColor"`), which is what lets the same icon sit in a white
 * button and in a red banner.
 *
 * They live here because /teilnehmer and /admin use the same set; an icon only
 * one page needs stays in that page's file (CalendarIcon in Teilnehmer.jsx).
 *
 * Every one is aria-hidden: each is next to its own label in the markup, so a
 * screen reader announcing it again would only repeat that label.
 */

export function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1.6v10.8M1.6 7h10.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.4" y="1.4" width="13.2" height="13.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5v4M8 11.2v.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.4" y="1.4" width="13.2" height="13.2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M4.4 8.3l2.5 2.5 4.7-5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 3.5l4.5 4.5L6 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
