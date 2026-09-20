import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Factory,
  GraduationCap,
  Home,
  Info,
  MessagesSquare,
  PlayCircle,
  Recycle,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Truck,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { PublicLayout } from "@/components/PublicLayout";
import { Card, IconBox, LinkButton } from "@/components/ui";
import { get } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtNum, pick } from "@/lib/format";
import { useCategories, useDocumentTitle } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Lesson } from "@/lib/types";

interface PlatformImpact {
  total_kg: number;
  pickups: number;
  households: number;
  co2e_kg_est: number;
}

const JOURNEY: { icon: LucideIcon; en: string; hi: string }[] = [
  { icon: Trash2, en: "Your waste", hi: "आपका कचरा" },
  { icon: MessagesSquare, en: "Ask", hi: "पूछें" },
  { icon: GraduationCap, en: "Understand", hi: "समझें" },
  { icon: SlidersHorizontal, en: "Segregate", hi: "अलग करें" },
  { icon: Truck, en: "Collect", hi: "इकट्ठा" },
  { icon: Recycle, en: "Recycle", hi: "रीसायकल" },
  { icon: BarChart3, en: "Impact", hi: "असर" },
];

export default function Landing() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  useDocumentTitle("");
  const { data: impact } = useQuery({ queryKey: ["impact", "platform"], queryFn: () => get<PlatformImpact>("/impact/platform") });
  const { data: lessons } = useQuery({ queryKey: ["lessons", "public"], queryFn: () => get<Lesson[]>("/learning/lessons") });
  const { data: categories } = useCategories();
  const pickupHref = user?.role === "customer" ? "/app/pickups/new" : "/register?next=/app/pickups/new";
  const hi = lang === "hi";

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div>
            <p className="eyebrow">{hi ? "घरेलू कचरा सहायक" : "The household waste assistant"}</p>
            <h1 className="mt-3 text-[34px] leading-[1.1] font-semibold tracking-tight sm:text-5xl">{t("brand.tagline")}</h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-2">
              {hi
                ? "स्वच्छिफ़ाई घरों को रोज़ के कचरे को समझने, अलग करने, सीखने, इकट्ठा कराने और ज़िम्मेदारी से संभालने में मदद करता है।"
                : "Swacchify helps households understand, segregate, learn, collect and responsibly manage everyday waste — one simple decision at a time."}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <LinkButton to="/ask" size="lg" icon={<Bot className="size-4" />}>
                {t("home.ask")}
              </LinkButton>
              <LinkButton to={pickupHref} size="lg" variant="secondary" icon={<Truck className="size-4" />}>
                {hi ? "पिकअप बुक करें" : "Schedule a pickup"}
              </LinkButton>
            </div>
            <p className="mt-6 flex items-center gap-2 text-[13px] text-muted">
              <ShieldCheck className="size-4 shrink-0 text-brand-600" />
              {hi ? "संग्रह साथी आपका नाम नहीं, सिर्फ़ आपकी स्वच्छिफ़ाई आईडी देखते हैं।" : "Collection partners see your Swacchify ID — never your name."}
            </p>
          </div>

          {/* Product preview: the real answer shape */}
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
              <IconBox icon={Bot} tone="brand" size="sm" />
              <p className="text-sm font-medium">{t("ai.title")}</p>
            </div>
            <div className="space-y-3 p-4">
              <p className="ml-auto w-fit max-w-[85%] rounded-xl rounded-br-sm bg-brand-700 px-3.5 py-2 text-sm text-white">
                {hi ? "मेरे पास बैटरी वाला पुराना रोबोट खिलौना है। क्या करूँ?" : "I have an old robot toy with a battery. What should I do?"}
              </p>
              <div className="rounded-xl border border-line">
                <div className="flex items-center gap-3 border-b border-line px-3.5 py-2.5">
                  <span className="grid size-9 place-items-center rounded-lg bg-canvas text-lg" aria-hidden>🤖</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{hi ? "इलेक्ट्रॉनिक खिलौना" : "Electronic / robot toy"}</p>
                    <p className="flex items-center gap-1.5 text-[13px] text-muted">
                      <span className="size-2 rounded-full bg-[#008300]" aria-hidden />
                      {hi ? "ई-कचरा" : "E-Waste"}
                    </p>
                  </div>
                </div>
                <ul className="space-y-2.5 p-3.5 text-[13px] leading-relaxed">
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" />
                    {hi ? "इसे घरेलू कचरे से अलग रखें।" : "Keep it separate from regular household waste."}
                  </li>
                  <li className="flex gap-2">
                    <Info className="mt-0.5 size-4 shrink-0 text-sea-600" />
                    {hi ? "इसमें इलेक्ट्रॉनिक पुर्ज़े और बैटरी है।" : "It contains electronic parts and a battery."}
                  </li>
                  <li className="flex gap-2">
                    <XCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
                    {hi ? "सामान्य प्लास्टिक में न डालें।" : "Don't mix it with ordinary plastic."}
                  </li>
                </ul>
                <div className="flex flex-wrap gap-2 border-t border-line p-3">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-2.5 py-1.5 text-xs font-medium text-white">
                    <Truck className="size-3.5" />
                    {t("ai.action.schedule_pickup")}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2">
                    <PlayCircle className="size-3.5" />
                    {hi ? "60 सेकंड का पाठ" : "60-sec e-waste guide"}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Live numbers */}
      {impact && impact.total_kg > 0 && (
        <section className="border-b border-line bg-canvas">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden px-4 py-8 sm:px-6 md:grid-cols-4">
            {[
              [`${fmtNum(Math.round(impact.total_kg))} kg`, hi ? "कचरा सही जगह पहुँचा" : "material diverted"],
              [fmtNum(impact.pickups), hi ? "पूरे हुए पिकअप" : "pickups completed"],
              [fmtNum(impact.households), hi ? "जुड़े परिवार" : "households"],
              [`~${fmtNum(Math.round(impact.co2e_kg_est))} kg`, hi ? "CO₂e बचत (अनुमान)" : "CO₂e avoided (estimate)"],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="text-[13px] text-muted">{l}</dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Journey */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <ol className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-none" aria-label="The Swacchify journey">
          {JOURNEY.map((j, i) => (
            <li key={j.en} className="flex shrink-0 items-center gap-1">
              <span className="flex w-24 flex-col items-center gap-2 text-center">
                <span className="grid size-10 place-items-center rounded-lg border border-line bg-surface text-ink-2">
                  <j.icon className="size-[18px]" />
                </span>
                <span className="text-[13px] font-medium">{hi ? j.hi : j.en}</span>
              </span>
              {i < JOURNEY.length - 1 && <ArrowRight className="mb-6 size-4 shrink-0 text-line-strong" aria-hidden />}
            </li>
          ))}
        </ol>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="eyebrow">{hi ? "कैसे काम करता है" : "How it works"}</p>
          <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            {hi ? "उलझन से आदत तक — चार आसान कदम" : "From “where does this go?” to a lasting habit"}
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Bot, t: hi ? "पूछें" : "Ask", d: hi ? "कोई भी चीज़ लिखें या बोलें। जवाब सत्यापित गाइड से आते हैं।" : "Type or speak any item. Answers come from a verified waste guide." },
              { icon: GraduationCap, t: hi ? "सीखें" : "Learn", d: hi ? "एक मिनट के पाठ, छोटे क्विज़ और रोज़ की टिप।" : "One-minute lessons, quick quizzes and a daily tip." },
              { icon: Truck, t: hi ? "पिकअप" : "Pickup", d: hi ? "सूखा कचरा दरवाज़े से, लाइव ट्रैकिंग के साथ।" : "Doorstep collection of dry waste with live tracking." },
              { icon: Wallet, t: hi ? "इनाम और असर" : "Reward & impact", d: hi ? "सत्यापित वज़न पर पॉइंट, और देखें आपका कचरा कहाँ गया।" : "Points on verified weight — and see where your waste went." },
            ].map((s, i) => (
              <div key={s.t}>
                <div className="flex items-center gap-3">
                  <IconBox icon={s.icon} tone="brand" size="sm" />
                  <span className="text-[13px] font-medium text-muted tabular-nums">0{i + 1}</span>
                </div>
                <p className="mt-3 font-medium">{s.t}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Assistant */}
      <section className="bg-forest-800 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="eyebrow text-brand-200">{t("ai.title")}</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              {hi ? "“मेरे पास यह चीज़ है। मैं इसका क्या करूँ?”" : "“I have this item. What should I do with it?”"}
            </h2>
            <p className="mt-4 max-w-lg leading-relaxed text-brand-100">
              {hi
                ? "आसान भाषा में जवाब: श्रेणी, क्या करें, क्यों, क्या न करें — और अगला कदम। अंग्रेज़ी और हिन्दी में।"
                : "Simple answers: the category, what to do, why, what not to do — and the next step. In English and Hindi."}
            </p>
            <LinkButton to="/ask" size="lg" className="mt-8 bg-white text-forest-800 hover:bg-brand-50" icon={<Bot className="size-4" />}>
              {hi ? "अभी पूछें — बिना खाता बनाए" : "Try it — no sign-up"}
            </LinkButton>
          </div>
          <div className="flex flex-wrap content-center gap-2">
            {(hi
              ? ["बैटरी का क्या करें?", "थर्माकोल", "दूध की थैली", "पुराना चार्जर", "टूटा काँच", "पुराने कपड़े", "पिज़्ज़ा बॉक्स", "सीएफ़एल बल्ब"]
              : ["What do I do with batteries?", "Thermocol", "Milk packet", "Old charger", "Broken glass", "Old clothes", "Pizza box", "CFL bulb", "Wet wipes", "Old phone"]
            ).map((q) => (
              <Link
                key={q}
                to={`/ask?q=${encodeURIComponent(q)}`}
                className="rounded-lg border border-white/15 bg-white/[0.07] px-3 py-1.5 text-sm transition-colors hover:bg-white/15"
              >
                {q}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">{hi ? "सात आसान श्रेणियाँ" : "Seven simple categories"}</h2>
        <p className="mt-2 max-w-2xl text-ink-2">
          {hi ? "कोई तकनीकी शब्द नहीं। हम साफ़ सूखा कचरा लेते हैं; बाकी के लिए सही रास्ता बताते हैं।" : "No jargon. We collect clean dry waste, and guide you on everything else."}
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {categories?.map((c) => (
            <div key={c.slug} className="rounded-card border border-line bg-surface p-4">
              <span className="grid size-9 place-items-center rounded-lg text-lg" style={{ background: `${c.color}1a` }} aria-hidden>
                {c.emoji}
              </span>
              <p className="mt-3 text-sm font-medium">{pick(lang, c.name, c.name_hi)}</p>
              <p className="mt-1 text-[13px] leading-snug text-muted">{pick(lang, c.short, c.short_hi)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Learn */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">{t("nav.learn")}</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">{t("learn.title")}</h2>
              <p className="mt-2 text-ink-2">{t("learn.sub")}</p>
            </div>
            <LinkButton to="/register?next=/app/learn" variant="secondary" size="sm">
              {t("common.seeAll")}
            </LinkButton>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {lessons?.slice(0, 4).map((l) => (
              <div key={l.slug} className="overflow-hidden rounded-card border border-line">
                <div className="relative grid aspect-[16/9] place-items-center bg-canvas">
                  <PlayCircle className="size-8 text-line-strong" aria-hidden />
                  <span className="absolute right-2.5 bottom-2.5 rounded bg-ink/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
                    {t("learn.sec", { n: l.duration_sec })}
                  </span>
                </div>
                <p className="p-3.5 text-sm font-medium">{pick(lang, l.title, l.title_hi)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audiences */}
      <section id="partners" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">{hi ? "सबके लिए बना" : "Built for everyone in the loop"}</h2>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {[
            { icon: Home, title: hi ? "परिवारों के लिए" : "For households", text: hi ? "आसान जवाब, छोटे पाठ, दरवाज़े से पिकअप और इनाम।" : "Simple answers, short lessons, doorstep pickups and rewards.", cta: t("auth.signUp"), to: "/register" },
            { icon: Truck, title: hi ? "संग्रह साथियों के लिए" : "For collection partners", text: hi ? "आसपास के पिकअप, नेविगेशन, वज़न दर्ज करें और हर पिकअप पर कमाएँ।" : "Nearby pickups, navigation, simple weight entry and earnings on every pickup.", cta: hi ? "साथी बनें" : "Become a partner", to: "/register?role=partner" },
            { icon: Factory, title: hi ? "रीसायकलिंग साथियों के लिए" : "For recycling partners", text: hi ? "सत्यापित, छँटी हुई सामग्री — ऑर्डर, इनवॉइस और पूरी ट्रेसबिलिटी।" : "Verified, segregated material — with orders, invoices and full traceability.", cta: hi ? "सामग्री पाएँ" : "Source material", to: "/register?role=recycler" },
          ].map((a) => (
            <Card key={a.title} className="flex flex-col p-5">
              <IconBox icon={a.icon} />
              <p className="mt-4 font-medium">{a.title}</p>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{a.text}</p>
              <Link to={a.to} className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
                {a.cta} <ArrowRight className="size-3.5" />
              </Link>
            </Card>
          ))}
        </div>
      </section>

      {/* Closing */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">{t("brand.secondary")}</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <LinkButton to="/ask" size="lg" icon={<Bot className="size-4" />}>
              {t("home.ask")}
            </LinkButton>
            <LinkButton to="/register" size="lg" variant="secondary">
              {t("auth.signUp")}
            </LinkButton>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
