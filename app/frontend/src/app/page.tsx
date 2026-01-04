"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { config } from "@/lib/config";

export default function HomePage() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [roomLink, setRoomLink] = useState<string | null>(null);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createRoom = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(`${config.apiUrl}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error("Failed to create room");
      }

      const room = await response.json();
      const link = `${window.location.origin}/room/${room.id}`;
      setRoomLink(link);
    } catch (err) {
      console.error("Failed to create room:", err);
      setError("Не удалось создать комнату. Проверьте подключение к серверу.");
    } finally {
      setIsCreating(false);
    }
  };

  const joinRoom = () => {
    if (joinRoomId.trim()) {
      router.push(`/room/${joinRoomId.trim()}`);
    }
  };

  const copyLink = async () => {
    if (roomLink) {
      await navigator.clipboard.writeText(roomLink);
    }
  };

  const goToRoom = () => {
    if (roomLink) {
      const roomId = roomLink.split("/room/")[1];
      router.push(`/room/${roomId}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-lg w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Interview Platform</h1>
          <p className="text-gray-400">
            Платформа для видеособеседований с ИИ-анализом
          </p>
        </div>

        {error && (
          <div className="bg-red-500/20 text-red-400 p-4 rounded-lg mb-6 text-center">
            {error}
          </div>
        )}

        <div className="bg-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Создать комнату</h2>

          {!roomLink ? (
            <button
              onClick={createRoom}
              disabled={isCreating}
              className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              {isCreating ? "Создание..." : "Создать новую комнату"}
            </button>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomLink}
                  readOnly
                  className="flex-1 bg-gray-700 px-4 py-2 rounded-lg text-sm font-mono"
                />
                <button
                  onClick={copyLink}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                  title="Копировать ссылку"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={goToRoom}
                  className="flex-1 py-3 px-6 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors"
                >
                  Войти в комнату
                </button>
                <button
                  onClick={() => setRoomLink(null)}
                  className="py-3 px-6 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                >
                  Новая
                </button>
              </div>

              <p className="text-sm text-gray-400 text-center">
                Отправьте ссылку собеседнику для подключения
              </p>
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded-2xl p-6">
          <h2 className="text-xl font-semibold mb-4">Присоединиться</h2>

          <div className="flex gap-2">
            <input
              type="text"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              placeholder="Введите ID комнаты"
              className="flex-1 bg-gray-700 px-4 py-3 rounded-lg placeholder-gray-500"
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
            />
            <button
              onClick={joinRoom}
              disabled={!joinRoomId.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              Войти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
