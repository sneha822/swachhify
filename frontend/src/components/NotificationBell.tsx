import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { get, post } from "@/lib/api";
import { cn, timeAgo } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { AppNotification, Paged } from "@/lib/types";

export function NotificationBell({ allHref }: { allHref: string }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications", "bell"],
    queryFn: () => get<Paged<AppNotification> & { unread: number }>("/notifications?size=6"),
    refetchInterval: 60_000,
  });
  const readAll = useMutation({
    mutationFn: () => post("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const unread = data?.unread ?? 0;
  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-10 place-items-center rounded-xl border border-line bg-white text-ink hover:bg-canvas"
        aria-label={`${t("common.notifications")}${unread ? ` (${unread})` : ""}`}
        aria-expanded={open}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-[800] mt-2 w-[min(22rem,calc(100vw-2rem))] animate-pop overflow-hidden rounded-xl border border-line bg-white shadow-lift">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-bold">{t("common.notifications")}</p>
            {unread > 0 && (
              <button onClick={() => readAll.mutate()} className="text-sm font-semibold text-brand-700 hover:underline">
                {t("common.markAllRead")}
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {data?.items.length ? (
              data.items.map((n) => (
                <li key={n.id} className={cn("px-4 py-3", !n.read && "bg-brand-50/60")}>
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{timeAgo(n.created_at, lang)}</p>
                </li>
              ))
            ) : (
              <li className="px-4 py-8 text-center text-sm text-muted">{t("common.noNotifications")}</li>
            )}
          </ul>
          <Link
            to={allHref}
            onClick={() => setOpen(false)}
            className="block border-t border-line px-4 py-3 text-center text-sm font-semibold text-brand-700 hover:bg-canvas"
          >
            {t("common.seeAll")}
          </Link>
        </div>
      )}
    </div>
  );
}
