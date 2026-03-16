"use client";

import { useEffect, useRef } from "react";

interface AIHint {
  id: string;
  text: string;
  hintType: string | null;
  sourceText: string;
  timestamp: Date;
  tokensUsed: number;
}

interface AIHintsPanelProps {
  hints: AIHint[];
  isLoading: boolean;
  error: string | null;
  onGenerateSummary?: () => void;
}

const HINT_TYPE_STYLES: Record<string, { bg: string; label: string }> = {
  "УТОЧНЕНИЕ": { bg: "bg-blue-500/20 border-blue-500/40", label: "Уточнение" },
  "ПРОБЕЛ": { bg: "bg-yellow-500/20 border-yellow-500/40", label: "Пробел" },
  "STAR": { bg: "bg-green-500/20 border-green-500/40", label: "STAR" },
};

export function AIHintsPanel({
  hints,
  isLoading,
  error,
  onGenerateSummary,
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
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-purple-200">AI Подсказки</h3>
        </div>
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
          const typeStyle = hint.hintType
            ? HINT_TYPE_STYLES[hint.hintType]
            : null;
          const borderClass = typeStyle
            ? typeStyle.bg
            : "bg-purple-500/10 border-purple-500/30";

          return (
            <div
              key={hint.id}
              className={`border rounded-lg p-3 space-y-2 ${borderClass}`}
            >
              {typeStyle && (
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-white/10">
                  {typeStyle.label}
                </span>
              )}
              <div className="text-purple-100 whitespace-pre-wrap leading-relaxed">
                {hint.text}
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span
                  className="truncate max-w-[150px]"
                  title={hint.sourceText}
                >
                  {hint.sourceText.substring(0, 30)}...
                </span>
                <span>{hint.timestamp.toLocaleTimeString()}</span>
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
