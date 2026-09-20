import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  ImageIcon,
  MapPin,
  Search,
  Star,
  ThumbsUp,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { StatusPill } from "@/components/PickupStatus";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageSkeleton,
  Segmented,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { get, post, qs } from "@/lib/api";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { cn, fmtDate, fmtKg, fmtNum, timeAgo } from "@/lib/format";
import { useToast } from "@/lib/toast";
import type { Paged, Pickup, PickupStatus } from "@/lib/types";

type AdminPickup = Omit<Pickup, "partner"> & { partner: { id: number; code: string } | null };
type Quality = "good" | "fair" | "poor";
interface AssignablePartner {
  id: number;
  code: string;
  vehicle: string | null;
  available: boolean;
  rating: number;
  distance_km: number;
}

const STATUSES: PickupStatus[] = ["requested", "assigned", "accepted", "on_the_way", "arrived", "collected", "verified", "completed", "cancelled"];
const STATUS_LABEL: Record<PickupStatus, string> = {
  requested: "Requested",
  assigned: "Partner assigned",
  accepted: "Accepted",
  on_the_way: "On the way",
  arrived: "Arrived",
  collected: "Collected",
  verified: "Verified",
  completed: "Completed",
  cancelled: "Cancelled",
};
const ASSIGNABLE: PickupStatus[] = ["requested", "assigned"];
const CANCELLABLE: PickupStatus[] = ["requested", "assigned", "accepted", "on_the_way", "arrived"];
const PAGE_SIZE = 20;

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function AdminPickups() {
  useDocumentTitle("Pickups & verification");
  const [tab, setTab] = useState<"queue" | "all">("queue");
  const [verifying, setVerifying] = useState<AdminPickup | null>(null);
  const [assigning, setAssigning] = useState<AdminPickup | null>(null);
  const [cancelling, setCancelling] = useState<AdminPickup | null>(null);

  const queue = useQuery({
    queryKey: ["admin", "pickups", "queue"],
    queryFn: () => get<Paged<AdminPickup>>(`/admin/pickups${qs({ status: "collected", size: 100 })}`),
  });

  const actions: RowActions = { onVerify: setVerifying, onAssign: setAssigning, onCancel: setCancelling };

  return (
    <div>
      <PageHeader title="Pickups & verification" subtitle="Weigh and verify collected waste, assign partners and manage every pickup." />
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-5"
        options={[
          {
            value: "queue",
            label: (
              <span className="flex items-center gap-2">
                Verification queue
                {!!queue.data?.total && (
                  <span className="rounded px-1.5 text-xs font-medium tabular-nums bg-amber-100 text-amber-800">{queue.data.total}</span>
                )}
              </span>
            ),
          },
          { value: "all", label: "All pickups" },
        ]}
      />

      {tab === "queue" ? <Queue q={queue} onVerify={setVerifying} /> : <AllPickups actions={actions} />}

      {verifying && <VerifyModal pickup={verifying} onClose={() => setVerifying(null)} />}
      {assigning && <AssignModal pickup={assigning} onClose={() => setAssigning(null)} />}
      {cancelling && <CancelModal pickup={cancelling} onClose={() => setCancelling(null)} />}
    </div>
  );
}

// ── Shared table chrome ──────────────────────────────────────────────────────
const TH = "eyebrow px-3 py-2 whitespace-nowrap first:pl-4 last:pr-4 last:sticky last:right-0 last:border-l last:border-line last:bg-surface";
const TD = "px-3 py-2.5 align-top first:pl-4 last:pr-4 last:sticky last:right-0 last:border-l last:border-line last:bg-surface";

