"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { config } from "@/lib/config";

export default function HomePage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [position, setPosition] = useState("");
  const [interviewContext, setInterviewContext] = useState("");

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const createRoom = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const body: { position?: string; interview_context?: string } = {};
      const trimmedPosition = position.trim();
      const trimmedContext = interviewContext.trim();
      if (trimmedPosition) body.position = trimmedPosition;
      if (trimmedContext) body.interview_context = trimmedContext;

      const response = await fetch(`${config.apiUrl}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error("Failed to create room");
      }

      const room = await response.json();
      const candidateLink = `${window.location.origin}/room/${room.id}`;

      try {
        await navigator.clipboard.writeText(candidateLink);
        showToast("Ссылка для кандидата скопирована в буфер обмена");
      } catch {
        showToast("Комната создана. Скопируйте ссылку вручную: " + candidateLink);
      }

      const params = new URLSearchParams();
      params.set("role", "interviewer");
      if (room.token) {
        params.set("token", room.token);
      }
      router.push(`/room/${room.id}?${params.toString()}`);
    } catch (err) {
      console.error("Failed to create room:", err);
      setError("Не удалось создать комнату. Проверьте подключение к серверу.");
      setIsCreating(false);
    }
  };

  const joinRoom = () => {
    const raw = joinRoomId.trim();
    if (!raw) return;
    const match = raw.match(/room\/([a-f0-9-]+)/i);
    const id = match ? match[1] : raw;
    router.push(`/room/${id}`);
  };

  return (
    <div className="min-h-[100svh] flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 relative">
      {toast && (
        <div className="fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl shadow-lg text-xs sm:text-sm font-medium animate-fade-in max-w-[calc(100vw-2rem)] text-center">
          {toast}
        </div>
      )}

      <div className="max-w-lg w-full">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 sm:mb-4">Interview Platform</h1>
          <p className="text-sm sm:text-base text-gray-400">
            Платформа для видеособеседований с ИИ-анализом
          </p>
        </div>

        {error && (
          <div className="bg-red-500/20 text-red-400 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 text-center text-sm">
            {error}
          </div>
        )}

        <div className="bg-gray-800 rounded-2xl p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-2">Начать собеседование</h2>
          <p className="text-xs sm:text-sm text-gray-400 mb-4">
            Вы войдёте как интервьюер. Ссылка для кандидата скопируется автоматически.
          </p>

          <button
            type="button"
            onClick={() => setShowContext((v) => !v)}
            className="w-full mb-3 flex items-center justify-between text-left text-xs sm:text-sm text-gray-300 hover:text-white transition-colors px-3 py-2 rounded-lg bg-gray-700/40 hover:bg-gray-700/60"
          >
            <span>Контекст вакансии для ИИ-подсказок (опционально)</span>
            <span
              className={`transition-transform text-gray-400 ${
                showContext ? "rotate-180" : ""
              }`}
            >
              ▾
            </span>
          </button>

          {showContext && (
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Позиция
                </label>
                <input
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Например: Senior Backend Python Developer"
                  className="w-full bg-gray-700 px-3 py-2 rounded-lg placeholder-gray-500 text-sm"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Контекст и фокус собеседования
                </label>
                <textarea
                  value={interviewContext}
                  onChange={(e) => setInterviewContext(e.target.value)}
                  placeholder="Стек: Python, FastAPI, PostgreSQL, Redis. Фокус: асинхронность, дизайн API, оптимизация SQL. Кого ищем: опыт от 4 лет, лидерские качества."
                  rows={4}
                  className="w-full bg-gray-700 px-3 py-2 rounded-lg placeholder-gray-500 text-sm resize-y"
                  maxLength={2000}
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Этот текст увидит только ИИ-суфлёр — он будет копать глубже по
                  вашему стеку и фокусным темам.
                </p>
              </div>
            </div>
          )}

          <button
            onClick={createRoom}
            disabled={isCreating}
            className="w-full py-3 px-4 sm:px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium transition-colors text-sm sm:text-base"
          >
            {isCreating ? "Создание..." : "Создать комнату"}
          </button>
        </div>

        <div className="bg-gray-800 rounded-2xl p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-2">Присоединиться</h2>
          <p className="text-xs sm:text-sm text-gray-400 mb-4">
            Вставьте ссылку или ID комнаты от интервьюера
          </p>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              placeholder="Ссылка или ID комнаты"
              className="flex-1 bg-gray-700 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg placeholder-gray-500 text-sm sm:text-base min-w-0"
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            />
            <button
              onClick={joinRoom}
              disabled={!joinRoomId.trim()}
              className="px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium transition-colors text-sm sm:text-base"
            >
              Войти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
