import { ChevronLeft, Inbox, Loader2, RotateCw, Star, TriangleAlert, X, type LucideIcon } from "lucide-react";
import {
  createElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import { cn } from "@/lib/format";

// ── Button ──────────────────────────────────────────────────────────────────
type Variant = "primary" | "secondary" | "soft" | "ghost" | "danger" | "sea";
type Size = "sm" | "md" | "lg" | "xl";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-canvas active:bg-line/60",
  soft: "bg-brand-50 text-brand-800 hover:bg-brand-100 active:bg-brand-200/70",
  ghost: "text-ink-2 hover:bg-black/[0.04] active:bg-black/[0.07]",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
  sea: "bg-sea-600 text-white hover:bg-sea-700",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-10 gap-2 px-3.5 text-sm",
  lg: "h-11 gap-2 px-4 text-[15px]",
  xl: "h-12 gap-2.5 px-5 text-[15px]",
};

export function buttonStyles(variant: Variant = "primary", size: Size = "md", block = false) {
  return cn(
    "inline-flex select-none items-center justify-center rounded-lg font-medium transition-colors duration-150 disabled:opacity-45",
    VARIANTS[variant],
    SIZES[size],
    block && "w-full",
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonStyles(variant, size, block), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({
  to,
  variant,
  size,
  block,
  icon,
  className,
  children,
}: {
  to: string;
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={cn(buttonStyles(variant, size, block), className)}>
      {icon}
      {children}
    </Link>
  );
}

// ── Surfaces ────────────────────────────────────────────────────────────────
export function Card({
  className,
  children,
  as: As = "div",
  ...rest
}: { className?: string; children: ReactNode; as?: "div" | "section" | "article" | "aside" | "li" | "form" } & Record<string, unknown>) {
  return (
    <As className={cn("rounded-card border border-line bg-surface shadow-soft", className)} {...rest}>
      {children}
    </As>
  );
}

/** Icon tones. The aliases keep the palette to two accents however a page spells it. */
export type IconTone = "neutral" | "brand" | "sea" | "amber" | "red" | "green" | "blue" | "gray" | "purple";

const ICON_TONES: Record<IconTone, string> = {
  neutral: "bg-canvas text-ink-2",
  gray: "bg-canvas text-ink-2",
  brand: "bg-brand-50 text-brand-700",
  green: "bg-brand-50 text-brand-700",
  purple: "bg-brand-50 text-brand-700",
  sea: "bg-sea-50 text-sea-700",
  blue: "bg-sea-50 text-sea-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-600",
};

/** Small square icon holder — the one decorative shape used across the app. */
export function IconBox({
  icon,
  tone = "neutral",
  size = "md",
  className,
}: {
  icon: LucideIcon | ReactNode;
  tone?: IconTone;
  size?: "sm" | "md";
  className?: string;
}) {
  // `icon` may be a Lucide component (a forwardRef object, not a function) or an already-rendered element.
  const content = isValidElement(icon)
    ? icon
    : createElement(icon as LucideIcon, { className: size === "sm" ? "size-4" : "size-[18px]" });
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-lg", size === "sm" ? "size-8" : "size-10", ICON_TONES[tone], className)}
      aria-hidden
    >
      {content}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: string | true;
  actions?: ReactNode;
  icon?: LucideIcon | ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="mb-6">
      {back && (
        <button
          onClick={() => (back === true ? navigate(-1) : navigate(back))}
          className="mb-3 -ml-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-4" /> Back
        </button>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon && <IconBox icon={icon} tone="brand" />}
          <div className="min-w-0">
            <h1 className="text-[22px] leading-tight font-semibold sm:text-2xl">{title}</h1>
            {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {action}
    </div>
  );
}

// ── Form controls ───────────────────────────────────────────────────────────
const control =
  "w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink transition placeholder:text-muted/70 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none disabled:bg-canvas disabled:text-muted";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(control, "h-10", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(control, "min-h-20 py-2.5", className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(control, "h-10 appearance-none pr-8", className)} {...rest}>
      {children}
    </select>
  );
});

export function Field({
  label,
  hint,
  error,
  children,
  optional,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-ink-2">
        {label}
        {optional && <span className="ml-1 font-normal text-muted">({optional})</span>}
      </label>
      {children(id)}
      {error ? (
        <p className="text-[13px] text-red-600" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-[13px] text-muted">{hint}</p>
      )}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2.5">
      <span className="text-sm">
        <span className="block font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-600" : "bg-line-strong",
        )}
      >
        <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform", checked && "translate-x-4")} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-line bg-canvas p-0.5 scrollbar-none", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-8 shrink-0 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
            value === o.value ? "bg-surface text-ink shadow-soft" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stars({ value, onChange, size = "md" }: { value: number; onChange?: (v: number) => void; size?: "sm" | "md" }) {
  return (
    <div className="flex gap-1" role={onChange ? "radiogroup" : undefined}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onClick={() => onChange?.(n)}
          className="rounded transition-transform disabled:cursor-default"
        >
          <Star className={cn(size === "sm" ? "size-4" : "size-7", n <= value ? "fill-amber-400 text-amber-400" : "text-line-strong")} />
        </button>
      ))}
    </div>
  );
}

// ── Feedback ────────────────────────────────────────────────────────────────
type Tone = "green" | "blue" | "amber" | "red" | "gray" | "purple";
const TONES: Record<Tone, string> = {
  green: "bg-brand-50 text-brand-800 ring-brand-200/70",
  blue: "bg-sea-50 text-sea-700 ring-sea-100",
  amber: "bg-amber-50 text-amber-800 ring-amber-200/70",
  red: "bg-red-50 text-red-700 ring-red-200/70",
  gray: "bg-canvas text-ink-2 ring-line-strong",
  purple: "bg-violet-50 text-violet-700 ring-violet-200/70",
};

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-black/[0.05]", className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-muted", className)} aria-label="Loading" />;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  text,
  action,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-lg bg-canvas text-muted" aria-hidden>
        <Icon className="size-5" />
      </span>
      <p className="font-medium">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-card border border-red-200 bg-red-50/70 p-4">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-red-600" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-red-900">{(error as Error)?.message ?? "Something went wrong"}</p>
        {onRetry && (
          <Button variant="secondary" size="sm" className="mt-3" icon={<RotateCw className="size-3.5" />} onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  color,
  className,
  label,
}: {
  value: number;
  max?: number;
  color?: string;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-black/[0.07]", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function ProgressRing({
  value,
  size = 56,
  stroke = 5,
  color = "var(--color-brand-600)",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-black/[0.08]" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon | ReactNode;
  tone?: IconTone;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] leading-snug font-medium text-balance text-muted">{label}</p>
          <p className="mt-1.5 text-2xl leading-tight font-semibold tracking-tight tabular-nums">{value}</p>
          {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
        </div>
        {icon && <IconBox icon={icon} tone={tone} size="sm" />}
      </div>
    </Card>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
      <div className="absolute inset-0 animate-fade bg-ink/35" onClick={onClose} />
      <div
        ref={panel}
        className={cn(
          "relative flex max-h-[92dvh] w-full animate-pop flex-col rounded-t-2xl border border-line bg-surface shadow-lift sm:rounded-card",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          <button data-close onClick={onClose} className="-mr-1.5 rounded-md p-1.5 text-muted transition-colors hover:bg-canvas hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3 pb-safe">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