// ── Verification queue ───────────────────────────────────────────────────────
function Queue({ q, onVerify }: { q: UseQueryResult<Paged<AdminPickup>>; onVerify: (p: AdminPickup) => void }) {
  const cats = useCategoryMap();
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.items.length)
    return <EmptyState icon={CheckCircle2} title="Queue is clear" text="Every collected pickup has been weighed and verified." />;

  const weights = (p: AdminPickup) => (
    <ul className="space-y-1">
      {p.items.map((i) => (
        <li key={i.category} className="flex items-baseline justify-between gap-4 text-[13px]">
          <span className="truncate">
            <span aria-hidden>{cats.map.get(i.category)?.emoji ?? ""}</span> {cats.name(i.category)}
          </span>
          <span className="shrink-0 tabular-nums text-muted">
            est. {fmtKg(i.estimated_kg)} <span className="text-ink">/ {i.actual_kg != null ? fmtKg(i.actual_kg) : "—"}</span>
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-3">
      {q.data.total > q.data.items.length && (
        <p className="text-[13px] text-muted">
          Showing the {q.data.items.length} most recent of {fmtNum(q.data.total)} pickups awaiting verification.
        </p>
      )}

      {/* Desktop table */}
      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={TH}>Pickup</th>
              <th scope="col" className={TH}>Customer</th>
              <th scope="col" className={TH}>Partner</th>
              <th scope="col" className={TH}>Estimated / reported</th>
              <th scope="col" className={TH}>Collected</th>
              <th scope="col" className={cn(TH, "text-right")}>Reported</th>
              <th scope="col" className={cn(TH, "text-right")}>Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {q.data.items.map((p) => (
              <tr key={p.code} className="transition-colors hover:bg-canvas/70">
                <td className={TD}>
                  <p className="font-mono font-medium">{p.code}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {p.address.city ?? "—"}
                    {p.purpose === "donate" && <Badge tone="gray">Donation</Badge>}
                  </p>
                </td>
                <td className={cn(TD, "font-mono")}>{p.customer?.code ?? "—"}</td>
                <td className={cn(TD, "font-mono")}>
                  {p.partner?.code ?? <span className="font-sans text-muted">Unassigned</span>}
                </td>
                <td className={cn(TD, "min-w-56")}>{weights(p)}</td>
                <td className={cn(TD, "whitespace-nowrap text-muted")}>
                  {p.updated_at ? timeAgo(p.updated_at) : fmtDate(p.scheduled_date)}
                  {p.proof_url && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs">
                      <ImageIcon className="size-3.5" aria-hidden /> Proof photo
                    </span>
                  )}
                </td>
                <td className={cn(TD, "text-right font-medium whitespace-nowrap tabular-nums")}>
                  {fmtKg(p.actual_total_kg ?? p.estimated_total_kg)}
                </td>
                <td className={cn(TD, "text-right")}>
                  <Button size="sm" icon={<ClipboardCheck className="size-4" />} onClick={() => onVerify(p)}>
                    Verify
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {q.data.items.map((p) => (
          <li key={p.code}>
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium">{p.code}</p>
                  <p className="text-[13px] text-muted">
                    Customer <span className="font-mono text-ink">{p.customer?.code ?? "—"}</span>
                    {p.partner && (
                      <>
                        {" · "}Partner <span className="font-mono text-ink">{p.partner.code}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusPill status={p.status} />
                  {p.purpose === "donate" && <Badge tone="gray">Donation</Badge>}
                </div>
              </div>
              <div className="mt-3 border-t border-line pt-3">{weights(p)}</div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                {p.address.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" aria-hidden /> {p.address.city}
                  </span>
                )}
                <span>Collected {p.updated_at ? timeAgo(p.updated_at) : fmtDate(p.scheduled_date)}</span>
                {p.proof_url && (
                  <span className="flex items-center gap-1">
                    <ImageIcon className="size-3.5" aria-hidden /> Proof photo
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2">
                <p className="text-sm text-muted">
                  Reported <span className="font-medium text-ink tabular-nums">{fmtKg(p.actual_total_kg ?? p.estimated_total_kg)}</span>
                </p>
                <Button size="sm" icon={<ClipboardCheck className="size-4" />} onClick={() => onVerify(p)}>
                  Verify
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── All pickups ──────────────────────────────────────────────────────────────
interface RowActions {
  onVerify: (p: AdminPickup) => void;
  onAssign: (p: AdminPickup) => void;
  onCancel: (p: AdminPickup) => void;
}

function AllPickups({ actions }: { actions: RowActions }) {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim());
  useEffect(() => {
    setPage(1);
  }, [status, q]);

  const list = useQuery({
    queryKey: ["admin", "pickups", "list", { status, q, page }],
    queryFn: () => get<Paged<AdminPickup>>(`/admin/pickups${qs({ status, q, page, size: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by pickup code"
            aria-label="Search by pickup code"
            className="pl-9"
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className="sm:w-56">
          <option value="">All statuses</option>
          <option value="active">Active (not completed or cancelled)</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>

      {list.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data.items.length ? (
        <EmptyState icon={Truck} title="No pickups found" text="Try another status or search term." />
      ) : (
        <>
          <PickupTable items={list.data.items} actions={actions} dim={list.isPlaceholderData} />
          <Pager page={list.data.page} pages={list.data.pages} total={list.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

function RowButtons({ p, actions }: { p: AdminPickup; actions: RowActions }) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {p.status === "collected" && (
        <Button size="sm" onClick={() => actions.onVerify(p)} icon={<ClipboardCheck className="size-4" />}>
          Verify
        </Button>
      )}
      {ASSIGNABLE.includes(p.status) && (
        <Button size="sm" variant="secondary" onClick={() => actions.onAssign(p)} icon={<Truck className="size-4" />}>
          {p.partner ? "Reassign" : "Assign"}
        </Button>
      )}
      {CANCELLABLE.includes(p.status) && (
        <Button size="sm" variant="ghost" onClick={() => actions.onCancel(p)} aria-label={`Cancel pickup ${p.code}`}>
          <XCircle className="size-4" /> Cancel
        </Button>
      )}
    </div>
  );
}

function PickupTable({ items, actions, dim }: { items: AdminPickup[]; actions: RowActions; dim: boolean }) {
  const cats = useCategoryMap();
  const itemsText = (p: AdminPickup) => (
    <span className="flex flex-wrap gap-1">
      {p.items.map((i) => (
        <span key={i.category} className="rounded-md bg-canvas px-1.5 py-0.5 text-xs" title={cats.name(i.category)}>
          <span aria-hidden>{cats.map.get(i.category)?.emoji ?? ""}</span>{" "}
          <span className="sr-only">{cats.name(i.category)} </span>
          <span className="tabular-nums">{fmtKg(i.verified_kg ?? i.actual_kg ?? i.estimated_kg)}</span>
        </span>
      ))}
    </span>
  );

  return (
    <div className={cn("transition-opacity", dim && "opacity-60")}>
      {/* Desktop table */}
      <Card className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={TH}>Pickup</th>
              <th scope="col" className={TH}>Customer</th>
              <th scope="col" className={TH}>Status</th>
              <th scope="col" className={TH}>Scheduled</th>
              <th scope="col" className={TH}>Items</th>
              <th scope="col" className={TH}>Partner</th>
              <th scope="col" className={cn(TH, "text-right")}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((p) => (
              <tr key={p.code} className="transition-colors hover:bg-canvas/70">
                <td className={TD}>
                  <p className="font-mono font-medium">{p.code}</p>
                  <p className="text-xs text-muted">{p.address.city ?? "—"}{p.purpose === "donate" ? " · Donation" : ""}</p>
                </td>
                <td className={cn(TD, "font-mono")}>{p.customer?.code ?? "—"}</td>
                <td className={TD}><StatusPill status={p.status} /></td>
                <td className={cn(TD, "whitespace-nowrap tabular-nums")}>
                  {fmtDate(p.scheduled_date, "en", { day: "numeric", month: "short" })}
                  <span className="block text-xs text-muted">{p.slot}</span>
                </td>
                <td className={TD}>{itemsText(p)}</td>
                <td className={cn(TD, "font-mono")}>{p.partner?.code ?? <span className="font-sans text-muted">Unassigned</span>}</td>
                <td className={cn(TD, "text-right")}><RowButtons p={p} actions={actions} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {items.map((p) => (
          <li key={p.code}>
            <Card className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono font-medium">{p.code}</p>
                  <p className="text-xs text-muted">
                    Customer <span className="font-mono">{p.customer?.code ?? "—"}</span> · {fmtDate(p.scheduled_date, "en", { day: "numeric", month: "short" })} · {p.slot}
                  </p>
                </div>
                <StatusPill status={p.status} />
              </div>
              <div className="mt-2">{itemsText(p)}</div>
              <p className="mt-2 text-xs text-muted">
                Partner: <span className="font-mono text-ink">{p.partner?.code ?? "Unassigned"}</span>
                {p.address.city ? ` · ${p.address.city}` : ""}
              </p>
              <div className="mt-3"><RowButtons p={p} actions={actions} /></div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages <= 1) return <p className="text-[13px] text-muted tabular-nums">{fmtNum(total)} pickups</p>;
  return (
    <nav className="flex items-center justify-between gap-2" aria-label="Pagination">
      <p className="text-[13px] text-muted tabular-nums">
        Page {page} of {pages} · {fmtNum(total)} pickups
      </p>
      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}

// ── Verify modal ─────────────────────────────────────────────────────────────
const QUALITY: { value: Quality; label: string; icon: LucideIcon; text: string }[] = [
  { value: "good", label: "Good", icon: Star, text: "Clean and well separated. Customer earns a +10% points bonus." },
  { value: "fair", label: "Fair", icon: ThumbsUp, text: "Mostly separated with minor issues. Standard points." },
  {
    value: "poor",
    label: "Poor",
    icon: CircleAlert,
    text: "Mixed or dirty waste. Customer gets a learning nudge and loses their segregation streak.",
  },
];

function VerifyModal({ pickup, onClose }: { pickup: AdminPickup; onClose: () => void }) {
  const cats = useCategoryMap();
  const toast = useToast();
  const qc = useQueryClient();
  const [kg, setKg] = useState<Record<string, string>>(() =>
    Object.fromEntries(pickup.items.map((i) => [i.category, String(i.actual_kg ?? i.estimated_kg)])),
  );
  const [quality, setQuality] = useState<Quality>("good");
  const [notes, setNotes] = useState("");

  const values = Object.entries(kg).map(([k, v]) => [k, Number(v)] as const);
  const invalid = values.some(([k, v]) => kg[k].trim() === "" || !Number.isFinite(v) || v < 0);
  const total = values.reduce((s, [, v]) => s + (Number.isFinite(v) ? v : 0), 0);

  const m = useMutation({
    mutationFn: () =>
      post(`/admin/pickups/${pickup.code}/verify`, {
        verified: Object.fromEntries(values),
        quality,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      toast({ tone: "success", title: `${pickup.code} verified · ${fmtKg(total)}` });
      qc.invalidateQueries({ queryKey: ["admin", "pickups"] });
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      onClose();
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Verify ${pickup.code}`}
      description="Points and impact are calculated from the verified weight only."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} disabled={invalid} onClick={() => m.mutate()} icon={<ClipboardCheck className="size-4" />}>
            Verify {fmtKg(total)}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-[13px] text-muted">
          Customer <span className="font-mono font-medium text-ink">{pickup.customer?.code ?? "—"}</span>
          {pickup.partner && (
            <>
              {" · "}collected by <span className="font-mono font-medium text-ink">{pickup.partner.code}</span>
            </>
          )}
        </p>

        {pickup.proof_url && (
          <figure>
            <a href={pickup.proof_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line">
              <img src={pickup.proof_url} alt={`Proof photo for pickup ${pickup.code}`} className="max-h-64 w-full bg-canvas object-contain" />
            </a>
            <figcaption className="mt-1.5 text-xs text-muted">Proof photo from the collection partner · opens full size</figcaption>
          </figure>
        )}

        <fieldset>
          <legend className="eyebrow mb-2">Verified weight per category</legend>
          <div className="overflow-hidden rounded-lg border border-line">
            <div className="divide-y divide-line">
              {pickup.items.map((i) => (
                <div key={i.category} className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      <span aria-hidden>{cats.map.get(i.category)?.emoji ?? ""}</span> {cats.name(i.category)}
                    </p>
                    <p className="text-xs text-muted tabular-nums">
                      Estimated {fmtKg(i.estimated_kg)} · Partner reported {i.actual_kg != null ? fmtKg(i.actual_kg) : "—"}
                    </p>
                  </div>
                  <label className="flex items-center gap-2">
                    <span className="sr-only">Verified kg for {cats.name(i.category)}</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.1}
                      value={kg[i.category] ?? ""}
                      onChange={(e) => setKg((s) => ({ ...s, [i.category]: e.target.value }))}
                      className="w-24 text-right tabular-nums"
                    />
                    <span className="text-[13px] text-muted">kg</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend className="eyebrow mb-2">Segregation quality</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {QUALITY.map((o) => (
              <label
                key={o.value}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/20",
                  quality === o.value
                    ? o.value === "poor"
                      ? "border-amber-300 bg-amber-50"
                      : "border-brand-500 bg-brand-50"
                    : "border-line hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name="quality"
                  value={o.value}
                  checked={quality === o.value}
                  onChange={() => setQuality(o.value)}
                  className="sr-only"
                />
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <o.icon className={cn("size-4", o.value === "poor" ? "text-amber-600" : "text-brand-700")} aria-hidden /> {o.label}
                </span>
                <span className="text-xs text-muted">{o.text}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Notes" optional="shown to the customer">
          {(id) => (
            <Textarea
              id={id}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              placeholder="e.g. Plastic had food residue — please rinse containers next time."
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}

// ── Assign modal ─────────────────────────────────────────────────────────────
function AssignModal({ pickup, onClose }: { pickup: AdminPickup; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const partners = useQuery({
    queryKey: ["admin", "pickups", pickup.code, "partners"],
    queryFn: () => get<AssignablePartner[]>(`/admin/pickups/${pickup.code}/partners`),
  });
  const chosen = partners.data?.find((p) => p.id === selected);

  const m = useMutation({
    mutationFn: () => post(`/admin/pickups/${pickup.code}/assign`, { partner_id: selected as number }),
    onSuccess: () => {
      toast({ tone: "success", title: `${pickup.code} offered to ${chosen?.code ?? "partner"}` });
      qc.invalidateQueries({ queryKey: ["admin", "pickups"] });
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      onClose();
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`${pickup.partner ? "Reassign" : "Assign"} ${pickup.code}`}
      description="Verified partners, nearest first. The partner receives an offer and must accept it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} disabled={selected == null} onClick={() => m.mutate()} icon={<Truck className="size-4" />}>
            Assign {chosen?.code ?? ""}
          </Button>
        </>
      }
    >
      {pickup.partner && (
        <p className="mb-3 text-[13px] text-muted">
          Currently offered to <span className="font-mono font-medium text-ink">{pickup.partner.code}</span>.
        </p>
      )}
      {partners.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : partners.isError ? (
        <ErrorState error={partners.error} onRetry={() => partners.refetch()} />
      ) : !partners.data.length ? (
        <EmptyState icon={Truck} title="No verified partners" text="Approve collection partners in Users & approvals first." />
      ) : (
        <div role="radiogroup" aria-label="Collection partner" className="space-y-2">
          {partners.data.map((p) => (
            <label
              key={p.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/20",
                selected === p.id ? "border-brand-500 bg-brand-50" : "border-line hover:border-line-strong",
              )}
            >
              <input
                type="radio"
                name="partner"
                checked={selected === p.id}
                onChange={() => setSelected(p.id)}
                className="size-4 accent-brand-700"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-medium">{p.code}</span>
                  {p.id === pickup.partner?.id && <Badge tone="blue">Current</Badge>}
                  {p.available ? <Badge tone="green">Available</Badge> : <Badge tone="gray">Offline</Badge>}
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                  {p.vehicle ?? "Vehicle not set"}
                  <span className="flex items-center gap-0.5">
                    <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                    <span className="tabular-nums">{p.rating.toFixed(1)}</span>
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums">{p.distance_km.toLocaleString("en-IN")} km</span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ── Cancel modal ─────────────────────────────────────────────────────────────
function CancelModal({ pickup, onClose }: { pickup: AdminPickup; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => post(`/admin/pickups/${pickup.code}/cancel`),
    onSuccess: () => {
      toast({ tone: "success", title: `${pickup.code} cancelled` });
      qc.invalidateQueries({ queryKey: ["admin", "pickups"] });
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      onClose();
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Cancel ${pickup.code}?`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep pickup
          </Button>
          <Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>
            Cancel pickup
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        The customer (<span className="font-mono text-ink">{pickup.customer?.code ?? "—"}</span>)
        {pickup.partner ? " and the assigned partner" : ""} will be notified that Swacchify support cancelled this pickup
        scheduled for {fmtDate(pickup.scheduled_date)} ({pickup.slot}). This can't be undone.
      </p>
    </Modal>
  );
}
