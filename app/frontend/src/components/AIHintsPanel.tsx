"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AIHint, HintColor } from "@/hooks/useAIHints";

interface AIHintsPanelProps {
  hints: AIHint[];
  isLoading: boolean;
  error: string | null;
}

const HINT_LIFETIME_MS = 25_000;

const COLOR_THEME: Record<HintColor, {
  border: string;
  bg: string;
  bar: string;
  dot: string;
  badge: string;
  label: string;
}> = {
  red: {
    border: "border-red-500/60",
    bg: "bg-red-500/10",
    bar: "bg-red-500",
    dot: "bg-red-500",
    badge: "bg-red-500/20 text-red-200",
    label: "Срочно",
  },
  yellow: {
    border: "border-yellow-500/60",
    bg: "bg-yellow-500/10",
    bar: "bg-yellow-400",
    dot: "bg-yellow-400",
    badge: "bg-yellow-500/20 text-yellow-100",
    label: "Стоит уточнить",
  },
  green: {
    border: "border-emerald-500/50",
    bg: "bg-emerald-500/10",
    bar: "bg-emerald-400",
    dot: "bg-emerald-400",
    badge: "bg-emerald-500/20 text-emerald-200",
    label: "На заметку",
  },
};

const FALLBACK_THEME = {
  border: "border-gray-500/40",
  bg: "bg-gray-500/10",
  bar: "bg-gray-400",
  dot: "bg-gray-400",
  badge: "bg-gray-500/30 text-gray-200",
  label: "Подсказка",
};

function getTheme(color: HintColor | null) {
  if (color && COLOR_THEME[color]) return COLOR_THEME[color];
  return FALLBACK_THEME;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function AIHintsPanel({
  hints,
  isLoading,
  error,
}: AIHintsPanelProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showArchive, setShowArchive] = useState(false);
  const [expiredIds, setExpiredIds] = useState<Set<string>>(new Set());
  const expireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const counts = useMemo(() => {
    let red = 0,
      yellow = 0,
      green = 0;
    for (const h of hints) {
      if (h.color === "red") red++;
      else if (h.color === "yellow") yellow++;
      else if (h.color === "green") green++;
    }
    return { red, yellow, green };
  }, [hints]);

  const activeHint = useMemo(() => {
    for (let i = hints.length - 1; i >= 0; i--) {
      const h = hints[i];
      if (!dismissedIds.has(h.id) && !expiredIds.has(h.id)) return h;
    }
    return null;
  }, [hints, dismissedIds, expiredIds]);

  useEffect(() => {
    if (expireTimerRef.current) {
      clearTimeout(expireTimerRef.current);
      expireTimerRef.current = null;
    }
    if (!activeHint) return;
    expireTimerRef.current = setTimeout(() => {
      setExpiredIds((prev) => {
        if (prev.has(activeHint.id)) return prev;
        const next = new Set(prev);
        next.add(activeHint.id);
        return next;
      });
    }, HINT_LIFETIME_MS);
    return () => {
      if (expireTimerRef.current) {
        clearTimeout(expireTimerRef.current);
        expireTimerRef.current = null;
      }
    };
  }, [activeHint]);

  const archiveHints = useMemo(
    () => [...hints].reverse().filter((h) => h.id !== activeHint?.id),
    [hints, activeHint]
  );

  const handleDismiss = () => {
    if (!activeHint) return;
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(activeHint.id);
      return next;
    });
  };

  const theme = getTheme(activeHint?.color ?? null);

  return (
    <div className="bg-gradient-to-b from-purple-900/30 to-gray-800 rounded-xl p-4 h-full flex flex-col border border-purple-500/30 min-h-0">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-purple-200">AI Подсказки</h3>
          {isLoading && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-purple-300">слушает</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 text-red-200">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            {counts.red}
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-100">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
            {counts.yellow}
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {counts.green}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-2 mb-3 shrink-0">
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="shrink-0 mb-3">
          {activeHint ? (
            <div
              key={activeHint.id}
              className={`relative border rounded-xl ${theme.border} ${theme.bg} overflow-hidden`}
            >
              <div className="p-3 sm:p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${theme.dot}`}
                      aria-hidden
                    />
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${theme.badge}`}
                    >
                      {theme.label}
                    </span>
                    {activeHint.topic && (
                      <span
                        className="text-[11px] text-gray-400 truncate"
                        title={activeHint.topic}
                      >
                        · {activeHint.topic}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-500 shrink-0">
                    {formatTime(activeHint.timestamp)}
                  </span>
                </div>

                <p className="text-white text-base sm:text-lg font-semibold leading-snug whitespace-pre-wrap break-words">
                  {activeHint.actionableQuestion ||
                    activeHint.title ||
                    activeHint.text}
                </p>

                {activeHint.title && activeHint.actionableQuestion && (
                  <p
                    className="text-[11px] text-gray-400 break-words"
                    title={activeHint.title}
                  >
                    {activeHint.title}
                  </p>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleDismiss}
                    className="px-3 py-1.5 text-xs sm:text-sm bg-gray-700/70 hover:bg-gray-600 text-gray-100 rounded-lg transition-colors"
                  >
                    Скрыть
                  </button>
                </div>
              </div>

              <div
                key={`bar_${activeHint.id}`}
                className={`h-1 ${theme.bar} hint-progress-bar`}
              />
            </div>
          ) : (
            <div className="border border-dashed border-gray-700 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-sm font-medium">
                Подсказок пока нет
              </p>
              <p className="text-gray-600 text-xs mt-1">
                Появятся, когда кандидат скажет что-то важное
              </p>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            className="text-left text-xs text-gray-300 hover:text-white px-2 py-1 rounded transition-colors flex items-center justify-between shrink-0"
          >
            <span>Архив ({archiveHints.length})</span>
            <span
              className={`transition-transform text-gray-500 ${
                showArchive ? "rotate-180" : ""
              }`}
            >
              ▾
            </span>
          </button>

          {showArchive && (
            <div className="mt-2 flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
              {archiveHints.length === 0 && (
                <p className="text-[11px] text-gray-500 text-center py-4">
                  Архив пуст
                </p>
              )}
              {archiveHints.map((h) => {
                const t = getTheme(h.color);
                return (
                  <div
                    key={h.id}
                    className={`border rounded-lg p-2 ${t.border} ${t.bg}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`inline-block w-2 h-2 rounded-full shrink-0 ${t.dot}`}
                        />
                        <span className="text-[10px] text-gray-400 truncate">
                          {h.topic || t.label}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-500 shrink-0">
                        {formatTime(h.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-100 leading-snug">
                      {h.actionableQuestion || h.title || h.text}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
