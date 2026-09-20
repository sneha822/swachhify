import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, BookOpen, Pencil, Plus, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
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
  Select,
  Textarea,
  Toggle,
} from "@/components/ui";
import { del, get, post, put, qs } from "@/lib/api";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { cn, fmtDate, fmtNum } from "@/lib/format";
import { useToast } from "@/lib/toast";

interface KbItem {
  id: number;
  slug: string;
  name: string;
  name_hi: string | null;
  emoji: string;
  aliases: string[] | null;
  category: string;
  collectable: boolean;
  donatable: boolean;
  what_to_do: string;
  why: string;
  what_not_to_do: string;
  prep_tips: string | null;
  safety_notes: string | null;
  common_mistakes: string | null;
  reuse_tip: string | null;
  local_note: string | null;
  lesson_slug: string | null;
  related: string[] | null;
  is_active: boolean;
  has_clarify: boolean;
  updated_at: string | null;
}

/** Mirrors backend WasteItemIn. */
interface WasteItemIn {
  slug: string;
  name: string;
  name_hi: string | null;
  emoji: string;
  aliases: string[];
  category: string;
  collectable: boolean;
  donatable: boolean;
  what_to_do: string;
  why: string;
  what_not_to_do: string;
  prep_tips: string | null;
  safety_notes: string | null;
  common_mistakes: string | null;
  reuse_tip: string | null;
  local_note: string | null;
  lesson_slug: string | null;
  related: string[];
  is_active: boolean;
}

type TextKey =
  | "slug" | "name" | "name_hi" | "emoji" | "aliases" | "category" | "what_to_do" | "why" | "what_not_to_do"
  | "prep_tips" | "safety_notes" | "common_mistakes" | "reuse_tip" | "local_note" | "lesson_slug" | "related";
type Form = Record<TextKey, string> & { collectable: boolean; donatable: boolean; is_active: boolean };

const SLUG_RE = /^[a-z0-9-]{2,64}$/;
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const opt = (s: string) => (s.trim() ? s.trim() : null);

function toForm(i: KbItem | null, defaultCategory: string): Form {
  return {
    slug: i?.slug ?? "",
    name: i?.name ?? "",
    name_hi: i?.name_hi ?? "",
    emoji: i?.emoji ?? "♻️",
    aliases: (i?.aliases ?? []).join(", "),
    category: i?.category ?? defaultCategory,
    collectable: i?.collectable ?? true,
    donatable: i?.donatable ?? false,
    what_to_do: i?.what_to_do ?? "",
    why: i?.why ?? "",
    what_not_to_do: i?.what_not_to_do ?? "",
    prep_tips: i?.prep_tips ?? "",
    safety_notes: i?.safety_notes ?? "",
    common_mistakes: i?.common_mistakes ?? "",
    reuse_tip: i?.reuse_tip ?? "",
    local_note: i?.local_note ?? "",
    lesson_slug: i?.lesson_slug ?? "",
    related: (i?.related ?? []).join(", "),
    is_active: i?.is_active ?? true,
  };
}

function toPayload(f: Form): WasteItemIn {
  return {
    slug: f.slug.trim(),
    name: f.name.trim(),
    name_hi: opt(f.name_hi),
    emoji: f.emoji.trim() || "♻️",
    aliases: list(f.aliases),
    category: f.category,
    collectable: f.collectable,
    donatable: f.donatable,
    what_to_do: f.what_to_do.trim(),
    why: f.why.trim(),
    what_not_to_do: f.what_not_to_do.trim(),
    prep_tips: opt(f.prep_tips),
    safety_notes: opt(f.safety_notes),
    common_mistakes: opt(f.common_mistakes),
    reuse_tip: opt(f.reuse_tip),
    local_note: opt(f.local_note),
    lesson_slug: opt(f.lesson_slug),
    related: list(f.related),
    is_active: f.is_active,
  };
}

