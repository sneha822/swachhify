import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Boxes, ChevronRight, Clock, Factory, House, PackagePlus, Recycle, ShieldAlert, ShieldX, Truck, type LucideIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  IconBox,
  Input,
  LinkButton,
  Modal,
  PageHeader,
  PageSkeleton,
  ProgressBar,
  SectionTitle,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { get, post } from "@/lib/api";
import { cn, fmtKg, fmtMoney } from "@/lib/format";
import { useCategoryMap, useDocumentTitle } from "@/lib/hooks";
import { useToast } from "@/lib/toast";

// ── Shared recycler types & hooks (used by the other recycler pages) ──────────
export type VerificationStatus = "pending" | "verified" | "rejected";

export interface IndustryProfile {
  code: string;
  org_name: string;
  authorization_number: string | null;
  accepted_categories: string[] | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  verification_status: VerificationStatus;
  contact_name: string;
  email: string;
  phone: string | null;
}

export type OrderStatus = "requested" | "approved" | "dispatched" | "received" | "processed" | "rejected" | "cancelled";

export interface IndustryOrder {
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
}

interface Material {
  category: string;
  name: string;
  emoji: string;
  color: string;
  available_kg: number;
  requested_kg: number;
}

export function useIndustryProfile() {
  return useQuery({ queryKey: ["recycler", "me"], queryFn: () => get<IndustryProfile>("/industries/me") });
}

export function RecyclerVerificationBanner({ status }: { status: VerificationStatus }) {
  if (status === "verified") return null;
  const rejected = status === "rejected";
  const Icon = rejected ? ShieldX : ShieldAlert;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-card border p-4 sm:items-center",
        rejected ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 text-sm font-medium">
        {rejected
          ? "Your organisation could not be verified. Please check your authorisation details or contact Swacchify support."
          : "Your organisation is being verified. You can browse materials now and place requests once approved."}
      </p>
      <Link to="/recycler/profile" className="text-[13px] font-medium underline underline-offset-2">
        Review profile
      </Link>
    </div>
  );
}

export const PROCESSING_METHODS = [
  "Mechanical recycling",
  "Pelletising / granulation",
  "Paper pulping",
  "Metal smelting",
  "Glass cullet / re-melting",
  "E-waste dismantling & recovery",
  "Refurbishment / reuse",
  "Co-processing",
];

// ── Flow explainer ────────────────────────────────────────────────────────────
const FLOW: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: House, title: "Household", text: "Segregates dry waste at source" },
  { icon: Truck, title: "Collection partner", text: "Collects and weighs at the door" },
  { icon: Factory, title: "Swacchify hub", text: "Verifies weight and quality" },
  { icon: Recycle, title: "You", text: "Receive traceable, verified material" },
];

