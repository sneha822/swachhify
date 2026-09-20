import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, FileText, Factory, IndianRupee, Truck, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Modal, PageHeader, PageSkeleton, ProgressBar, Select, SectionTitle, Skeleton, Textarea } from "@/components/ui";
import { get, post } from "@/lib/api";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { cn, fmtDate, fmtKg, fmtMoney } from "@/lib/format";
import { useToast } from "@/lib/toast";

type OrderStatus = "requested" | "approved" | "dispatched" | "received" | "processed" | "rejected" | "cancelled";
interface Order {
  code: string;
  category: string;
  quantity_kg: number;
  allocated_kg: number | null;
  price_per_kg: number;
  processing_method: string | null;
  status: OrderStatus;
  notes: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string | null;
  source_pickups: number;
  invoice_number: string | null;
  org_name: string | null;
}
interface Inventory {
  category: string;
  name: string;
  emoji: string;
  color: string;
  available_kg: number;
  requested_kg: number;
}
interface InvoiceInfo {
  invoice_number: string;
  status: string;
  total: number;
  paid_at: string | null;
}

const STATUS: Record<OrderStatus, { label: string; tone: "gray" | "amber" | "blue" | "green" | "red" }> = {
  requested: { label: "Awaiting approval", tone: "amber" },
  approved: { label: "Approved", tone: "blue" },
  dispatched: { label: "Dispatched", tone: "blue" },
  received: { label: "Received", tone: "blue" },
  processed: { label: "Processed", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  cancelled: { label: "Cancelled", tone: "gray" },
};

const TH = "eyebrow px-3 py-2 whitespace-nowrap first:pl-4 last:pr-4 last:sticky last:right-0 last:border-l last:border-line last:bg-surface";
const TD = "px-3 py-2.5 align-top first:pl-4 last:pr-4 last:sticky last:right-0 last:border-l last:border-line last:bg-surface";

export default function AdminOrders() {
  useDocumentTitle("Recycler orders");
  const cats = useCategoryMap();
  const [status, setStatus] = useState("");
  const [deciding, setDeciding] = useState<{ order: Order; approve: boolean } | null>(null);
  const q = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: () => get<{ orders: Order[]; inventory: Inventory[] }>("/admin/orders"),
  });

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const { orders, inventory } = q.data;
  const inv = new Map(inventory.map((i) => [i.category, i]));
  const shown = status ? orders.filter((o) => o.status === status) : orders;
  const pending = orders.filter((o) => o.status === "requested").length;

  return (
    <div className="space-y-8">
      <PageHeader title="Recycler orders" subtitle="Allocate verified hub material to authorised recyclers and track invoices." />

      <section aria-labelledby="inv">
        <SectionTitle>
          <span id="inv">Hub inventory</span>
        </SectionTitle>
        <p className="-mt-1.5 mb-3 text-[13px] text-muted">Verified, unallocated recyclable material, in kg. Donations are excluded.</p>
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={TH}>Category</th>
                <th scope="col" className={cn(TH, "text-right")}>Available</th>
                <th scope="col" className={cn(TH, "text-right")}>Requested</th>
                <th scope="col" className={cn(TH, "hidden w-48 sm:table-cell")}>Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {inventory.map((i) => {
                const short = i.requested_kg - i.available_kg;
                const pct = i.available_kg > 0 ? Math.min(100, (100 * i.requested_kg) / i.available_kg) : i.requested_kg > 0 ? 100 : 0;
                return (
                  <tr key={i.category} className="transition-colors hover:bg-canvas/70">
                    <td className={cn(TD, "align-middle")}>
                      <span className="flex items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: i.color }} aria-hidden />
                        <span aria-hidden>{i.emoji}</span>
                        <span className="font-medium">{i.name}</span>
                      </span>
                    </td>
                    <td className={cn(TD, "text-right align-middle font-medium whitespace-nowrap tabular-nums")}>{fmtKg(i.available_kg)}</td>
                    <td className={cn(TD, "text-right align-middle whitespace-nowrap tabular-nums")}>
                      {i.requested_kg > 0 ? (
                        <>
                          <span className={short > 0 ? "font-medium text-amber-700" : undefined}>{fmtKg(i.requested_kg)}</span>
                          {short > 0 && <span className="block text-xs text-amber-700">Short by {fmtKg(short)}</span>}
                        </>
                      ) : (
                        <span className="text-muted">No open requests</span>
                      )}
                    </td>
                    <td className={cn(TD, "hidden align-middle sm:table-cell")}>
                      <ProgressBar
                        value={pct}
                        color={short > 0 ? "#d97706" : undefined}
                        label={`${fmtKg(i.requested_kg)} requested of ${fmtKg(i.available_kg)} available`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </section>

      <section aria-labelledby="orders">
        <SectionTitle
          action={
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter orders by status" className="h-9 w-56 text-[13px]">
              <option value="">All orders ({orders.length})</option>
              {(Object.keys(STATUS) as OrderStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS[s].label}
                  {s === "requested" && pending ? ` (${pending})` : ""}
                </option>
              ))}
            </Select>
          }
        >
          <span id="orders">Orders</span>
        </SectionTitle>

        {!shown.length ? (
          <EmptyState
            icon={Factory}
            title={status ? "No orders with this status" : "No orders yet"}
            text="Verified recyclers request material from the hub here."
          />
        ) : (
          <>
            {/* Desktop table */}
            <Card className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className={TH}>Order</th>
                    <th scope="col" className={TH}>Recycler</th>
                    <th scope="col" className={TH}>Category</th>
                    <th scope="col" className={cn(TH, "text-right")}>Quantity</th>
                    <th scope="col" className={cn(TH, "text-right")}>Price / kg</th>
                    <th scope="col" className={TH}>Status</th>
                    <th scope="col" className={cn(TH, "text-right")}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((o) => (
                    <tr key={o.code} className="transition-colors hover:bg-canvas/70">
                      <td className={TD}>
                        <p className="font-mono font-medium">{o.code}</p>
                        <p className="text-xs text-muted tabular-nums">{fmtDate(o.created_at)}</p>
                      </td>
                      <td className={TD}>
                        <p className="font-medium">{o.org_name ?? "—"}</p>
                        {o.processing_method && <p className="text-xs text-muted">{o.processing_method}</p>}
                      </td>
                      <td className={cn(TD, "whitespace-nowrap")}>
                        <span aria-hidden>{cats.map.get(o.category)?.emoji}</span> {cats.name(o.category)}
                      </td>
                      <td className={cn(TD, "text-right tabular-nums whitespace-nowrap")}>
                        {fmtKg(o.quantity_kg)}
                        {o.allocated_kg != null && o.allocated_kg !== o.quantity_kg && (
                          <span className="block text-xs text-muted">{fmtKg(o.allocated_kg)} sent</span>
                        )}
                      </td>
                      <td className={cn(TD, "text-right tabular-nums")}>{fmtMoney(o.price_per_kg)}</td>
                      <td className={TD}>
                        <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
                        {o.admin_note && <p className="mt-1 max-w-48 text-xs text-muted">{o.admin_note}</p>}
                      </td>
                      <td className={cn(TD, "text-right")}>
                        <OrderActions o={o} available={inv.get(o.category)?.available_kg ?? 0} onDecide={(approve) => setDeciding({ order: o, approve })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Mobile / tablet cards */}
            <ul className="space-y-3 lg:hidden">
              {shown.map((o) => (
                <li key={o.code}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{o.org_name ?? "—"}</p>
                        <p className="font-mono text-xs text-muted">
                          {o.code} · {fmtDate(o.created_at)}
                        </p>
                      </div>
                      <Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted">Category</dt>
                        <dd>
                          <span aria-hidden>{cats.map.get(o.category)?.emoji}</span> {cats.name(o.category)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Quantity</dt>
                        <dd className="tabular-nums">{fmtKg(o.quantity_kg)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Price / kg</dt>
                        <dd className="tabular-nums">{fmtMoney(o.price_per_kg)}</dd>
                      </div>
                    </dl>
                    {o.admin_note && <p className="mt-2 text-xs text-muted">Note: {o.admin_note}</p>}
                    <div className="mt-3">
                      <OrderActions o={o} available={inv.get(o.category)?.available_kg ?? 0} onDecide={(approve) => setDeciding({ order: o, approve })} />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {deciding && (
        <DecisionModal
          order={deciding.order}
          approve={deciding.approve}
          available={inv.get(deciding.order.category)?.available_kg ?? 0}
          onClose={() => setDeciding(null)}
        />
      )}
    </div>
  );
}

function OrderActions({ o, available, onDecide }: { o: Order; available: number; onDecide: (approve: boolean) => void }) {
  if (o.status === "requested")
    return (
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button size="sm" onClick={() => onDecide(true)} disabled={available <= 0} title={available <= 0 ? "No verified material in stock" : undefined} icon={<Truck className="size-4" />}>
          Approve & dispatch
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onDecide(false)} icon={<X className="size-4" />}>
          Reject
        </Button>
      </div>
    );
  if (o.invoice_number) return <InvoiceActions number={o.invoice_number} />;
  return null;
}

function InvoiceActions({ number }: { number: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  // Order rows don't carry invoice status, so look it up (admins can read any invoice).
  const inv = useQuery({
    queryKey: ["admin", "invoice", number],
    queryFn: () => get<InvoiceInfo>(`/industries/invoices/${number}`),
    staleTime: 60_000,
  });
  const paid = useMutation({
    mutationFn: () => post(`/admin/invoices/${number}/paid`),
    onSuccess: () => {
      toast({ tone: "success", title: `Invoice ${number} marked paid` });
      qc.invalidateQueries({ queryKey: ["admin", "invoice", number] });
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });
  const isPaid = inv.data?.status === "paid";

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Link
        to={`/admin/invoices/${number}`}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-mono text-[13px] font-medium text-sea-700 transition-colors hover:bg-sea-50"
      >
        <FileText className="size-4" aria-hidden /> {number}
      </Link>
      {inv.isPending ? (
        <Skeleton className="h-8 w-24" />
      ) : isPaid ? (
        <Badge tone="green">
          <Check className="size-3" aria-hidden /> Paid
        </Badge>
      ) : (
        <Button size="sm" variant="soft" loading={paid.isPending} onClick={() => paid.mutate()} icon={<IndianRupee className="size-4" />}>
          Mark paid{inv.data ? ` · ${fmtMoney(inv.data.total)}` : ""}
        </Button>
      )}
    </div>
  );
}

function DecisionModal({ order, approve, available, onClose }: { order: Order; approve: boolean; available: number; onClose: () => void }) {
  const cats = useCategoryMap();
  const toast = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const noteRequired = !approve;
  const sendable = Math.min(order.quantity_kg, available);

  const m = useMutation({
    mutationFn: () => post(`/admin/orders/${order.code}/decision`, { approve, note: note.trim() || null }),
    onSuccess: () => {
      toast({ tone: "success", title: approve ? `${order.code} approved and dispatched` : `${order.code} rejected` });
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      qc.invalidateQueries({ queryKey: ["admin", "overview"] });
      onClose();
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  const submit = () => {
    setTouched(true);
    if (noteRequired && !note.trim()) return;
    m.mutate();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={approve ? `Approve & dispatch ${order.code}` : `Reject ${order.code}`}
      description={order.org_name ?? "Recycler"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={approve ? "primary" : "danger"} loading={m.isPending} onClick={submit}>
            {approve ? `Dispatch ${fmtKg(sendable)}` : "Reject order"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-line bg-canvas p-3 text-[13px]">
          <p className="text-ink-2 tabular-nums">
            {fmtKg(order.quantity_kg)} of {cats.name(order.category)} at {fmtMoney(order.price_per_kg)}/kg
            {order.processing_method ? ` · ${order.processing_method}` : ""}
          </p>
          {order.notes && <p className="mt-2 text-muted">“{order.notes}”</p>}
        </div>
        {approve ? (
          <p className="text-[13px] text-muted">
            Verified material is allocated oldest-first from completed pickups, marked as dispatched and an invoice is raised
            for <span className="font-medium text-ink tabular-nums">{fmtMoney(sendable * order.price_per_kg)}</span> + 18% GST.
            Households whose waste is included get notified.
            {available < order.quantity_kg && (
              <span className="mt-2 flex items-start gap-1.5 font-medium text-amber-700">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                Only {fmtKg(available)} is available — the order will be partially fulfilled.
              </span>
            )}
          </p>
        ) : null}
        <Field
          label={approve ? "Note to recycler" : "Reason for rejection"}
          optional={approve ? "optional" : undefined}
          hint={approve ? "Shown to the recycler with the dispatch notice." : undefined}
          error={touched && noteRequired && !note.trim() ? "Please tell the recycler why" : undefined}
        >
          {(id) => (
            <Textarea
              id={id}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder={approve ? "e.g. Dispatch on Thursday's truck." : "e.g. Authorisation number could not be verified."}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}
