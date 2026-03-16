"use client";

import { useEffect, useRef } from "react";

interface TranscriptionResult {
  userId: string;
  role?: string;
  roleLabel?: string;
  text: string;
}

interface TranscriptionPanelProps {
  transcriptions: TranscriptionResult[];
  currentText: string;
  isConnected: boolean;
  isReconnecting: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  interviewer: "text-purple-400",
  candidate: "text-blue-400",
};

export function TranscriptionPanel({
  transcriptions,
  currentText,
  isConnected,
  isReconnecting,
}: TranscriptionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptions, currentText]);

  const statusDot = isReconnecting
    ? "bg-yellow-500 animate-pulse"
    : isConnected
      ? "bg-green-500"
      : "bg-gray-500";

  const statusText = isReconnecting
    ? "Переподключение..."
    : isConnected
      ? "Записывает"
      : "Отключено";

  return (
    <div className="bg-gray-800 rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Транскрипция</h3>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusDot}`} />
          <span className="text-xs text-gray-400">{statusText}</span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2 text-sm"
      >
        {transcriptions.map((t, i) => {
          const roleColor = ROLE_COLORS[t.role || "candidate"] || "text-gray-400";
          const label = t.roleLabel || (t.role === "interviewer" ? "Интервьюер" : "Кандидат");

          return (
            <div key={i} className="bg-gray-700/50 rounded-lg p-2">
              <span className={`text-xs font-medium ${roleColor}`}>
                {label}
              </span>
              <p className="text-gray-300 mt-0.5">{t.text}</p>
            </div>
          );
        })}

        {currentText && (
          <div className="bg-blue-500/20 rounded-lg p-2 border border-blue-500/30">
            <p className="text-blue-200">{currentText}</p>
          </div>
        )}

        {transcriptions.length === 0 && !currentText && (
          <div className="text-gray-500 text-center py-8">
            Транскрипция появится здесь...
          </div>
        )}
      </div>
    </div>
  );
}