export default function AdminKnowledge() {
  useDocumentTitle("Knowledge base");
  const cats = useCategoryMap();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<KbItem | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<KbItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const items = useQuery({
    queryKey: ["admin", "knowledge", { q, category }],
    queryFn: () => get<KbItem[]>(`/admin/knowledge/items${qs({ q, category })}`),
    placeholderData: keepPreviousData,
  });

  const groups = useMemo(() => {
    const out = new Map<string, KbItem[]>();
    for (const it of items.data ?? []) {
      if (!showInactive && !it.is_active) continue;
      const g = out.get(it.category) ?? [];
      g.push(it);
      out.set(it.category, g);
    }
    return [...out.entries()];
  }, [items.data, showInactive]);
  const inactiveCount = (items.data ?? []).filter((i) => !i.is_active).length;

  return (
    <div>
      <PageHeader
        title="Knowledge base"
        subtitle="Curated disposal rules for every item households ask about."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            New item
          </Button>
        }
      />

      <Card as="aside" className="mb-5 flex gap-3 p-4">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
        <p className="text-[13px] text-ink-2">
          <span className="font-medium text-ink">This is the assistant's source of truth.</span> The AI assistant may only state
          disposal rules that are written here — it can rephrase them, but never invent new ones. Keep entries accurate,
          local and specific; changes apply to answers immediately.
        </p>
      </Card>

      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or slug"
            aria-label="Search items"
            className="pl-9"
          />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" className="md:w-56">
          <option value="">All categories</option>
          {cats.list.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.emoji} {c.name}
            </option>
          ))}
        </Select>
        <div className="md:w-52">
          <Toggle checked={showInactive} onChange={setShowInactive} label={`Show inactive (${inactiveCount})`} />
        </div>
      </div>

      {items.isPending ? (
        <PageSkeleton />
      ) : items.isError ? (
        <ErrorState error={items.error} onRetry={() => items.refetch()} />
      ) : !groups.length ? (
        <EmptyState
          icon={BookOpen}
          title={q || category ? "No matching items" : "No items yet"}
          text={q || category ? "Try another search or category." : "Add the first disposal rule for the assistant to use."}
          action={
            <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
              New item
            </Button>
          }
        />
      ) : (
        <div className={cn("space-y-6 transition-opacity", items.isPlaceholderData && "opacity-60")}>
          {groups.map(([slug, rows]) => {
            const c = cats.map.get(slug);
            return (
              <section key={slug} aria-labelledby={`cat-${slug}`}>
                <h2 id={`cat-${slug}`} className="eyebrow mb-2.5 flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ background: c?.color ?? "var(--color-line-strong)" }} aria-hidden />
                  <span aria-hidden>{c?.emoji}</span> {c?.name ?? slug}
                  <span className="font-medium text-muted tabular-nums">· {fmtNum(rows.length)}</span>
                </h2>
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-line">
                    {rows.map((it) => (
                      <li
                        key={it.id}
                        className={cn("flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-canvas/70", !it.is_active && "bg-canvas/60")}
                      >
                        <span className="mt-0.5 w-5 shrink-0 text-center text-base leading-5" aria-hidden>
                          {it.emoji}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="text-sm font-medium">{it.name}</p>
                            {it.name_hi && <span className="text-[13px] text-muted">{it.name_hi}</span>}
                            <span className="font-mono text-xs text-muted">{it.slug}</span>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-2">{it.what_to_do}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {!it.is_active && <Badge tone="red">Inactive</Badge>}
                            {it.collectable ? <Badge tone="green">Collectable</Badge> : <Badge tone="gray">Not collected</Badge>}
                            {it.donatable && <Badge tone="blue">Donatable</Badge>}
                            {it.has_clarify && <Badge tone="gray">Has clarifier</Badge>}
                            {!!it.aliases?.length && <Badge tone="gray">{it.aliases.length} aliases</Badge>}
                            {it.updated_at && <span className="text-xs text-muted">Updated {fmtDate(it.updated_at)}</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(it)} aria-label={`Edit ${it.name}`}>
                            <Pencil className="size-4" />
                          </Button>
                          {it.is_active && (
                            <Button size="sm" variant="ghost" onClick={() => setDeactivating(it)} aria-label={`Deactivate ${it.name}`}>
                              <Ban className="size-4" />
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            );
          })}
        </div>
      )}

      {editing && (
        <ItemModal
          item={editing === "new" ? null : editing}
          defaultCategory={category || cats.list[0]?.slug || ""}
          onClose={() => setEditing(null)}
        />
      )}
      {deactivating && <DeactivateModal item={deactivating} onClose={() => setDeactivating(null)} />}
    </div>
  );
}

function ItemModal({ item, defaultCategory, onClose }: { item: KbItem | null; defaultCategory: string; onClose: () => void }) {
  const cats = useCategoryMap();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(() => toForm(item, defaultCategory));
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  const errors: Partial<Record<TextKey, string>> = {};
  if (!SLUG_RE.test(f.slug.trim())) errors.slug = "2–64 lowercase letters, numbers or hyphens";
  if (!f.name.trim()) errors.name = "Required";
  if (!f.category) errors.category = "Required";
  if (!f.what_to_do.trim()) errors.what_to_do = "Required";
  if (!f.why.trim()) errors.why = "Required";
  if (!f.what_not_to_do.trim()) errors.what_not_to_do = "Required";
  const bad = Object.keys(errors).length > 0;
  const err = (k: TextKey) => (touched ? errors[k] : undefined);

  const m = useMutation({
    mutationFn: (body: WasteItemIn) =>
      item ? put<KbItem>(`/admin/knowledge/items/${item.id}`, { ...body }) : post<KbItem>("/admin/knowledge/items", { ...body }),
    onSuccess: (saved) => {
      toast({ tone: "success", title: item ? `${saved.name} updated` : `${saved.name} added to the knowledge base` });
      qc.invalidateQueries({ queryKey: ["admin", "knowledge"] });
      onClose();
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (!bad) m.mutate(toPayload(f));
  };

  const text = (
    k: TextKey,
    label: string,
    opts: { hint?: string; optional?: boolean; area?: boolean; placeholder?: string; disabled?: boolean; mono?: boolean } = {},
  ) => (
    <Field label={label} hint={opts.hint} error={err(k)} optional={opts.optional ? "optional" : undefined}>
      {(id) =>
        opts.area ? (
          <Textarea id={id} value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder={opts.placeholder} aria-invalid={!!err(k)} className="min-h-20" />
        ) : (
          <Input
            id={id}
            value={f[k]}
            onChange={(e) => set(k, e.target.value)}
            placeholder={opts.placeholder}
            disabled={opts.disabled}
            aria-invalid={!!err(k)}
            className={cn(opts.mono && "font-mono")}
          />
        )
      }
    </Field>
  );

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={item ? `Edit ${item.name}` : "New knowledge base item"}
      description="The assistant quotes these rules verbatim. Required fields are marked by their errors."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => submit()}>
            {item ? "Save changes" : "Create item"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-6" noValidate>
        <fieldset className="space-y-4">
          <legend className="eyebrow mb-1">Identity</legend>
          <p className="text-[13px] text-muted">How households and the assistant recognise this item.</p>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_6rem]">
            {text("name", "Name", { placeholder: "Milk packet" })}
            {text("name_hi", "Name (Hindi)", { optional: true, placeholder: "दूध की थैली" })}
            {text("emoji", "Emoji")}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("slug", "Slug", {
              hint: item ? "Slug can't be changed — past answers link to it." : "Lowercase, e.g. milk-packet",
              disabled: !!item,
              placeholder: "milk-packet",
              mono: true,
            })}
            <Field label="Category" error={err("category")}>
              {(id) => (
                <Select id={id} value={f.category} onChange={(e) => set("category", e.target.value)}>
                  <option value="" disabled>
                    Choose a category
                  </option>
                  {cats.list.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {text("aliases", "Aliases", { optional: true, hint: "Comma-separated names people use, e.g. doodh ki thaili, milk pouch" })}
          <div className="grid gap-x-6 sm:grid-cols-3">
            <Toggle checked={f.collectable} onChange={(v) => set("collectable", v)} label="Collectable" description="Picked up by partners" />
            <Toggle checked={f.donatable} onChange={(v) => set("donatable", v)} label="Donatable" description="Can go to NGOs" />
            <Toggle checked={f.is_active} onChange={(v) => set("is_active", v)} label="Active" description="Used by the assistant" />
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="eyebrow mb-1">Disposal rules</legend>
          <p className="text-[13px] text-muted">Required. The assistant may only answer with what you write here.</p>
          {text("what_to_do", "What to do", { area: true, placeholder: "Cut open, rinse, dry and put with dry plastic." })}
          {text("why", "Why", { area: true, placeholder: "Clean milk packets are recycled into new plastic products." })}
          {text("what_not_to_do", "What not to do", { area: true, placeholder: "Don't throw with wet waste — milk residue smells and spoils other recyclables." })}
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="eyebrow mb-1">Extra guidance</legend>
          <p className="text-[13px] text-muted">Optional detail the assistant adds when it is relevant.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("prep_tips", "Preparation tips", { area: true, optional: true })}
            {text("safety_notes", "Safety notes", { area: true, optional: true })}
            {text("common_mistakes", "Common mistakes", { area: true, optional: true })}
            {text("reuse_tip", "Reuse tip", { area: true, optional: true })}
          </div>
          {text("local_note", "Local note", { area: true, optional: true, hint: "City- or ward-specific rules" })}
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="eyebrow mb-1">Links</legend>
          <p className="text-[13px] text-muted">Point people to a lesson or to items that are easy to confuse.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {text("lesson_slug", "Lesson slug", { optional: true, hint: "Suggested lesson after the answer", placeholder: "plastic-basics", mono: true })}
            {text("related", "Related items", { optional: true, hint: "Comma-separated item slugs", placeholder: "plastic-bottle, chips-packet", mono: true })}
          </div>
        </fieldset>
        {touched && bad && (
          <p className="text-sm text-red-600" role="alert">
            Please fix the highlighted fields.
          </p>
        )}
        <button type="submit" className="sr-only" tabIndex={-1}>
          Save
        </button>
      </form>
    </Modal>
  );
}

function DeactivateModal({ item, onClose }: { item: KbItem; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => del(`/admin/knowledge/items/${item.id}`),
    onSuccess: () => {
      toast({ tone: "success", title: `${item.name} deactivated` });
      qc.invalidateQueries({ queryKey: ["admin", "knowledge"] });
      onClose();
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Deactivate ${item.name}?`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep active
          </Button>
          <Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>
            Deactivate
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        The assistant will stop using this entry. Past answers and analytics keep working, and you can re-activate it any
        time from the edit form.
      </p>
    </Modal>
  );
}
