import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer, Recycle } from "lucide-react";
import { Link, useLocation, useParams } from "react-router";
import { Button, ErrorState, PageSkeleton } from "@/components/ui";
import { get } from "@/lib/api";
import { fmtDate, fmtMoney } from "@/lib/format";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import type { InvoiceRow } from "./RecyclerInvoices";
import { InvoiceStatus } from "./RecyclerInvoices";

interface InvoiceDetail extends InvoiceRow {
  gst_rate: number;
  buyer: { org_name: string; authorization_number: string | null; address: string | null; city: string | null };
  seller: { name: string; city: string };
}

// Indian-system amount in words (rupees + paise), for the invoice footer.
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function twoDigits(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}
function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? twoDigits(r) : ""].filter(Boolean).join(" ");
}
function inWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  if (crore) parts.push(`${inWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
}
function amountInWords(amount: number) {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  return `Rupees ${inWords(rupees)}${paise ? ` and ${twoDigits(paise)} Paise` : ""} Only`;
}

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm; }
  body { background: #fff !important; }
  body * { visibility: hidden !important; }
  #invoice-sheet, #invoice-sheet * { visibility: visible !important; }
  #invoice-sheet { position: absolute; inset: 0 auto auto 0; width: 100%; margin: 0; border: 0 !important; box-shadow: none !important; border-radius: 0 !important; }
}`;

export default function Invoice() {
  const { number = "" } = useParams();
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith("/admin");
  const cats = useCategoryMap();
  useDocumentTitle(`Invoice ${number}`);

  const q = useQuery({
    queryKey: ["recycler", "invoice", number],
    queryFn: () => get<InvoiceDetail>(`/industries/invoices/${encodeURIComponent(number)}`),
    enabled: !!number,
  });

  const back = isAdmin ? "/admin/orders" : "/recycler/invoices";

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const inv = q.data;
  const gstPct = Math.round((inv.gst_rate ?? 0.18) * 100);
  const material = cats.name(inv.category);

  return (
    <div className="space-y-5">
      <style>{PRINT_CSS}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={back} className="-ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium text-muted transition-colors hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> {isAdmin ? "Back to orders" : "All invoices"}
        </Link>
        <Button variant="secondary" onClick={() => window.print()} icon={<Printer className="size-4" />}>
          Print / Save as PDF
        </Button>
      </div>

      <article
        id="invoice-sheet"
        aria-label={`Tax invoice ${inv.invoice_number}`}
        className="mx-auto w-full max-w-[210mm] border border-line bg-white p-6 text-sm text-ink shadow-soft sm:p-10 print:shadow-none"
      >
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line-strong pb-5">
          <div>
            <p className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <Recycle className="size-5 text-brand-700" aria-hidden /> Swacchify
            </p>
            <p className="mt-1 text-xs text-muted">Know Your Waste. Do the Right Thing.</p>
          </div>
          <div className="text-right">
            <h1 className="text-base font-semibold tracking-wide uppercase">Tax invoice</h1>
            <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-4 gap-y-1 text-[13px]">
              <dt className="text-muted">Invoice no.</dt>
              <dd className="font-mono font-medium">{inv.invoice_number}</dd>
              <dt className="text-muted">Date</dt>
              <dd className="tabular-nums">{fmtDate(inv.created_at)}</dd>
              <dt className="text-muted">Order</dt>
              <dd className="font-mono">{inv.order_code}</dd>
              <dt className="text-muted">Status</dt>
              <dd>
                <InvoiceStatus status={inv.status} />
              </dd>
            </dl>
          </div>
        </header>

        {/* Parties */}
        <section className="grid gap-6 py-5 sm:grid-cols-2" aria-label="Seller and buyer">
          <div>
            <h2 className="eyebrow">From (seller)</h2>
            <p className="mt-1.5 font-medium">{inv.seller.name}</p>
            <p className="text-[13px] text-muted">{inv.seller.city}, India</p>
          </div>
          <div className="sm:text-right">
            <h2 className="eyebrow">Bill to (buyer)</h2>
            <p className="mt-1.5 font-medium">{inv.buyer.org_name}</p>
            {inv.buyer.address && <p className="text-[13px] text-muted">{inv.buyer.address}</p>}
            {inv.buyer.city && <p className="text-[13px] text-muted">{inv.buyer.city}</p>}
            {inv.buyer.authorization_number && (
              <p className="mt-1 text-[13px]">
                <span className="text-muted">Authorisation no.: </span>
                <span className="font-mono">{inv.buyer.authorization_number}</span>
              </p>
            )}
          </div>
        </section>

        {/* Line items */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-line bg-canvas text-left print:bg-transparent">
                <th scope="col" className="eyebrow px-3 py-2">#</th>
                <th scope="col" className="eyebrow px-3 py-2">Description</th>
                <th scope="col" className="eyebrow px-3 py-2 text-right">Qty (kg)</th>
                <th scope="col" className="eyebrow px-3 py-2 text-right">Rate (₹/kg)</th>
                <th scope="col" className="eyebrow px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line align-top">
                <td className="px-3 py-3 tabular-nums">1</td>
                <td className="px-3 py-3">
                  <p className="font-medium">{material} — verified, segregated recyclable material</p>
                  <p className="mt-0.5 text-xs text-muted">Sourced from household pickups, weighed and quality-checked at the Swacchify hub</p>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{inv.quantity_kg.toLocaleString("en-IN", { maximumFractionDigits: 3 })}</td>
                <td className="px-3 py-3 text-right tabular-nums">{fmtMoney(inv.rate)}</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">{fmtMoney(inv.amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="mt-5 flex justify-end">
          <dl className="w-full max-w-xs text-[13px]">
            <div className="flex justify-between py-1">
              <dt className="text-muted">Taxable value</dt>
              <dd className="tabular-nums">{fmtMoney(inv.amount)}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-muted">GST ({gstPct}%)</dt>
              <dd className="tabular-nums">{fmtMoney(inv.tax)}</dd>
            </div>
            <div className="mt-1 flex justify-between border-t border-line-strong pt-2 text-[15px] font-semibold">
              <dt>Total payable</dt>
              <dd className="tabular-nums">{fmtMoney(inv.total)}</dd>
            </div>
          </dl>
        </div>

        <p className="mt-5 border-t border-line pt-3 text-[13px]">
          <span className="text-muted">Amount in words: </span>
          <span className="font-medium">{amountInWords(inv.total)}</span>
        </p>

        {inv.paid_at && <p className="mt-2 text-[13px] font-medium text-brand-700">Paid on {fmtDate(inv.paid_at)}. Thank you.</p>}

        <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
          <p>This is a computer-generated invoice and does not require a signature.</p>
          <p className="mt-1">Material supplied under Swacchify's traceable collection programme: household → collection partner → Swacchify hub → recycler.</p>
        </footer>
      </article>
    </div>
  );
}
