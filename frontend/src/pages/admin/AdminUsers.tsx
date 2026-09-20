import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Power, Search, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton } from "@/components/ui";
import { get, patch, post, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDocumentTitle } from "@/lib/hooks";
import { cn, fmtDate, fmtNum } from "@/lib/format";
import { useToast } from "@/lib/toast";
import type { Paged, Role } from "@/lib/types";

type Verification = "pending" | "verified" | "rejected";
interface AdminUser {
  id: number;
  public_code: string;
  role: Role;
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  last_active_on: string | null;
  verification_status: Verification | null;
  details: string | null;
}

const ROLE_TONE: Record<Role, "green" | "blue" | "purple" | "gray"> = {
  customer: "green",
  partner: "blue",
  recycler: "purple",
  admin: "gray",
};
const ROLE_LABEL: Record<Role, string> = {
  customer: "Household",
  partner: "Collection partner",
  recycler: "Recycler",
  admin: "Admin",
};
const VERIFY_TONE: Record<Verification, "amber" | "green" | "red"> = { pending: "amber", verified: "green", rejected: "red" };
const VERIFY_LABEL: Record<Verification, string> = { pending: "Pending approval", verified: "Verified", rejected: "Rejected" };

const TH = "eyebrow px-3 py-2 whitespace-nowrap first:pl-4 last:pr-4 last:sticky last:right-0 last:border-l last:border-line last:bg-surface";
const TD = "px-3 py-2.5 align-top first:pl-4 last:pr-4 last:sticky last:right-0 last:border-l last:border-line last:bg-surface";