function FlowExplainer() {
  return (
    <Card as="section" className="p-4 sm:p-5" aria-labelledby="flow-title">
      <h2 id="flow-title" className="text-[15px] font-semibold">
        How material reaches you
      </h2>
      <p className="mt-1 text-[13px] text-muted">
        Everything listed here has been weighed and quality-checked at our hub. Each lot is traceable back to the pickups it came from.
      </p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FLOW.map((s, i) => (
          <li key={s.title} className="relative flex items-start gap-3 rounded-lg border border-line p-3">
            <IconBox icon={s.icon} size="sm" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                {i + 1}. {s.title}
              </span>
              <span className="mt-0.5 block text-[13px] text-muted">{s.text}</span>
            </span>
            {i < FLOW.length - 1 && (
              <ArrowRight className="absolute top-1/2 -right-3 z-10 hidden size-4 -translate-y-1/2 text-line-strong lg:block" aria-hidden />
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ── Request form ──────────────────────────────────────────────────────────────
function RequestModal({
  open,
  onClose,
  profile,
  initialCategory,
}: {
  open: boolean;
  onClose: () => void;
  profile: IndustryProfile;
  initialCategory?: string;
}) {
  const cats = useCategoryMap();
  const toast = useToast();
  const qc = useQueryClient();
  const accepted = profile.accepted_categories?.length
    ? profile.accepted_categories
    : cats.list.filter((c) => c.collectable).map((c) => c.slug);

  const [category, setCategory] = useState(initialCategory && accepted.includes(initialCategory) ? initialCategory : (accepted[0] ?? ""));
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: () =>
      post<IndustryOrder>("/industries/orders", {
        category,
        quantity_kg: Number(quantity),
        price_per_kg: Number(price),
        processing_method: method.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ["recycler"] });
      toast({ tone: "success", title: `Request ${o.code} sent`, body: "We'll review it and dispatch verified material." });
      onClose();
    },
    onError: (e) => toast({ tone: "error", title: (e as Error).message }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const q = Number(quantity);
    const p = Number(price);
    if (!category) errs.category = "Choose a material";
    if (!quantity || !Number.isFinite(q) || q <= 0) errs.quantity = "Enter a quantity above 0 kg";
    else if (q > 100000) errs.quantity = "Maximum 100,000 kg per request";
    if (price === "" || !Number.isFinite(p) || p < 0) errs.price = "Enter a price (₹0 or more)";
    else if (p > 10000) errs.price = "Maximum ₹10,000 per kg";
    setErrors(errs);
    if (Object.keys(errs).length === 0) create.mutate();
  };

  const q = Number(quantity);
  const p = Number(price);
  const estimate = q > 0 && p >= 0 && Number.isFinite(q * p) ? q * p : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request material"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="request-form" loading={create.isPending} icon={<PackagePlus className="size-4" />}>
            Send request
          </Button>
        </>
      }
    >
      <form id="request-form" onSubmit={submit} className="space-y-4" noValidate>
        {!profile.accepted_categories?.length && (
          <p className="rounded-lg border border-sea-100 bg-sea-50 px-3 py-2 text-[13px] text-sea-700">
            Tip: add your accepted materials in your{" "}
            <Link to="/recycler/profile" className="font-medium underline">
              organisation profile
            </Link>{" "}
            to narrow this list.
          </p>
        )}
        <Field label="Material" error={errors.category}>
          {(id) => (
            <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
              {accepted.map((slug) => (
                <option key={slug} value={slug}>
                  {cats.map.get(slug)?.emoji} {cats.name(slug)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quantity (kg)" error={errors.quantity}>
            {(id) => (
              <Input id={id} type="number" inputMode="decimal" min={0} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 500" required />
            )}
          </Field>
          <Field label="Offer price (₹ per kg)" error={errors.price}>
            {(id) => (
              <Input id={id} type="number" inputMode="decimal" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 18" required />
            )}
          </Field>
        </div>
        <Field label="Processing method" optional="optional" hint="How you'll process this material — shared with households as part of traceability.">
          {(id) => (
            <>
              <Input id={id} list="processing-methods" value={method} onChange={(e) => setMethod(e.target.value)} maxLength={80} placeholder="e.g. Mechanical recycling" />
              <datalist id="processing-methods">
                {PROCESSING_METHODS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Notes" optional="optional">
          {(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Grade, baling, delivery window…" />}
        </Field>
        {estimate != null && (
          <div className="flex items-center justify-between rounded-lg border border-line bg-canvas px-4 py-3 text-sm">
            <span className="text-muted">Estimated value (before 18% GST)</span>
            <span className="text-[15px] font-semibold tabular-nums">{fmtMoney(estimate)}</span>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RecyclerHome() {
  useDocumentTitle("Materials");
  const profile = useIndustryProfile();
  const materials = useQuery({ queryKey: ["recycler", "materials"], queryFn: () => get<Material[]>("/industries/materials") });
  const [modal, setModal] = useState<{ open: boolean; category?: string; key: number }>({ open: false, key: 0 });

  if (profile.isPending) return <PageSkeleton />;
  if (profile.isError) return <ErrorState error={profile.error} onRetry={() => profile.refetch()} />;
  const prof = profile.data;
  const verified = prof.verification_status === "verified";
  const accepted = new Set(prof.accepted_categories ?? []);
  const canRequest = (slug: string) => verified && (accepted.size === 0 || accepted.has(slug));
  const openRequest = (category?: string) => setModal((m) => ({ open: true, category, key: m.key + 1 }));

  const list = [...(materials.data ?? [])].sort(
    (a, b) => Number(accepted.has(b.category)) - Number(accepted.has(a.category)) || b.available_kg - a.available_kg,
  );
  const maxKg = Math.max(1, ...list.map((m) => m.available_kg));
  const totalKg = list.reduce((s, m) => s + m.available_kg, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Materials"
        icon={Boxes}
        subtitle={`Verified, segregated material available at the Swacchify hub for ${prof.org_name}.`}
        actions={
          <Button onClick={() => openRequest()} disabled={!verified} icon={<PackagePlus className="size-4" />}>
            Request material
          </Button>
        }
      />

      <RecyclerVerificationBanner status={prof.verification_status} />

      <section>
        <SectionTitle action={materials.data && <span className="text-[13px] text-muted tabular-nums">{fmtKg(totalKg)} available in total</span>}>
          Available now
        </SectionTitle>
        {materials.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-44" />
            ))}
          </div>
        ) : materials.isError ? (
          <ErrorState error={materials.error} onRetry={() => materials.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState icon={Boxes} title="No materials listed yet" text="Verified material will appear here as households' pickups are checked at the hub." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((m) => {
              const mine = accepted.has(m.category);
              return (
                <Card key={m.category} as="article" className="flex flex-col p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-lg text-lg"
                      style={{ backgroundColor: `${m.color}1a` }}
                      aria-hidden
                    >
                      {m.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold">{m.name}</h3>
                      {mine && <p className="text-[13px] text-brand-700">In your accepted materials</p>}
                    </div>
                  </div>
                  <p className="mt-4 text-2xl font-semibold tracking-tight tabular-nums">{fmtKg(m.available_kg)}</p>
                  <p className="text-[13px] text-muted">verified &amp; unallocated</p>
                  <ProgressBar value={m.available_kg} max={maxKg} className="mt-3" label={`${m.name} availability`} />
                  <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
                    <Clock className="size-3.5 shrink-0" aria-hidden />
                    {m.requested_kg > 0 ? `${fmtKg(m.requested_kg)} in pending requests` : "No pending requests"}
                  </p>
                  <div className="mt-4 flex-1" />
                  <Button
                    variant={canRequest(m.category) ? "soft" : "secondary"}
                    block
                    disabled={!canRequest(m.category)}
                    onClick={() => openRequest(m.category)}
                    title={!verified ? "Available once your organisation is verified" : !canRequest(m.category) ? "Add this material to your profile first" : undefined}
                  >
                    Request {m.name.toLowerCase()}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <FlowExplainer />

      <div className="flex flex-wrap gap-2">
        <LinkButton to="/recycler/orders" variant="secondary" icon={<ChevronRight className="size-4" />}>
          View my orders
        </LinkButton>
        <LinkButton to="/recycler/invoices" variant="ghost">
          Invoices
        </LinkButton>
      </div>

      {modal.open && (
        <RequestModal key={modal.key} open onClose={() => setModal((m) => ({ ...m, open: false }))} profile={prof} initialCategory={modal.category} />
      )}
    </div>
  );
}
