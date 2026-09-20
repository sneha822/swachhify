import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, History, Mic, MicOff, Plus, SendHorizonal, ThumbsDown, ThumbsUp, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { del, get, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, timeAgo } from "@/lib/format";
import { useCategories } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useSpeaker, useVoiceInput } from "@/lib/speech";
import { useToast } from "@/lib/toast";
import type { ChatAction, ChatMessage, ChatPayload, Paged } from "@/lib/types";
import { Button, Modal } from "../ui";
import { ActionButtons, AnswerCard } from "./AnswerCard";

interface ChatResponse {
  conversation_id: number;
  guest_key: string | null;
  user_message: ChatMessage;
  reply: ChatMessage;
}

interface Pending {
  message: string;
  item_slug?: string;
  category_slug?: string;
}

function spoken(p: ChatPayload): string {
  const c = p.card;
  if (c) return [p.text, c.what_to_do, c.why, c.what_not_to_do, c.safety].filter(Boolean).join(". ");
  if (p.category_guide) return [p.text, ...p.category_guide.do].join(". ");
  if (p.steps) return [p.text, ...p.steps.map((s) => `${s.title}: ${s.text}`)].join(". ");
  return p.text;
}

export function ChatPanel({ guest = false }: { guest?: boolean }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [guestKey, setGuestKey] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: categories } = useCategories();
  const speaker = useSpeaker(lang);

  const send = useMutation({
    mutationFn: (p: Pending) =>
      post<ChatResponse>("/ai/chat", {
        ...p,
        conversation_id: conversationId,
        guest_key: guestKey,
        language: lang,
      }),
    onMutate: (p) => {
      setMessages((m) => [...m, { id: -Date.now(), role: "user", content: p.message, payload: null, feedback: null, created_at: new Date().toISOString() }]);
    },
    onSuccess: (r) => {
      setConversationId(r.conversation_id);
      if (r.guest_key) setGuestKey(r.guest_key);
      setMessages((m) => [...m.filter((x) => x.id > 0), r.user_message, r.reply]);
      if (!guest) qc.invalidateQueries({ queryKey: ["ai", "conversations"] });
    },
    onError: (e) => {
      setMessages((m) => m.filter((x) => x.id > 0));
      toast({ tone: "error", title: (e as Error).message });
    },
  });

  const ask = useCallback(
    (p: Pending) => {
      if (!p.message.trim() || send.isPending) return;
      speaker.stop();
      send.mutate({ ...p, message: p.message.trim() });
    },
    [send, speaker],
  );

  // Deep links: /app/ask?q=battery (ref guard: StrictMode runs effects twice in dev)
  const deepLinked = useRef(false);
  useEffect(() => {
    const q = params.get("q");
    if (q && !deepLinked.current) {
      deepLinked.current = true;
      setParams({}, { replace: true });
      ask({ message: q });
    }
  }, [params, setParams, ask]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, send.isPending]);

  const voice = useVoiceInput(lang, (text) => ask({ message: text }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask({ message: input });
    setInput("");
  };

  const onAction = (a: ChatAction) => {
    const needsAccount = guest || !user;
    const go = (path: string) => (needsAccount ? navigate(`/register?next=${encodeURIComponent(path)}`) : navigate(path));
    switch (a.type) {
      case "schedule_pickup":
        return go(`/app/pickups/new${a.params.category ? `?category=${a.params.category}` : ""}`);
      case "donate":
        return go(`/app/pickups/new?purpose=donate${a.params.category ? `&category=${a.params.category}` : ""}`);
      case "dropoff":
        return go(`/app/dropoffs${a.params.kind ? `?kind=${a.params.kind}` : ""}`);
      case "learn":
        return go(`/app/learn/${a.params.lesson}`);
      case "open":
        return go(a.params.path ?? "/app");
    }
  };

  const feedback = useMutation({
    mutationFn: ({ id, helpful }: { id: number; helpful: boolean }) =>
      post(`/ai/messages/${id}/feedback`, { helpful, guest_key: guestKey }),
    onSuccess: (_, v) => {
      setMessages((m) => m.map((x) => (x.id === v.id ? { ...x, feedback: v.helpful ? 1 : -1 } : x)));
      toast({ tone: "success", title: t("ai.thanks") });
    },
  });

  const toggleSpeak = (m: ChatMessage) => {
    if (speakingId === m.id) {
      speaker.stop();
      setSpeakingId(null);
    } else if (m.payload) {
      setSpeakingId(m.id);
      speaker.speak(spoken(m.payload), () => setSpeakingId(null));
    }
  };

  const newChat = () => {
    speaker.stop();
    setMessages([]);
    setConversationId(null);
    setGuestKey(null);
    inputRef.current?.focus();
  };

  const loadConversation = async (id: number) => {
    const conv = await get<{ id: number; messages: ChatMessage[] }>(`/ai/conversations/${id}`);
    setMessages(conv.messages);
    setConversationId(conv.id);
    setHistoryOpen(false);
  };

  const suggestions = lang === "hi"
    ? ["बैटरी का क्या करें?", "क्या दूध की थैली प्लास्टिक में जाएगी?", "पुराना रोबोट खिलौना", "थर्माकोल का क्या करें?", "टूटा काँच", "कचरा अलग करना सिखाइए"]
    : ["Where does a pizza box go?", "How do I dispose of batteries?", "Is an old charger e-waste?", "Can I put a milk packet with plastic?", "What do I do with thermocol?", "Teach me about waste segregation."];

  const lastSuggestions = [...messages].reverse().find((m) => m.role === "assistant")?.payload?.suggestions ?? [];

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
          <Bot className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{t("ai.title")}</h1>
          <p className="truncate text-sm text-muted">{t("ai.subtitle")}</p>
        </div>
        {!guest && (
          <Button variant="secondary" size="sm" icon={<History className="size-4" />} onClick={() => setHistoryOpen(true)} aria-label={t("ai.history")}>
            <span className="hidden sm:inline">{t("ai.history")}</span>
          </Button>
        )}
        {messages.length > 0 && (
          <Button variant="soft" size="sm" icon={<Plus className="size-4" />} onClick={newChat}>
            <span className="hidden sm:inline">{t("ai.newChat")}</span>
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-6">
            <div className="rounded-card border border-line bg-surface p-5">
              <p className="text-lg leading-snug font-medium">
                {lang === "hi" ? "“मेरे पास यह चीज़ है। मैं इसका क्या करूँ?”" : "“I have this item. What should I do with it?”"}
              </p>
              <p className="mt-1.5 text-sm text-muted">{t("ai.subtitle")}</p>
            </div>
            <div>
              <p className="eyebrow mb-2.5">{t("ai.try")}</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => ask({ message: s })} className="rounded-full border border-line-strong bg-surface px-3.5 py-1.5 text-[13px] transition-colors hover:border-brand-300 hover:bg-brand-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="eyebrow mb-2.5">{t("ai.pickCategory")}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {categories?.map((c) => (
                  <button
                    key={c.slug}
                    onClick={() => ask({ message: lang === "hi" ? c.name_hi : c.name, category_slug: c.slug })}
                    className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-canvas"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-md text-base" style={{ background: `${c.color}1a` }} aria-hidden>
                      {c.emoji}
                    </span>
                    <span className="truncate text-[13px] font-medium">{lang === "hi" ? c.name_hi : c.name}</span>
                  </button>
                ))}
              </div>
            </div>
            {guest && <p className="text-sm text-muted">{t("ai.signInToSave")}</p>}
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-xl rounded-br-sm bg-brand-700 px-3.5 py-2 text-[15px] text-white">{m.content}</p>
            </div>
          ) : (
            <div key={m.id} className="max-w-2xl space-y-2">
              {m.payload && <AssistantMessage m={m} onAction={onAction} onAsk={ask} />}
              <div className="flex flex-wrap items-center gap-1 pl-1 text-xs text-muted">
                <span>{m.payload?.source === "ai" ? t("ai.fromAi") : t("ai.fromKb")}</span>
                <span aria-hidden>·</span>
                {speaker.supported && (
                  <button onClick={() => toggleSpeak(m)} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 font-semibold hover:bg-black/5 hover:text-ink">
                    {speakingId === m.id ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                    {speakingId === m.id ? t("common.stop") : t("common.listen")}
                  </button>
                )}
                {m.payload?.kind !== "clarify" && (
                  <span className="ml-auto inline-flex items-center gap-1">
                    {m.feedback === null ? (
                      <>
                        <span className="hidden sm:inline">{t("ai.helpful")}</span>
                        <button onClick={() => feedback.mutate({ id: m.id, helpful: true })} className="rounded-lg p-1.5 hover:bg-brand-50 hover:text-brand-700" aria-label="Helpful">
                          <ThumbsUp className="size-4" />
                        </button>
                        <button onClick={() => feedback.mutate({ id: m.id, helpful: false })} className="rounded-lg p-1.5 hover:bg-red-50 hover:text-red-600" aria-label="Not helpful">
                          <ThumbsDown className="size-4" />
                        </button>
                      </>
                    ) : (
                      <span className="font-semibold text-brand-700">{t("ai.thanks")}</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          ),
        )}
        {send.isPending && (
          <div className="flex items-center gap-2 pl-1 text-muted" role="status">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-2 animate-bounce rounded-full bg-brand-500" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </span>
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className={cn("sticky z-20 mt-4 bg-gradient-to-t from-canvas via-canvas to-transparent pt-4", guest ? "bottom-4" : "bottom-24 lg:bottom-4")}>
        {lastSuggestions.length > 0 && !send.isPending && (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {lastSuggestions.map((s) => (
              <button key={s} onClick={() => ask({ message: s })} className="shrink-0 rounded-full border border-line bg-white/95 px-3 py-1.5 text-sm font-medium shadow-sm backdrop-blur hover:border-brand-300">
                {s}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={onSubmit} className="flex items-center gap-2 rounded-xl border border-line-strong bg-surface p-1.5 shadow-lift">
          {voice.supported && (
            <button
              type="button"
              onClick={voice.listening ? voice.stop : voice.start}
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-xl transition",
                voice.listening ? "animate-pulse bg-red-50 text-red-600" : "bg-canvas text-forest-700 hover:bg-brand-50",
              )}
              aria-label={voice.listening ? t("ai.listening") : t("ai.voice")}
            >
              {voice.listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </button>
          )}
          <label htmlFor="ai-input" className="sr-only">
            {t("ai.placeholder")}
          </label>
          <input
            id="ai-input"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={voice.listening ? t("ai.listening") : t("ai.placeholder")}
            maxLength={600}
            autoComplete="off"
            className="h-11 min-w-0 flex-1 bg-transparent px-2 text-[16px] outline-none placeholder:text-muted/70"
          />
          <Button type="submit" size="md" disabled={!input.trim()} loading={send.isPending} aria-label={t("ai.send")} className="shrink-0">
            <SendHorizonal className="size-5" />
          </Button>
        </form>
      </div>

      {!guest && <HistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} onOpen={loadConversation} currentId={conversationId} onDeleted={(id) => id === conversationId && newChat()} />}
    </div>
  );
}

function AssistantMessage({ m, onAction, onAsk }: { m: ChatMessage; onAction: (a: ChatAction) => void; onAsk: (p: Pending) => void }) {
  const { t } = useI18n();
  const p = m.payload!;
  if (p.kind === "answer" && p.card) return <AnswerCard payload={p} onAction={onAction} />;

  return (
    <div className=" space-y-3 rounded-card rounded-bl-lg border border-line bg-white p-4 shadow-soft sm:p-5">
      <p className="leading-relaxed whitespace-pre-line">{p.text}</p>
      {p.kind === "clarify" && p.clarify && (
        <div className="grid gap-2 sm:grid-cols-2">
          {p.clarify.options.map((o) => (
            <button
              key={o.label}
              onClick={() => onAsk({ message: o.label, item_slug: o.item_slug })}
              className="flex items-center gap-3 rounded-xl border-2 border-line bg-white px-4 py-3 text-left font-semibold transition hover:border-brand-500 hover:bg-brand-50"
            >
              <span className="text-2xl" aria-hidden>{o.emoji}</span>
              {o.label}
            </button>
          ))}
        </div>
      )}
      {p.kind === "info" && p.clarify && (
        <>
          <p className="text-sm font-semibold text-muted">{t("ai.pickCategory")}</p>
          <div className="flex flex-wrap gap-2">
            {p.clarify.options.map((o) => (
              <button key={o.label} onClick={() => onAsk({ message: o.label, category_slug: o.category_slug })} className="rounded-full border border-line px-3 py-1.5 text-sm font-medium hover:border-brand-300 hover:bg-brand-50">
                {o.emoji} {o.label}
              </button>
            ))}
          </div>
        </>
      )}
      {p.steps && (
        <ol className="grid gap-2 sm:grid-cols-3">
          {p.steps.map((s) => (
            <li key={s.title} className="rounded-xl bg-canvas p-3">
              <p className="text-2xl" aria-hidden>{s.emoji}</p>
              <p className="mt-1 font-bold">{s.title}</p>
              <p className="text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      )}
      {p.category_guide && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-brand-50 p-3">
            <p className="eyebrow flex items-center gap-1.5 text-brand-800"><Check className="size-3.5" />{t("guide.do")}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{p.category_guide.do.map((d) => <li key={d}>{d}</li>)}</ul>
          </div>
          <div className="rounded-xl bg-red-50 p-3">
            <p className="eyebrow flex items-center gap-1.5 text-red-700"><X className="size-3.5" />{t("guide.dont")}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{p.category_guide.dont.map((d) => <li key={d}>{d}</li>)}</ul>
          </div>
          {p.category_guide.examples.length > 0 && (
            <p className="text-sm text-muted sm:col-span-2">
              <span className="font-semibold text-ink">{t("guide.items")}:</span> {p.category_guide.examples.join(" · ")}
            </p>
          )}
        </div>
      )}
      {p.confidence === "low" && p.kind !== "info" && <p className="text-sm text-amber-700">{t("ai.lowConfidence")}</p>}
      <ActionButtons actions={p.actions} onAction={onAction} />
    </div>
  );
}

function HistoryModal({ open, onClose, onOpen, currentId, onDeleted }: { open: boolean; onClose: () => void; onOpen: (id: number) => void; currentId: number | null; onDeleted: (id: number) => void }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["ai", "conversations"],
    queryFn: () => get<Paged<{ id: number; title: string; updated_at: string }>>("/ai/conversations?size=50"),
    enabled: open,
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/ai/conversations/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["ai", "conversations"] });
      onDeleted(id);
    },
  });
  return (
    <Modal open={open} onClose={onClose} title={t("ai.history")}>
      {data?.items.length ? (
        <ul className="-mx-2 divide-y divide-line">
          {data.items.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-2">
              <button onClick={() => onOpen(c.id)} className={cn("min-w-0 flex-1 rounded-xl py-3 text-left", c.id === currentId && "font-bold text-brand-700")}>
                <span className="block truncate">{c.title}</span>
                <span className="text-xs text-muted">{timeAgo(c.updated_at, lang)}</span>
              </button>
              <button onClick={() => remove.mutate(c.id)} className="rounded-xl p-2 text-muted hover:bg-red-50 hover:text-red-600" aria-label="Delete chat">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-muted">—</p>
      )}
    </Modal>
  );
}
