import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Filter, ScrollText } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Skeleton } from "@/components/ui";
import { get, qs } from "@/lib/api";
import { useDocumentTitle } from "@/lib/hooks";
import { cn, fmtNum } from "@/lib/format";
import type { Paged } from "@/lib/types";

interface AuditRow {
  id: number;
  actor: string | null;
  action: string;
  entity: string | null;
  entity_id: string | number | null;
  data: unknown;
  ip: string | null;
  at: string;
}

const PREFIXES = ["pickup", "account", "user", "kb", "lesson", "order", "invoice", "payment", "redemption"];

const tone = (action: string): "green" | "blue" | "amber" | "red" | "gray" => {
  if (/reject|cancel|deactivate/.test(action)) return "red";
  if (/verified|paid|fulfill|dispatch|active$/.test(action)) return "green";
  if (action.startsWith("pickup")) return "blue";
  if (action.startsWith("order") || action.startsWith("invoice")) return "amber";
  return "gray";
};

function compactJson(v: unknown): string {
  if (v == null) return "";
  try {
    const s = JSON.stringify(v);
    return s === "{}" ? "" : s;
  } catch {
    return String(v);
  }
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

const TH = "eyebrow px-3 py-2 whitespace-nowrap first:pl-4 last:pr-4";
const TD = "px-3 py-2.5 align-top first:pl-4 last:pr-4";

export default function AdminAudit() {
  useDocumentTitle("Audit log");
  const [input, setInput] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setAction(input.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const q = useQuery({
    queryKey: ["admin", "audit", { action, page }],
    queryFn: () => get<Paged<AuditRow>>(`/admin/audit${qs({ action, page, size: 50 })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every sensitive admin, partner and recycler action, newest first." />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-80">
          <Filter className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            list="audit-prefixes"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Filter by action, e.g. pickup or kb.update"
            aria-label="Filter by action (prefix match)"
            className="pl-9"
          />
          <datalist id="audit-prefixes">
            {PREFIXES.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Quick filters">
          {PREFIXES.slice(0, 6).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={action === p}
              onClick={() => setInput(action === p ? "" : p)}
              className={cn(
                "h-8 rounded-lg px-2.5 font-mono text-[13px] transition-colors",
                action === p ? "bg-brand-50 font-medium text-brand-800" : "text-muted hover:bg-black/[0.04] hover:text-ink",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {q.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data.items.length ? (
        <EmptyState icon={ScrollText} title="No audit entries" text={action ? `Nothing matches “${action}”.` : "Actions will be recorded here."} />
      ) : (
        <>
          <div className={cn("transition-opacity", q.isPlaceholderData && "opacity-60")}>
            {/* Desktop table */}
            <Card className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className={TH}>Time</th>
                    <th scope="col" className={TH}>Actor</th>
                    <th scope="col" className={TH}>Action</th>
                    <th scope="col" className={TH}>Entity</th>
                    <th scope="col" className={TH}>Data</th>
                    <th scope="col" className={cn(TH, "text-right")}>IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {q.data.items.map((r) => {
                    const data = compactJson(r.data);
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-canvas/70">
                        <td className={cn(TD, "text-[13px] whitespace-nowrap tabular-nums text-muted")}>
                          <time dateTime={r.at}>{fmtTime(r.at)}</time>
                        </td>
                        <td className={cn(TD, "font-mono text-[13px]")}>{r.actor ?? <span className="font-sans text-muted">system</span>}</td>
                        <td className={TD}>
                          <Badge tone={tone(r.action)} className="font-mono">
                            {r.action}
                          </Badge>
                        </td>
                        <td className={cn(TD, "whitespace-nowrap")}>
                          <span className="text-muted">{r.entity ?? "—"}</span>
                          {r.entity_id != null && <span className="ml-1.5 font-mono text-[13px]">{String(r.entity_id)}</span>}
                        </td>
                        <td className={cn(TD, "max-w-xs")}>
                          {data ? (
                            <code className="block truncate rounded-md bg-canvas px-2 py-1 font-mono text-xs" title={data}>
                              {data}
                            </code>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className={cn(TD, "text-right font-mono text-xs tabular-nums text-muted")}>{r.ip ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            {/* Mobile cards */}
            <ul className="space-y-2 md:hidden">
              {q.data.items.map((r) => {
                const data = compactJson(r.data);
                return (
                  <li key={r.id}>
                    <Card className="p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <Badge tone={tone(r.action)} className="font-mono">
                          {r.action}
                        </Badge>
                        <time dateTime={r.at} className="text-xs text-muted tabular-nums">
                          {fmtTime(r.at)}
                        </time>
                      </div>
                      <p className="mt-2 text-sm">
                        <span className="font-mono">{r.actor ?? "system"}</span>
                        <span className="text-muted"> → {r.entity ?? "—"} </span>
                        {r.entity_id != null && <span className="font-mono text-xs">{String(r.entity_id)}</span>}
                      </p>
                      {data && <code className="mt-2 block rounded-md bg-canvas px-2 py-1 font-mono text-xs break-all">{data}</code>}
                      {r.ip && <p className="mt-1 font-mono text-xs text-muted">IP {r.ip}</p>}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </div>

          <nav className="mt-4 flex items-center justify-between gap-2" aria-label="Pagination">
            <p className="text-[13px] text-muted tabular-nums">
              {q.data.pages > 1 ? `Page ${q.data.page} of ${q.data.pages} · ` : ""}
              {fmtNum(q.data.total)} entries
            </p>
            {q.data.pages > 1 && (
              <div className="flex gap-1.5">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button size="sm" variant="secondary" disabled={page >= q.data.pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
