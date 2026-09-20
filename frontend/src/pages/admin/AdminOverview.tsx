import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ClipboardCheck,
  Factory,
  MapPin as MapPinIcon,
  MessageSquareText,
  TriangleAlert,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MapView, type MapPin } from "@/components/MapView";
import { Card, EmptyState, ErrorState, PageHeader, PageSkeleton, SectionTitle } from "@/components/ui";
import { get } from "@/lib/api";
import { useDocumentTitle } from "@/lib/hooks";
import { cn, fmtKg, fmtNum } from "@/lib/format";

// ── Response shape (GET /admin/overview) ─────────────────────────────────────
interface Overview {
  kpis: {
    total_users: number;
    customers: number;
    active_users_30d: number;
    households: number;
    partners: number;
    partners_pending: number;
    recyclers: number;
    recyclers_pending: number;
    pickups_total: number;
    pickups_completed: number;
    pickups_pending: number;
    awaiting_verification: number;
    waste_collected_kg: number;
    rewards_distributed: number;
    ai_questions: number;
    lessons_completed: number;
    video_completion_rate: number;
    retention_7d: number;
    orders_pending: number;
  };
  waste_by_category: { category: string; name: string; color: string; emoji: string; kg: number }[];
  trend: {
    month: string;
    pickups: number;
    completed: number;
    kg: number;
    ewaste_kg: number;
    new_users: number;
    lessons: number;
    quizzes: number;
    points: number;
    active_households: number;
  }[];
  cities: { city: string | null; pickups: number; lat: number | null; lng: number | null }[];
  top_questions: { item: string; name: string; count: number }[];
}

