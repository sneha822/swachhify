import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCheck, FileText, Package, PackageCheck, PackagePlus, Recycle, X } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, LinkButton, Modal, PageHeader, PageSkeleton, Segmented } from "@/components/ui";
import { get, post } from "@/lib/api";
import { cn, fmtDate, fmtKg, fmtMoney } from "@/lib/format";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import type { IndustryOrder, OrderStatus } from "./RecyclerHome";

const STATUS: Record<OrderStatus, { label: string; tone: "green" | "blue" | "amber" | "red" | "gray" | "purple" }> = {
  requested: { label: "Awaiting approval", tone: "amber" },
  approved: { label: "Approved", tone: "blue" },
  dispatched: { label: "Dispatched", tone: "blue" },
  received: { label: "Received", tone: "purple" },
  processed: { label: "Processed", tone: "green" },
  rejected: { label: "Not approved", tone: "red" },
  cancelled: { label: "Cancelled", tone: "gray" },
};

const STEPS = [
  { key: "requested", label: "Requested" },
  { key: "dispatched", label: "Approved & dispatched" },
  { key: "received", label: "Received" },
  { key: "processed", label: "Processed" },
] as const;

const STEP_INDEX: Partial<Record<OrderStatus, number>> = { requested: 0, approved: 1, dispatched: 1, received: 2, processed: 3 };