export default function AdminUsers() {
  useDocumentTitle("Users & approvals");
  const [params, setParams] = useSearchParams();
  const role = params.get("role") ?? "";
  const status = params.get("status") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(params.get("q") ?? "");

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!("page" in next)) p.delete("page");
    setParams(p, { replace: true });
  };

  // Debounce the search box into the URL.
  const qParam = params.get("q") ?? "";
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== qParam) update({ q: search.trim() });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useQuery({
    queryKey: ["admin", "users", { role, status, q: qParam, page }],
    queryFn: () => get<Paged<AdminUser>>(`/admin/users${qs({ role, status, q: qParam, page })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader title="Users & approvals" subtitle="Approve collection partners and recyclers, and manage account access." />

      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or Swacchify ID"
            aria-label="Search users"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:flex">
          <Select value={role} onChange={(e) => update({ role: e.target.value })} aria-label="Filter by role" className="lg:w-44">
            <option value="">All roles</option>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => update({ status: e.target.value })} aria-label="Filter by verification" className="lg:w-44">
            <option value="">Any verification</option>
            <option value="pending">Pending approval</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={status === "pending" ? "soft" : "secondary"}
            aria-pressed={status === "pending"}
            onClick={() => update({ status: status === "pending" ? "" : "pending" })}
            icon={<Clock className="size-4" />}
          >
            Pending only
          </Button>
          {(role || status || qParam) && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {list.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data.items.length ? (
        <EmptyState
          icon={status === "pending" ? CheckCircle2 : Users}
          title={status === "pending" ? "No accounts waiting" : "No users found"}
          text={status === "pending" ? "Every partner and recycler has been reviewed." : "Try a different search or filter."}
        />
      ) : (
        <>
          <div className={cn("transition-opacity", list.isPlaceholderData && "opacity-60")}>
            {/* Desktop table */}
            <Card className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className={TH}>User</th>
                    <th scope="col" className={TH}>Role</th>
                    <th scope="col" className={TH}>Status</th>
                    <th scope="col" className={TH}>Contact</th>
                    <th scope="col" className={cn(TH, "text-right")}>Joined</th>
                    <th scope="col" className={cn(TH, "text-right")}>Last active</th>
                    <th scope="col" className={cn(TH, "text-right")}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.data.items.map((u) => (
                    <tr key={u.id} className={cn("transition-colors hover:bg-canvas/70", !u.is_active && "bg-canvas/60")}>
                      <td className={TD}>
                        <p className="font-medium">{u.full_name}</p>
                        <p className="font-mono text-xs text-muted">{u.public_code}</p>
                        {u.details && <p className="mt-1 max-w-sm text-[13px] text-ink-2">{u.details}</p>}
                      </td>
                      <td className={TD}>
                        <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                      </td>
                      <td className={TD}>
                        <span className="flex flex-wrap gap-1.5">
                          {u.verification_status && <Badge tone={VERIFY_TONE[u.verification_status]}>{VERIFY_LABEL[u.verification_status]}</Badge>}
                          {!u.is_active && <Badge tone="red">Deactivated</Badge>}
                        </span>
                      </td>
                      <td className={TD}>
                        <p className="truncate">{u.email}</p>
                        {u.phone && <p className="text-xs text-muted tabular-nums">{u.phone}</p>}
                      </td>
                      <td className={cn(TD, "text-right whitespace-nowrap tabular-nums text-muted")}>{fmtDate(u.created_at)}</td>
                      <td className={cn(TD, "text-right whitespace-nowrap tabular-nums text-muted")}>
                        {u.last_active_on ? fmtDate(u.last_active_on) : "never"}
                      </td>
                      <td className={cn(TD, "text-right")}>
                        <UserActions u={u} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Mobile / tablet cards */}
            <ul className="space-y-3 lg:hidden">
              {list.data.items.map((u) => (
                <li key={u.id}>
                  <div className={cn("rounded-card border border-line p-4 shadow-soft", u.is_active ? "bg-surface" : "bg-canvas/60")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{u.full_name}</p>
                      <span className="font-mono text-xs text-muted">{u.public_code}</span>
                      <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                      {u.verification_status && <Badge tone={VERIFY_TONE[u.verification_status]}>{VERIFY_LABEL[u.verification_status]}</Badge>}
                      {!u.is_active && <Badge tone="red">Deactivated</Badge>}
                    </div>
                    <p className="mt-1 truncate text-[13px] text-muted">
                      {u.email}
                      {u.phone ? ` · ${u.phone}` : ""}
                    </p>
                    {u.details && <p className="mt-1 text-[13px] text-ink-2">{u.details}</p>}
                    <p className="mt-1 text-xs text-muted">
                      Joined {fmtDate(u.created_at)} · Last active {u.last_active_on ? fmtDate(u.last_active_on) : "never"}
                    </p>
                    <div className="mt-3">
                      <UserActions u={u} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <nav className="mt-4 flex items-center justify-between gap-2" aria-label="Pagination">
            <p className="text-[13px] text-muted tabular-nums">
              {list.data.pages > 1 ? `Page ${list.data.page} of ${list.data.pages} · ` : ""}
              {fmtNum(list.data.total)} users
            </p>
            {list.data.pages > 1 && (
              <div className="flex gap-1.5">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= list.data.pages}
                  onClick={() => update({ page: String(page + 1) })}
                  aria-label="Next page"
                >
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

function UserActions({ u }: { u: AdminUser }) {
  const toast = useToast();
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
    qc.invalidateQueries({ queryKey: ["admin", "overview"] });
  };
  const verify = useMutation({
    mutationFn: (status: Verification) => post(`/admin/users/${u.id}/verify`, { status }),
    onSuccess: (_d, status) => {
      toast({ tone: "success", title: `${u.full_name} ${status === "verified" ? "approved" : status === "rejected" ? "rejected" : "moved to pending"}` });
      done();
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });
  const active = useMutation({
    mutationFn: (is_active: boolean) => patch(`/admin/users/${u.id}`, { is_active }),
    onSuccess: (_d, is_active) => {
      toast({ tone: "success", title: `${u.full_name} ${is_active ? "activated" : "deactivated"}` });
      done();
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });
  const { user: me } = useAuth();
  const reviewable = u.role === "partner" || u.role === "recycler";

  return (
    <div className="flex flex-wrap gap-1.5 lg:justify-end">
      {reviewable && u.verification_status !== "verified" && (
        <Button size="sm" loading={verify.isPending && verify.variables === "verified"} disabled={verify.isPending} onClick={() => verify.mutate("verified")} icon={<Check className="size-4" />}>
          Approve
        </Button>
      )}
      {reviewable && u.verification_status !== "rejected" && (
        <Button
          size="sm"
          variant="secondary"
          loading={verify.isPending && verify.variables === "rejected"}
          disabled={verify.isPending}
          onClick={() => verify.mutate("rejected")}
          icon={<X className="size-4" />}
        >
          {u.verification_status === "verified" ? "Revoke" : "Reject"}
        </Button>
      )}
      {u.id !== me?.id && (
        <Button
          size="sm"
          variant={u.is_active ? "ghost" : "soft"}
          loading={active.isPending}
          onClick={() => active.mutate(!u.is_active)}
          icon={<Power className="size-4" />}
          aria-label={`${u.is_active ? "Deactivate" : "Activate"} ${u.full_name}`}
        >
          {u.is_active ? "Deactivate" : "Activate"}
        </Button>
      )}
    </div>
  );
}
