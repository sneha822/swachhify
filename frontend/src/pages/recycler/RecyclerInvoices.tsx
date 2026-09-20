import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FileText, IndianRupee, Receipt, Wallet } from "lucide-react";
import { Link } from "react-router";
import { Badge, Card, EmptyState, ErrorState, IconBox, LinkButton, PageHeader, PageSkeleton, Stat } from "@/components/ui";
import { get } from "@/lib/api";
import { fmtDate, fmtKg, fmtMoney } from "@/lib/format";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";

export interface InvoiceRow {
  invoice_number: string;
  order_code: string;
  category: string;
  quantity_kg: number;
  rate: number;
  amount: number;
  tax: number;
  total: number;
  status: "issued" | "paid" | string;
  created_at: string;
  paid_at: string | null;
}

export function InvoiceStatus({ status }: { status: string }) {
  return status === "paid" ? <Badge tone="green">Paid</Badge> : <Badge tone="amber">Payment due</Badge>;
}

export default function RecyclerInvoices() {
  useDocumentTitle("Invoices");
  const cats = useCategoryMap();
  const q = useQuery({ queryKey: ["recycler", "invoices"], queryFn: () => get<InvoiceRow[]>("/industries/transactions") });

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const rows = q.data;
  const billed = rows.reduce((s, r) => s + r.total, 0);
  const due = rows.filter((r) => r.status !== "paid").reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-8">
      <PageHeader title="Invoices" icon={FileText} subtitle="Tax invoices raised when verified material is dispatched to you." />

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          text="An invoice is created automatically when an order is approved and dispatched."
          action={<LinkButton to="/recycler/orders">View orders</LinkButton>}
        />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Invoice totals">
            <Stat label="Invoices" value={rows.length} icon={Receipt} />
            <Stat label="Total billed (incl. GST)" value={fmtMoney(billed)} icon={IndianRupee} tone="brand" />
            <Stat label="Payment due" value={fmtMoney(due)} icon={Wallet} tone={due ? "amber" : "neutral"} />
          </section>

          {/* Desktop table */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas text-left">
                <tr>
                  <th scope="col" className="eyebrow px-5 py-2.5">Invoice</th>
                  <th scope="col" className="eyebrow px-3 py-2.5">Material</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 text-right">Qty</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 text-right">Amount</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 text-right">GST</th>
                  <th scope="col" className="eyebrow px-3 py-2.5 text-right">Total</th>
                  <th scope="col" className="eyebrow px-3 py-2.5">Status</th>
                  <th scope="col" className="px-3 py-2.5"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.invoice_number} className="transition-colors hover:bg-canvas/70">
                    <td className="px-5 py-3">
                      <Link to={`/recycler/invoices/${r.invoice_number}`} className="font-mono font-medium text-ink hover:underline">
                        {r.invoice_number}
                      </Link>
                      <p className="text-[13px] text-muted">
                        {fmtDate(r.created_at)} · <span className="font-mono">{r.order_code}</span>
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      {cats.map.get(r.category)?.emoji && <span aria-hidden>{cats.map.get(r.category)?.emoji} </span>}
                      {cats.name(r.category)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtKg(r.quantity_kg, 2)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtMoney(r.amount)}</td>
                    <td className="px-3 py-3 text-right text-muted tabular-nums">{fmtMoney(r.tax)}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{fmtMoney(r.total)}</td>
                    <td className="px-3 py-3">
                      <InvoiceStatus status={r.status} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        to={`/recycler/invoices/${r.invoice_number}`}
                        className="inline-grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink"
                        aria-label={`Open invoice ${r.invoice_number}`}
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.invoice_number}>
                <Link to={`/recycler/invoices/${r.invoice_number}`} className="block">
                  <Card className="p-4 transition-colors hover:bg-canvas/60">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <IconBox icon={FileText} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm font-medium">{r.invoice_number}</p>
                          <p className="text-[13px] text-muted">
                            {fmtDate(r.created_at)} · {cats.name(r.category)} · {fmtKg(r.quantity_kg)}
                          </p>
                        </div>
                      </div>
                      <InvoiceStatus status={r.status} />
                    </div>
                    <div className="mt-3 flex items-end justify-between border-t border-line pt-3 text-[13px]">
                      <span className="text-muted tabular-nums">
                        {fmtMoney(r.amount)} + GST {fmtMoney(r.tax)}
                      </span>
                      <span className="text-[15px] font-semibold tabular-nums">{fmtMoney(r.total)}</span>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