function OrderStepper({ status }: { status: OrderStatus }) {
  const idx = STEP_INDEX[status];
  if (idx == null) return null;
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Order progress">
      {STEPS.map((s, i) => {
        const done = i < idx || (i === idx && status === "processed");
        const current = i === idx && !done;
        return (
          <li key={s.key} className="min-w-0" aria-current={current ? "step" : undefined}>
            <span className={cn("block h-1 rounded-full", done || current ? "bg-brand-600" : "bg-line-strong")} />
            <span className={cn("mt-1.5 flex items-center gap-1 text-xs", done || current ? "font-medium text-ink" : "text-muted")}>
              {done && <Check className="size-3 shrink-0 text-brand-600" aria-hidden />}
              <span className="truncate">{s.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

type Filter = "all" | "open" | "closed";
const OPEN: OrderStatus[] = ["requested", "approved", "dispatched", "received"];

export default function RecyclerOrders() {
  useDocumentTitle("Orders");
  const cats = useCategoryMap();
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [cancelling, setCancelling] = useState<IndustryOrder | null>(null);

  const q = useQuery({ queryKey: ["recycler", "orders"], queryFn: () => get<IndustryOrder[]>("/industries/orders") });

  const update = (o: IndustryOrder) =>
    qc.setQueryData<IndustryOrder[]>(["recycler", "orders"], (list) => list?.map((x) => (x.code === o.code ? { ...x, ...o, invoice_number: o.invoice_number ?? x.invoice_number } : x)));

  const cancel = useMutation({
    mutationFn: (code: string) => post<IndustryOrder>(`/industries/orders/${encodeURIComponent(code)}/cancel`),
    onSuccess: (o) => {
      update(o);
      qc.invalidateQueries({ queryKey: ["recycler"] });
      setCancelling(null);
      toast({ tone: "success", title: `Request ${o.code} cancelled` });
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  const advance = useMutation({
    mutationFn: (code: string) => post<IndustryOrder>(`/industries/orders/${encodeURIComponent(code)}/advance`),
    onSuccess: (o) => {
      update(o);
      qc.invalidateQueries({ queryKey: ["recycler"] });
      toast({
        tone: "success",
        title: o.status === "processed" ? `${o.code} marked processed` : `${o.code} marked received`,
        body: o.status === "processed" ? "Households who contributed have been notified. Thank you!" : undefined,
      });
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const orders = q.data.filter((o) => (filter === "all" ? true : filter === "open" ? OPEN.includes(o.status) : !OPEN.includes(o.status)));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        icon={ClipboardCheck}
        subtitle="Track your material requests from approval to processing."
        actions={
          <LinkButton to="/recycler" icon={<PackagePlus className="size-4" />}>
            New request
          </LinkButton>
        }
      />

      {q.data.length > 0 && (
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All (${q.data.length})` },
            { value: "open", label: "In progress" },
            { value: "closed", label: "Closed" },
          ]}
        />
      )}

      {q.data.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No orders yet"
          text="Request verified material from the Materials page. We'll approve, allocate and dispatch it to you."
          action={<LinkButton to="/recycler">Browse materials</LinkButton>}
        />
      ) : orders.length === 0 ? (
        <EmptyState title="Nothing here" text="No orders match this filter." />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const c = cats.map.get(o.category);
            const st = STATUS[o.status] ?? { label: o.status, tone: "gray" as const };
            const busy = (advance.isPending && advance.variables === o.code) || (cancel.isPending && cancel.variables === o.code);
            return (
              <li key={o.code}>
                <Card as="article" className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn("grid size-10 shrink-0 place-items-center rounded-lg text-lg", !c?.color && "bg-canvas text-muted")}
                        style={c?.color ? { backgroundColor: `${c.color}1a` } : undefined}
                        aria-hidden
                      >
                        {c?.emoji ?? <Package className="size-[18px]" />}
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold">
                          {cats.name(o.category)} <span className="font-mono font-normal text-muted">· {o.code}</span>
                        </h2>
                        <p className="text-[13px] text-muted">Requested {fmtDate(o.created_at)}</p>
                      </div>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-5">
                    <div>
                      <dt className="text-[13px] text-muted">Requested</dt>
                      <dd className="mt-0.5 font-medium tabular-nums">{fmtKg(o.quantity_kg)}</dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-muted">Allocated</dt>
                      <dd className="mt-0.5 font-medium tabular-nums">{o.allocated_kg ? fmtKg(o.allocated_kg, 2) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-muted">Price</dt>
                      <dd className="mt-0.5 font-medium tabular-nums">{fmtMoney(o.price_per_kg)}/kg</dd>
                    </div>
                    <div>
                      <dt className="text-[13px] text-muted">Source pickups</dt>
                      <dd className="mt-0.5 font-medium tabular-nums">{o.source_pickups || "—"}</dd>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <dt className="text-[13px] text-muted">Method</dt>
                      <dd className="mt-0.5 truncate font-medium">{o.processing_method ?? "—"}</dd>
                    </div>
                  </dl>

                  {(o.notes || o.admin_note) && (
                    <div className="mt-3 space-y-2 text-sm">
                      {o.notes && (
                        <p>
                          <span className="text-muted">Your notes: </span>
                          {o.notes}
                        </p>
                      )}
                      {o.admin_note && (
                        <p
                          className={cn(
                            "rounded-lg border px-3 py-2",
                            o.status === "rejected" ? "border-red-200 bg-red-50 text-red-800" : "border-sea-100 bg-sea-50 text-sea-700",
                          )}
                        >
                          <span className="font-medium">Swacchify: </span>
                          {o.admin_note}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      {STEP_INDEX[o.status] != null ? (
                        <OrderStepper status={o.status} />
                      ) : (
                        <p className="text-[13px] text-muted">{o.status === "cancelled" ? "You cancelled this request." : "This request was not approved."}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {o.invoice_number && (
                        <LinkButton to={`/recycler/invoices/${o.invoice_number}`} variant="secondary" size="sm" icon={<FileText className="size-4" />}>
                          Invoice
                        </LinkButton>
                      )}
                      {o.status === "requested" && (
                        <Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50 hover:text-red-800" disabled={busy} onClick={() => setCancelling(o)} icon={<X className="size-4" />}>
                          Cancel request
                        </Button>
                      )}
                      {o.status === "dispatched" && (
                        <Button size="sm" loading={busy} onClick={() => advance.mutate(o.code)} icon={<PackageCheck className="size-4" />}>
                          Mark received
                        </Button>
                      )}
                      {o.status === "received" && (
                        <Button size="sm" loading={busy} onClick={() => advance.mutate(o.code)} icon={<Recycle className="size-4" />}>
                          Mark processed
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Cancel this request?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(null)}>
              Keep request
            </Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancelling && cancel.mutate(cancelling.code)}>
              Cancel request
            </Button>
          </>
        }
      >
        {cancelling && (
          <p className="text-sm">
            Your request <span className="font-mono font-medium">{cancelling.code}</span> for {fmtKg(cancelling.quantity_kg)} of{" "}
            {cats.name(cancelling.category)} will be withdrawn. You can place a new request any time.
          </p>
        )}
      </Modal>
    </div>
  );
}
