"use client";

import { useEffect, useRef } from "react";
import type { AIHint } from "@/hooks/useAIHints";

interface AIHintsPanelProps {
  hints: AIHint[];
  isLoading: boolean;
  error: string | null;
  onGenerateSummary?: () => void;
  onFeedback: (hintId: string, isAccepted: boolean) => void;
}

const HINT_TYPE_CONFIG: Record<
  string,
  { bg: string; badge: string; icon: string; label: string }
> = {
  FACT_CHECK: {
    bg: "border-red-500/40 bg-red-500/10",
    badge: "bg-red-500/30 text-red-200",
    icon: "\u{1F534}",
    label: "Факт-чек",
  },
  WATER: {
    bg: "border-yellow-500/40 bg-yellow-500/10",
    badge: "bg-yellow-500/30 text-yellow-200",
    icon: "\u{1F7E1}",
    label: "Вода",
  },
  DEEP_DIVE: {
    bg: "border-blue-500/40 bg-blue-500/10",
    badge: "bg-blue-500/30 text-blue-200",
    icon: "\u{1F535}",
    label: "Копнуть глубже",
  },
  SOFT_SKILLS: {
    bg: "border-purple-500/40 bg-purple-500/10",
    badge: "bg-purple-500/30 text-purple-200",
    icon: "\u{1F7E3}",
    label: "Soft Skills",
  },
};

const DEFAULT_STYLE = {
  bg: "border-gray-500/40 bg-gray-500/10",
  badge: "bg-gray-500/30 text-gray-200",
  icon: "\u{26AA}",
  label: "Подсказка",
};

export function AIHintsPanel({
  hints,
  isLoading,
  error,
  onGenerateSummary,
  onFeedback,
}: AIHintsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [hints]);

  return (
    <div className="bg-gradient-to-b from-purple-900/30 to-gray-800 rounded-xl p-4 h-full flex flex-col border border-purple-500/30">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-purple-200">AI Подсказки</h3>
        <div className="flex items-center gap-2">
          {isLoading && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
              <span className="text-xs text-purple-300">Думаю...</span>
            </div>
          )}
          {onGenerateSummary && hints.length > 0 && (
            <button
              onClick={onGenerateSummary}
              className="text-xs bg-purple-600 hover:bg-purple-500 px-2 py-1 rounded transition-colors"
            >
              Итог
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-2 mb-3">
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 text-sm">
        {hints.map((hint) => {
          const cfg = hint.hintType
            ? HINT_TYPE_CONFIG[hint.hintType] || DEFAULT_STYLE
            : DEFAULT_STYLE;

          return (
            <div
              key={hint.id}
              className={`border rounded-lg p-3 space-y-2 transition-all ${cfg.bg}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded ${cfg.badge}`}
                >
                  {cfg.icon} {cfg.label}
                </span>
                <span className="text-[10px] text-gray-500">
                  {hint.timestamp.toLocaleTimeString()}
                </span>
              </div>

              {hint.title && (
                <p className="font-semibold text-white text-sm">
                  {hint.title}
                </p>
              )}

              <p className="text-purple-100 leading-relaxed">
                {hint.actionableQuestion || hint.text}
              </p>

              <div className="flex items-center justify-between pt-1">
                <span
                  className="text-[10px] text-gray-500 truncate max-w-[120px]"
                  title={hint.sourceText}
                >
                  {hint.sourceText.substring(0, 30)}...
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onFeedback(hint.id, true)}
                    className={`p-1 rounded transition-colors ${
                      hint.isAccepted === true
                        ? "bg-green-500/30 text-green-300"
                        : "text-gray-500 hover:text-green-400 hover:bg-green-500/10"
                    }`}
                    title="Полезно"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4"
                    >
                      <path d="M1 8.25a1.25 1.25 0 1 1 2.5 0v7.5a1.25 1.25 0 1 1-2.5 0v-7.5ZM5.5 6.046a.75.75 0 0 1 .573-.041 5.28 5.28 0 0 0 2.058.375c.488 0 .96-.064 1.41-.183a.75.75 0 0 1 .96.725v3.578a.75.75 0 0 1-.22.53 8.252 8.252 0 0 0-2.281 5.047.75.75 0 0 1-.748.682h-.011a1.5 1.5 0 0 1-1.491-1.333c-.17-1.418-.756-2.72-1.678-3.753A.75.75 0 0 1 4 11.3V6.616a.75.75 0 0 1 .45-.686l1.05-.464ZM12.75 5.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v8a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75v-8Z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onFeedback(hint.id, false)}
                    className={`p-1 rounded transition-colors ${
                      hint.isAccepted === false
                        ? "bg-red-500/30 text-red-300"
                        : "text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                    }`}
                    title="Бесполезно"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4"
                    >
                      <path d="M19 11.75a1.25 1.25 0 1 1-2.5 0v-7.5a1.25 1.25 0 1 1 2.5 0v7.5ZM14.5 13.954a.75.75 0 0 1-.573.041 5.28 5.28 0 0 0-2.058-.375c-.488 0-.96.064-1.41.183a.75.75 0 0 1-.96-.725V9.5a.75.75 0 0 1 .22-.53 8.252 8.252 0 0 0 2.281-5.047.75.75 0 0 1 .748-.682h.011a1.5 1.5 0 0 1 1.491 1.333c.17 1.418.756 2.72 1.678 3.753a.75.75 0 0 1 .072.374v4.684a.75.75 0 0 1-.45.686l-1.05.464ZM7.25 14.5a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75v-8a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v8Z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {hints.length === 0 && !isLoading && (
          <div className="text-gray-500 text-center py-8">
            <p className="font-medium">AI подсказки появятся здесь</p>
            <p className="text-xs mt-1">Когда кандидат ответит на вопрос</p>
          </div>
        )}

        {isLoading && hints.length === 0 && (
          <div className="text-purple-300 text-center py-8">
            <p>Анализирую ответ...</p>
          </div>
        )}
      </div>
    </div>
  );
}
