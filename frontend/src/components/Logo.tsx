import { Link } from "react-router";
import { cn } from "@/lib/format";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-9", className)} aria-hidden>
      <rect width="64" height="64" rx="18" fill="var(--color-brand-700)" />
      <path
        d="M20 38c0-10 8-18 24-20-1 14-8 24-19 24-2 0-3.5-.5-5-1.5"
        fill="none"
        stroke="var(--color-brand-200)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M18 46c5-8 11-13 18-17" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ to = "/", className, light }: { to?: string; className?: string; light?: boolean }) {
  return (
    <Link to={to} className={cn("inline-flex items-center gap-2.5 rounded-xl", className)} aria-label="Swacchify home">
      <LogoMark />
      <span className={cn("text-xl font-semibold tracking-tight", light ? "text-white" : "text-forest-800")}>
        Swacchify
      </span>
    </Link>
  );
}
