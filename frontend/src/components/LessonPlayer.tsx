import { Check, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn, pick } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useSpeaker } from "@/lib/speech";
import type { Lesson } from "@/lib/types";

function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : null;
}

/**
 * Plays a micro-lesson. With `video_url` it shows the video; otherwise it runs the lesson's
 * story slides with optional narration (text-to-speech) — works offline and in Hindi.
 */
export function LessonPlayer({ lesson, onProgress }: { lesson: Lesson; onProgress: (pct: number) => void }) {
  if (lesson.video_url) return <VideoPlayer url={lesson.video_url} onProgress={onProgress} />;
  return <SlidePlayer lesson={lesson} onProgress={onProgress} />;
}

function VideoPlayer({ url, onProgress }: { url: string; onProgress: (pct: number) => void }) {
  const yt = youtubeId(url);
  if (yt) {
    return (
      <div className="space-y-2">
        <div className="aspect-video overflow-hidden rounded-card bg-black">
          <iframe className="size-full" src={`https://www.youtube-nocookie.com/embed/${yt}?rel=0`} title="Lesson video" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen />
        </div>
        <button onClick={() => onProgress(100)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
          <Check className="size-4" /> I watched it
        </button>
      </div>
    );
  }
  return (
    <video
      className="aspect-video w-full rounded-card bg-black"
      src={url}
      controls
      playsInline
      onTimeUpdate={(e) => {
        const v = e.currentTarget;
        if (v.duration) onProgress(Math.min(100, Math.round((v.currentTime / v.duration) * 100) >= 90 ? 100 : Math.round((v.currentTime / v.duration) * 100)));
      }}
    />
  );
}

function SlidePlayer({ lesson, onProgress }: { lesson: Lesson; onProgress: (pct: number) => void }) {
  const { t, lang } = useI18n();
  const slides = lesson.slides ?? [];
  const perSlide = Math.max(4, Math.round(lesson.duration_sec / Math.max(slides.length, 1))) * 1000;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [narrate, setNarrate] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const speaker = useSpeaker(lang);
  const finished = useRef(false);
  const text = slides[idx] ? pick(lang, slides[idx].text, slides[idx].text_hi) : "";

  const goTo = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(slides.length - 1, i));
      setIdx(clamped);
      setElapsed(0);
      onProgress(Math.round(((clamped + 1) / slides.length) * 100));
    },
    [slides.length, onProgress],
  );

  // Timer drives the story; narration speaks each slide as it appears.
  useEffect(() => {
    if (!playing) return;
    const tick = setInterval(() => setElapsed((e) => e + 100), 100);
    return () => clearInterval(tick);
  }, [playing]);

  useEffect(() => {
    if (!playing || elapsed < perSlide) return;
    if (idx < slides.length - 1) goTo(idx + 1);
    else {
      setPlaying(false);
      finished.current = true;
      onProgress(100);
    }
  }, [elapsed, perSlide, playing, idx, slides.length, goTo, onProgress]);

  const { speak, stop } = speaker;
  useEffect(() => {
    if (playing && narrate) speak(text);
    else stop();
  }, [text, playing, narrate, speak, stop]);

  const toggle = () => {
    if (finished.current && idx === slides.length - 1) {
      finished.current = false;
      goTo(0);
    }
    setPlaying((p) => !p);
  };

  if (!slides.length) return null;
  return (
    <div className="overflow-hidden rounded-card bg-forest-800 text-white">
      <div className="flex gap-1.5 px-4 pt-4" aria-hidden>
        {slides.map((_, i) => (
          <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
            <div className="h-full bg-white transition-[width] duration-100 ease-linear" style={{ width: i < idx ? "100%" : i === idx ? `${Math.min(100, (elapsed / perSlide) * 100)}%` : "0%" }} />
          </div>
        ))}
      </div>
      <button onClick={toggle} className="grid aspect-video w-full place-items-center px-6 text-center sm:aspect-[16/8]" aria-label={playing ? t("learn.pause") : t("learn.play")}>
        <div key={idx} className="animate-pop">
          <p className="text-6xl sm:text-7xl" aria-hidden>{slides[idx].emoji}</p>
          <p className="mx-auto mt-5 max-w-xl text-xl leading-snug font-bold text-balance sm:text-2xl" lang={lang} aria-live="polite">
            {text}
          </p>
        </div>
      </button>
      <div className="flex items-center gap-2 border-t border-white/10 bg-black/15 px-3 py-2.5">
        <button onClick={() => goTo(idx - 1)} disabled={idx === 0} className="rounded-xl p-2 hover:bg-white/10 disabled:opacity-30" aria-label="Previous">
          <ChevronLeft className="size-5" />
        </button>
        <button onClick={toggle} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 font-bold text-forest-800">
          {playing ? <Pause className="size-4" /> : finished.current ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
          {playing ? t("learn.pause") : finished.current ? t("learn.replay") : t("learn.play")}
        </button>
        <button onClick={() => goTo(idx + 1)} disabled={idx === slides.length - 1} className="rounded-xl p-2 hover:bg-white/10 disabled:opacity-30" aria-label="Next">
          <ChevronRight className="size-5" />
        </button>
        <span className="ml-1 text-sm font-semibold text-white/70 tabular-nums">{idx + 1}/{slides.length}</span>
        {speaker.supported && (
          <button onClick={() => setNarrate((n) => !n)} className={cn("ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/10", !narrate && "text-white/60")} aria-pressed={narrate}>
            {narrate ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            {narrate ? t("common.listen") : t("common.stop")}
          </button>
        )}
      </div>
    </div>
  );
}
