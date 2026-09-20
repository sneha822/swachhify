import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Eye, GraduationCap, Pencil, Plus, Trash2, Video } from "lucide-react";
import { useState, type FormEvent } from "react";
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
  ProgressBar,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui";
import { get, post, put } from "@/lib/api";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { cn, fmtNum } from "@/lib/format";
import { useToast } from "@/lib/toast";

interface Slide {
  emoji: string;
  text: string;
  text_hi: string;
}
interface AdminLesson {
  id: number;
  slug: string;
  title: string;
  title_hi: string | null;
  category_slug: string;
  description: string;
  description_hi: string | null;
  duration_sec: number;
  emoji: string;
  video_url: string | null;
  slides: Partial<Slide>[] | null;
  is_published: boolean;
  views: number;
  completions: number;
}
/** Mirrors backend LessonIn. */
interface LessonIn {
  slug: string;
  title: string;
  title_hi: string | null;
  category_slug: string;
  description: string;
  description_hi: string | null;
  duration_sec: number;
  emoji: string;
  video_url: string | null;
  slides: Slide[];
  is_published: boolean;
}

const SLUG_RE = /^[a-z0-9-]{2,64}$/;
const TH = "eyebrow px-3 py-2 whitespace-nowrap first:pl-4 last:pr-4 last:sticky last:right-0 last:border-l last:border-line last:bg-surface";
const TD = "px-3 py-2.5 align-top first:pl-4 last:pr-4 last:sticky last:right-0 last:border-l last:border-line last:bg-surface";
const rate = (l: AdminLesson) => (l.views ? Math.round((100 * l.completions) / l.views) : 0);
const fmtDuration = (s: number) => (s < 60 ? `${s} sec` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`);

export default function AdminContent() {
  useDocumentTitle("Learning content");
  const cats = useCategoryMap();
  const [editing, setEditing] = useState<AdminLesson | "new" | null>(null);
  const q = useQuery({ queryKey: ["admin", "lessons"], queryFn: () => get<AdminLesson[]>("/admin/lessons") });

  const catLabel = (slug: string) => (slug === "general" ? "General" : cats.name(slug));
  const catEmoji = (slug: string) => (slug === "general" ? "" : cats.map.get(slug)?.emoji ?? "");

  const header = (
    <PageHeader
      title="Learning content"
      subtitle="Short lessons that teach households to segregate right. Track what people actually finish."
      actions={
        <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
          New lesson
        </Button>
      }
    />
  );

  let body;
  if (q.isPending) body = <PageSkeleton />;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else if (!q.data.length)
    body = (
      <EmptyState
        icon={GraduationCap}
        title="No lessons yet"
        text="Create a 30–60 second lesson for the topics people ask about most."
        action={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            New lesson
          </Button>
        }
      />
    );
  else {
    const totalViews = q.data.reduce((s, l) => s + l.views, 0);
    const totalDone = q.data.reduce((s, l) => s + l.completions, 0);
    body = (
      <>
        <p className="mb-3 text-[13px] text-muted">
          {fmtNum(q.data.length)} lessons · {fmtNum(q.data.filter((l) => l.is_published).length)} published ·{" "}
          <span className="tabular-nums">{fmtNum(totalViews)}</span> starts ·{" "}
          <span className="tabular-nums">{fmtNum(totalDone)}</span> completions
          {totalViews ? ` (${Math.round((100 * totalDone) / totalViews)}% overall)` : ""}
        </p>

        {/* Desktop table */}
        <Card className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={TH}>Lesson</th>
                <th scope="col" className={TH}>Category</th>
                <th scope="col" className={cn(TH, "text-right")}>Length</th>
                <th scope="col" className={cn(TH, "text-right")}>Views</th>
                <th scope="col" className={cn(TH, "text-right")}>Completions</th>
                <th scope="col" className={cn(TH, "w-44")}>Completion rate</th>
                <th scope="col" className={cn(TH, "text-right")}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {q.data.map((l) => (
                <tr key={l.id} className="transition-colors hover:bg-canvas/70">
                  <td className={TD}>
                    <p className="flex flex-wrap items-center gap-1.5 font-medium">
                      <span aria-hidden>{l.emoji}</span>
                      {l.title}
                      {!l.is_published && <Badge tone="gray">Draft</Badge>}
                      {l.video_url && <Video className="size-3.5 text-muted" aria-label="Has video" />}
                    </p>
                    <p className="font-mono text-xs text-muted">{l.slug}</p>
                  </td>
                  <td className={cn(TD, "whitespace-nowrap")}>
                    <span aria-hidden>{catEmoji(l.category_slug)}</span> {catLabel(l.category_slug)}
                  </td>
                  <td className={cn(TD, "text-right tabular-nums whitespace-nowrap")}>{fmtDuration(l.duration_sec)}</td>
                  <td className={cn(TD, "text-right tabular-nums")}>{fmtNum(l.views)}</td>
                  <td className={cn(TD, "text-right tabular-nums")}>{fmtNum(l.completions)}</td>
                  <td className={cn(TD, "align-middle")}>
                    <div className="flex items-center gap-2">
                      <ProgressBar value={rate(l)} className="flex-1" label={`${l.title} completion rate`} />
                      <span className="w-10 text-right font-medium tabular-nums">{l.views ? `${rate(l)}%` : "—"}</span>
                    </div>
                  </td>
                  <td className={cn(TD, "text-right")}>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(l)} aria-label={`Edit ${l.title}`}>
                      <Pencil className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Mobile cards */}
        <ul className="space-y-3 md:hidden">
          {q.data.map((l) => (
            <li key={l.id}>
              <Card className="p-4">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-5 shrink-0 text-center text-base leading-5" aria-hidden>
                    {l.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{l.title}</p>
                    <p className="font-mono text-xs text-muted">{l.slug}</p>
                    <p className="text-xs text-muted">
                      {catLabel(l.category_slug)} · {fmtDuration(l.duration_sec)}
                    </p>
                    <div className="mt-1 flex gap-1.5">{!l.is_published && <Badge tone="gray">Draft</Badge>}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(l)} aria-label={`Edit ${l.title}`}>
                    <Pencil className="size-4" />
                  </Button>
                </div>
                <div className="mt-3 flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1 text-muted">
                    <Eye className="size-4" aria-hidden /> <span className="tabular-nums">{fmtNum(l.views)}</span>
                  </span>
                  <ProgressBar value={rate(l)} className="flex-1" label={`${l.title} completion rate`} />
                  <span className="font-medium tabular-nums">{l.views ? `${rate(l)}%` : "—"}</span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div>
      {header}
      {body}
      {editing && <LessonModal lesson={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ── Create / edit modal ──────────────────────────────────────────────────────
interface Form {
  slug: string;
  title: string;
  title_hi: string;
  category_slug: string;
  description: string;
  description_hi: string;
  duration_sec: string;
  emoji: string;
  video_url: string;
  is_published: boolean;
  slides: (Slide & { key: number })[];
}
let slideKey = 0;
const newSlide = (s?: Partial<Slide>) => ({ emoji: s?.emoji ?? "", text: s?.text ?? "", text_hi: s?.text_hi ?? "", key: ++slideKey });

function LessonModal({ lesson, onClose }: { lesson: AdminLesson | null; onClose: () => void }) {
  const cats = useCategoryMap();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<Form>(() => ({
    slug: lesson?.slug ?? "",
    title: lesson?.title ?? "",
    title_hi: lesson?.title_hi ?? "",
    category_slug: lesson?.category_slug ?? "general",
    description: lesson?.description ?? "",
    description_hi: lesson?.description_hi ?? "",
    duration_sec: String(lesson?.duration_sec ?? 45),
    emoji: lesson?.emoji ?? "🎬",
    video_url: lesson?.video_url ?? "",
    is_published: lesson?.is_published ?? true,
    slides: (lesson?.slides ?? []).map((s) => newSlide(s)),
  }));
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const setSlide = (i: number, patch: Partial<Slide>) =>
    setF((s) => ({ ...s, slides: s.slides.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const moveSlide = (i: number, d: -1 | 1) =>
    setF((s) => {
      const arr = [...s.slides];
      [arr[i], arr[i + d]] = [arr[i + d], arr[i]];
      return { ...s, slides: arr };
    });

  const duration = Number(f.duration_sec);
  const errors: Record<string, string> = {};
  if (!SLUG_RE.test(f.slug.trim())) errors.slug = "2–64 lowercase letters, numbers or hyphens";
  if (!f.title.trim()) errors.title = "Required";
  if (!f.description.trim()) errors.description = "Required";
  if (!Number.isInteger(duration) || duration < 10 || duration > 600) errors.duration_sec = "Between 10 and 600 seconds";
  if (f.video_url.trim() && !/^(https?:\/\/|\/)/.test(f.video_url.trim())) errors.video_url = "Use a full https:// URL";
  if (f.slides.some((s) => !s.text.trim())) errors.slides = "Every slide needs English text (or remove the empty slide).";
  const bad = Object.keys(errors).length > 0;
  const err = (k: string) => (touched ? errors[k] : undefined);

  const m = useMutation({
    mutationFn: (body: LessonIn) => (lesson ? put(`/admin/lessons/${lesson.id}`, { ...body }) : post("/admin/lessons", { ...body })),
    onSuccess: () => {
      toast({ tone: "success", title: lesson ? "Lesson updated" : f.is_published ? "Lesson published — households notified" : "Draft lesson created" });
      qc.invalidateQueries({ queryKey: ["admin", "lessons"] });
      onClose();
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (bad) return;
    m.mutate({
      slug: f.slug.trim(),
      title: f.title.trim(),
      title_hi: f.title_hi.trim() || null,
      category_slug: f.category_slug,
      description: f.description.trim(),
      description_hi: f.description_hi.trim() || null,
      duration_sec: duration,
      emoji: f.emoji.trim() || "🎬",
      video_url: f.video_url.trim() || null,
      slides: f.slides.map(({ emoji, text, text_hi }) => ({ emoji: emoji.trim(), text: text.trim(), text_hi: text_hi.trim() })),
      is_published: f.is_published,
    });
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={lesson ? `Edit “${lesson.title}”` : "New lesson"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={m.isPending} onClick={() => submit()}>
            {lesson ? "Save changes" : f.is_published ? "Publish lesson" : "Save draft"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-6" noValidate>
        <fieldset className="space-y-4">
          <legend className="eyebrow mb-1">Basics</legend>
          <p className="text-[13px] text-muted">What the lesson is called and where it appears in Learn.</p>
          <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
            <Field label="Title" error={err("title")}>
              {(id) => <Input id={id} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Why rinse milk packets?" />}
            </Field>
            <Field label="Emoji">{(id) => <Input id={id} value={f.emoji} onChange={(e) => set("emoji", e.target.value)} />}</Field>
          </div>
          <Field label="Title (Hindi)" optional="optional">
            {(id) => <Input id={id} value={f.title_hi} onChange={(e) => set("title_hi", e.target.value)} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Slug" error={err("slug")} hint={lesson ? "Changing it breaks shared links" : "e.g. rinse-milk-packets"}>
              {(id) => <Input id={id} value={f.slug} onChange={(e) => set("slug", e.target.value)} className="font-mono" />}
            </Field>
            <Field label="Category">
              {(id) => (
                <Select id={id} value={f.category_slug} onChange={(e) => set("category_slug", e.target.value)}>
                  <option value="general">General</option>
                  {cats.list.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Duration (seconds)" error={err("duration_sec")}>
              {(id) => (
                <Input id={id} type="number" inputMode="numeric" min={10} max={600} value={f.duration_sec} onChange={(e) => set("duration_sec", e.target.value)} className="tabular-nums" />
              )}
            </Field>
          </div>
          <Field label="Description" error={err("description")}>
            {(id) => <Textarea id={id} value={f.description} onChange={(e) => set("description", e.target.value)} className="min-h-20" />}
          </Field>
          <Field label="Description (Hindi)" optional="optional">
            {(id) => <Textarea id={id} value={f.description_hi} onChange={(e) => set("description_hi", e.target.value)} className="min-h-20" />}
          </Field>
          <Field label="Video URL" optional="optional" error={err("video_url")} hint="Leave empty to play the slides as the lesson.">
            {(id) => <Input id={id} type="url" value={f.video_url} onChange={(e) => set("video_url", e.target.value)} placeholder="https://…" />}
          </Field>
        </fieldset>

        <fieldset>
          <legend className="eyebrow mb-1">Slides</legend>
          <p className="mb-3 text-sm text-muted">One short idea per slide. Shown in order.</p>
          {f.slides.length === 0 && (
            <p className="mb-3 rounded-lg border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-muted">No slides yet.</p>
          )}
          <ol className="space-y-3">
            {f.slides.map((s, i) => (
              <li key={s.key} className="rounded-lg border border-line p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium">Slide {i + 1}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => moveSlide(i, -1)} aria-label={`Move slide ${i + 1} up`}>
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" disabled={i === f.slides.length - 1} onClick={() => moveSlide(i, 1)} aria-label={`Move slide ${i + 1} down`}>
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setF((x) => ({ ...x, slides: x.slides.filter((_, j) => j !== i) }))}
                      aria-label={`Remove slide ${i + 1}`}
                      className="hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-[4.5rem_1fr_1fr]">
                  <Input value={s.emoji} onChange={(e) => setSlide(i, { emoji: e.target.value })} aria-label={`Slide ${i + 1} emoji`} placeholder="🥛" className="text-center" />
                  <Input
                    value={s.text}
                    onChange={(e) => setSlide(i, { text: e.target.value })}
                    aria-label={`Slide ${i + 1} text (English)`}
                    placeholder="Text (English)"
                    className={cn(touched && !s.text.trim() && "border-red-400")}
                  />
                  <Input value={s.text_hi} onChange={(e) => setSlide(i, { text_hi: e.target.value })} aria-label={`Slide ${i + 1} text (Hindi)`} placeholder="Text (Hindi)" />
                </div>
              </li>
            ))}
          </ol>
          {err("slides") && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {err("slides")}
            </p>
          )}
          <Button size="sm" variant="soft" className="mt-3" icon={<Plus className="size-4" />} onClick={() => set("slides", [...f.slides, newSlide()])}>
            Add slide
          </Button>
        </fieldset>

        <div className="rounded-lg border border-line px-4">
          <Toggle
            checked={f.is_published}
            onChange={(v) => set("is_published", v)}
            label="Published"
            description={lesson ? "Visible to households in Learn." : "Publishing a new lesson notifies every active household."}
          />
        </div>
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