// ── Chart system ─────────────────────────────────────────────────────────────
// Two series colours only: brand green and sea blue. Category charts keep the
// colour the API sends for each waste stream.
const C = { brand: "#1f6d46", sea: "#2a78d6", grid: "#e5eae7", axis: "#66756d" };
const axis = { tickLine: false, axisLine: false, tick: { fill: C.axis, fontSize: 12 } } as const;
const compact = (n: number) =>
  Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}k` : n.toLocaleString("en-IN");

interface TipEntry {
  name?: string | number;
  value?: unknown;
  color?: string;
  payload?: { color?: string };
}

function ChartTip({
  active,
  payload,
  label,
  fmt = (v) => fmtNum(v),
}: {
  active?: boolean;
  payload?: readonly TipEntry[];
  label?: string | number;
  fmt?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] shadow-lift">
      {label !== undefined && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2">
          <span className="size-2 rounded-sm" style={{ background: p.payload?.color ?? p.color }} aria-hidden />
          <span className="text-muted">{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums">{fmt(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Card wrapper for a chart. Always pairs the chart with an accessible data table. */
function ChartCard({
  title,
  subtitle,
  legend,
  columns,
  rows,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  legend?: { label: string; color: string }[];
  columns: string[];
  rows: (string | number)[][];
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card as="section" className={cn("p-4 sm:p-5", className)} aria-label={title}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>
        </div>
        {legend && <Legend items={legend} />}
      </div>
      <div className="h-56">{children}</div>
      <details className="mt-2">
        <summary className="cursor-pointer rounded-md py-1 text-[13px] text-muted transition-colors hover:text-ink">
          View data table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line">
                {columns.map((c, i) => (
                  <th key={c} className={cn("eyebrow py-2", i && "text-right")} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((v, ci) => (
                    <td key={ci} className={cn("py-2", ci && "text-right tabular-nums")}>
                      {typeof v === "number" ? fmtNum(v) : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

const grid = <CartesianGrid vertical={false} stroke={C.grid} />;

function SingleBars({ data, dataKey, name, color, fmt }: { data: object[]; dataKey: string; name: string; color: string; fmt?: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        {grid}
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} width={44} allowDecimals={false} tickFormatter={compact} />
        <Tooltip cursor={{ fill: "rgb(16 22 19 / 0.04)" }} content={<ChartTip fmt={fmt} />} />
        <Bar dataKey={dataKey} name={name} fill={color} radius={[3, 3, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Metric grid ──────────────────────────────────────────────────────────────
interface MetricDef {
  label: string;
  value: string;
  hint?: string;
}

/** Dense label / number / hint grid — the back-office reading of a KPI row. */
function MetricGrid({ metrics }: { metrics: MetricDef[] }) {
  // Filler cells keep the hairline grid rectangular when the last row is short.
  const padWide = (4 - (metrics.length % 4)) % 4;
  const padNarrow = metrics.length % 2;
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="bg-surface p-4">
            <p className="text-[13px] font-medium text-muted">{m.label}</p>
            <p className="mt-2 text-[26px] leading-none font-semibold tracking-tight tabular-nums">{m.value}</p>
            <p className="mt-2 text-xs text-muted">{m.hint ?? " "}</p>
          </div>
        ))}
        {padNarrow > 0 && <div className="bg-surface lg:hidden" aria-hidden />}
        {Array.from({ length: padWide }, (_, i) => (
          <div key={`pad-${i}`} className="hidden bg-surface lg:block" aria-hidden />
        ))}
      </div>
    </Card>
  );
}

/** Horizontal share bar used by the "top questions" and "cities" lists. */
function ShareRow({ label, value, pct }: { label: ReactNode; value: string; pct: number }) {
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 font-medium tabular-nums">{value}</span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-black/[0.06]" aria-hidden>
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminOverview() {
  useDocumentTitle("Admin overview");
  const q = useQuery({ queryKey: ["admin", "overview"], queryFn: () => get<Overview>("/admin/overview") });

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const { kpis: k, trend, waste_by_category, cities, top_questions } = q.data;
  const pendingAccounts = k.partners_pending + k.recyclers_pending;
  const attention = [
    k.awaiting_verification > 0 && {
      to: "/admin/pickups",
      icon: ClipboardCheck,
      text: `${fmtNum(k.awaiting_verification)} pickup${k.awaiting_verification === 1 ? "" : "s"} awaiting warehouse verification`,
    },
    pendingAccounts > 0 && {
      to: "/admin/users?status=pending",
      icon: UserCheck,
      text: `${fmtNum(pendingAccounts)} partner/recycler account${pendingAccounts === 1 ? "" : "s"} pending approval`,
    },
    k.orders_pending > 0 && {
      to: "/admin/orders",
      icon: Factory,
      text: `${fmtNum(k.orders_pending)} recycler order${k.orders_pending === 1 ? "" : "s"} to approve`,
    },
  ].filter(Boolean) as { to: string; icon: LucideIcon; text: string }[];

  const operations: MetricDef[] = [
    { label: "Waste collected", value: fmtKg(k.waste_collected_kg), hint: "Verified weight, all time" },
    { label: "Pickup requests", value: fmtNum(k.pickups_total), hint: `${fmtNum(k.pickups_pending)} still open` },
    {
      label: "Pickups completed",
      value: fmtNum(k.pickups_completed),
      hint: k.pickups_total ? `${Math.round((100 * k.pickups_completed) / k.pickups_total)}% of requests` : undefined,
    },
    { label: "Awaiting verification", value: fmtNum(k.awaiting_verification), hint: "Collected, not yet weighed" },
    { label: "Pending pickups", value: fmtNum(k.pickups_pending), hint: "Not completed or cancelled" },
    { label: "Rewards distributed", value: `${fmtNum(k.rewards_distributed)} pts`, hint: "Credited to households" },
    { label: "Recycler orders pending", value: fmtNum(k.orders_pending), hint: "Awaiting an allocation decision" },
    { label: "Households", value: fmtNum(k.households), hint: "Registered households" },
  ];

  const people: MetricDef[] = [
    { label: "Total users", value: fmtNum(k.total_users), hint: `${fmtNum(k.customers)} household members` },
    { label: "Active users (30 days)", value: fmtNum(k.active_users_30d), hint: "Signed in or acted recently" },
    {
      label: "Collection partners",
      value: fmtNum(k.partners),
      hint: k.partners_pending ? `${fmtNum(k.partners_pending)} pending approval` : "All reviewed",
    },
    {
      label: "Recyclers",
      value: fmtNum(k.recyclers),
      hint: k.recyclers_pending ? `${fmtNum(k.recyclers_pending)} pending approval` : "All reviewed",
    },
    { label: "AI questions asked", value: fmtNum(k.ai_questions), hint: "All time" },
    {
      label: "Video completion rate",
      value: `${k.video_completion_rate}%`,
      hint: `${fmtNum(k.lessons_completed)} lessons completed`,
    },
    { label: "7-day retention", value: `${k.retention_7d}%`, hint: "Customers active in the last week" },
  ];

  const cats = [...waste_by_category]
    .sort((a, b) => b.kg - a.kg)
    .map((c) => ({ ...c, label: `${c.emoji} ${c.name}`, kgLabel: fmtKg(c.kg) }));
  const catTotal = cats.reduce((s, c) => s + c.kg, 0);
  const ewasteColor = waste_by_category.find((c) => c.category === "ewaste")?.color ?? C.brand;

  const cityRows = [...cities].filter((c) => c.pickups > 0).sort((a, b) => b.pickups - a.pickups);
  const maxCity = Math.max(1, ...cityRows.map((c) => c.pickups));
  const pins: MapPin[] = cityRows
    .filter((c) => c.lat != null && c.lng != null)
    .map((c) => ({
      id: c.city ?? "unknown",
      lat: c.lat as number,
      lng: c.lng as number,
      emoji: "",
      color: c.pickups >= maxCity * 0.66 ? "#13472e" : c.pickups >= maxCity * 0.33 ? "#1f6d46" : "#7cc095",
      label: `${c.city ?? "Unknown"} · ${fmtNum(c.pickups)} pickups`,
      popup: (
        <span>
          <strong>{c.city ?? "Unknown"}</strong>
          <br />
          {fmtNum(c.pickups)} pickups
        </span>
      ),
    }));
  const maxQ = Math.max(1, ...top_questions.map((t) => t.count));

  return (
    <div className="space-y-8">
      <PageHeader title="Overview" subtitle="How Swacchify is doing across households, partners and recyclers." />

      {attention.length > 0 && (
        <section aria-label="Needs attention" className="rounded-card border border-amber-200 bg-amber-50/50 shadow-soft">
          <p className="eyebrow flex items-center gap-2 border-b border-amber-200/70 px-4 py-2.5 text-amber-800">
            <TriangleAlert className="size-3.5" aria-hidden /> Needs attention
          </p>
          <ul className="divide-y divide-amber-200/60">
            {attention.map((a) => (
              <li key={a.to}>
                <Link
                  to={a.to}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-amber-100/40"
                >
                  <a.icon className="size-4 shrink-0 text-amber-700" aria-hidden />
                  <span className="min-w-0 flex-1 text-ink">{a.text}</span>
                  <span className="shrink-0 text-[13px] font-medium text-amber-900">Review</span>
                  <ChevronRight className="size-4 shrink-0 text-amber-700" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* KPIs */}
      <section aria-labelledby="kpi-impact">
        <h2 id="kpi-impact" className="eyebrow mb-2.5">
          Impact &amp; operations
        </h2>
        <MetricGrid metrics={operations} />
      </section>

      <section aria-labelledby="kpi-people">
        <h2 id="kpi-people" className="eyebrow mb-2.5">
          People &amp; engagement
        </h2>
        <MetricGrid metrics={people} />
      </section>

      {/* Charts */}
      <section aria-labelledby="trends" className="space-y-4">
        <SectionTitle>
          <span id="trends">Trends · last 6 months</span>
        </SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Waste collected"
            subtitle="Verified weight per month, in kg"
            columns={["Month", "kg"]}
            rows={trend.map((t) => [t.month, t.kg])}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                {grid}
                <XAxis dataKey="month" {...axis} />
                <YAxis {...axis} width={44} tickFormatter={compact} />
                <Tooltip cursor={{ stroke: C.grid }} content={<ChartTip fmt={(v) => fmtKg(v)} />} />
                <Area
                  type="monotone"
                  dataKey="kg"
                  name="Collected"
                  stroke={C.brand}
                  strokeWidth={2}
                  fill={C.brand}
                  fillOpacity={0.08}
                  activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Pickups requested vs completed"
            subtitle="Number of pickup requests created and completed each month"
            legend={[
              { label: "Requested", color: C.sea },
              { label: "Completed", color: C.brand },
            ]}
            columns={["Month", "Requested", "Completed"]}
            rows={trend.map((t) => [t.month, t.pickups, t.completed])}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} barGap={2} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                {grid}
                <XAxis dataKey="month" {...axis} />
                <YAxis {...axis} width={44} allowDecimals={false} tickFormatter={compact} />
                <Tooltip cursor={{ fill: "rgb(16 22 19 / 0.04)" }} content={<ChartTip />} />
                <Bar dataKey="pickups" name="Requested" fill={C.sea} radius={[3, 3, 0, 0]} maxBarSize={20} />
                <Bar dataKey="completed" name="Completed" fill={C.brand} radius={[3, 3, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Waste by category"
            subtitle={`All-time verified weight per stream, in kg · ${fmtKg(catTotal)} total`}
            columns={["Category", "kg"]}
            rows={cats.map((c) => [c.label, c.kg])}
          >
            {catTotal > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cats} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke={C.grid} />
                  <XAxis type="number" {...axis} tickFormatter={compact} />
                  <YAxis type="category" dataKey="label" {...axis} width={140} interval={0} />
                  <Tooltip cursor={{ fill: "rgb(16 22 19 / 0.04)" }} content={<ChartTip fmt={(v) => fmtKg(v)} />} />
                  <Bar dataKey="kg" name="Collected" radius={[0, 3, 3, 0]} maxBarSize={18}>
                    {cats.map((c) => (
                      <Cell key={c.category} fill={c.color} />
                    ))}
                    <LabelList dataKey="kgLabel" position="right" fill={C.axis} fontSize={12} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted">No verified waste yet.</div>
            )}
          </ChartCard>

          <ChartCard
            title="New households signing up"
            subtitle="New customer accounts created per month"
            columns={["Month", "New users"]}
            rows={trend.map((t) => [t.month, t.new_users])}
          >
            <SingleBars data={trend} dataKey="new_users" name="New users" color={C.sea} />
          </ChartCard>

          <ChartCard
            title="Learning engagement"
            subtitle="Lessons completed and quizzes taken per month, in counts"
            legend={[
              { label: "Lessons", color: C.brand },
              { label: "Quizzes", color: C.sea },
            ]}
            columns={["Month", "Lessons", "Quizzes"]}
            rows={trend.map((t) => [t.month, t.lessons, t.quizzes])}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                {grid}
                <XAxis dataKey="month" {...axis} />
                <YAxis {...axis} width={44} allowDecimals={false} tickFormatter={compact} />
                <Tooltip cursor={{ stroke: C.grid }} content={<ChartTip />} />
                <Line type="monotone" dataKey="lessons" name="Lessons" stroke={C.brand} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: "#fff", fill: C.brand }} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
                <Line type="monotone" dataKey="quizzes" name="Quizzes" stroke={C.sea} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: "#fff", fill: C.sea }} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Reward points distributed"
            subtitle="Points credited to households per month"
            columns={["Month", "Points"]}
            rows={trend.map((t) => [t.month, t.points])}
          >
            <SingleBars data={trend} dataKey="points" name="Points" color={C.brand} fmt={(v) => `${fmtNum(v)} pts`} />
          </ChartCard>

          <ChartCard
            title="E-waste collected"
            subtitle="Verified weight of electronics per month, in kg"
            columns={["Month", "kg"]}
            rows={trend.map((t) => [t.month, t.ewaste_kg])}
          >
            <SingleBars data={trend} dataKey="ewaste_kg" name="E-waste" color={ewasteColor} fmt={(v) => fmtKg(v)} />
          </ChartCard>

          <ChartCard
            title="Active households"
            subtitle="Households with at least one verified pickup that month"
            columns={["Month", "Households"]}
            rows={trend.map((t) => [t.month, t.active_households])}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                {grid}
                <XAxis dataKey="month" {...axis} />
                <YAxis {...axis} width={44} allowDecimals={false} tickFormatter={compact} />
                <Tooltip cursor={{ stroke: C.grid }} content={<ChartTip />} />
                <Line type="monotone" dataKey="active_households" name="Active households" stroke={C.brand} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: "#fff", fill: C.brand }} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card as="section" className="p-4 sm:p-5 lg:col-span-2" aria-labelledby="top-q">
          <h3 id="top-q" className="text-[15px] font-semibold">
            Top questions
          </h3>
          <p className="mt-0.5 mb-2 text-[13px] text-muted">Items people ask the AI assistant about most, by answer count</p>
          {top_questions.length ? (
            <ol className="divide-y divide-line">
              {top_questions.map((t, i) => (
                <li key={t.item}>
                  <ShareRow
                    label={
                      <>
                        <span className="mr-2 text-muted tabular-nums">{i + 1}.</span>
                        <span className="font-medium">{t.name}</span>
                      </>
                    }
                    value={fmtNum(t.count)}
                    pct={(100 * t.count) / maxQ}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState icon={MessageSquareText} title="No questions yet" text="Questions matched to an item will appear here." />
          )}
          <Link to="/admin/ai" className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 transition-colors hover:text-brand-800">
            Open AI insights <ChevronRight className="size-4" aria-hidden />
          </Link>
        </Card>

        <Card as="section" className="p-4 sm:p-5 lg:col-span-3" aria-labelledby="geo">
          <h3 id="geo" className="text-[15px] font-semibold">
            Geographical distribution
          </h3>
          <p className="mt-0.5 mb-3 text-[13px] text-muted">Pickup requests by city, in counts · darker pin = more pickups</p>
          {cityRows.length ? (
            <div className="grid gap-4 md:grid-cols-5">
              <MapView pins={pins} className="h-64 md:col-span-3 md:h-72" />
              <ul className="divide-y divide-line md:col-span-2" aria-label="Pickups by city">
                {cityRows.map((c) => (
                  <li key={c.city ?? "unknown"}>
                    <ShareRow
                      label={<span className="font-medium">{c.city ?? "Unknown"}</span>}
                      value={fmtNum(c.pickups)}
                      pct={(100 * c.pickups) / maxCity}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState icon={MapPinIcon} title="No pickups yet" text="Cities appear once households request pickups." />
          )}
        </Card>
      </div>
    </div>
  );
}
