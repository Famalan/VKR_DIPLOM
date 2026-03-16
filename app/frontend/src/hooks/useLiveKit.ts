"use client";

import { useState, useCallback } from "react";
import { config } from "@/lib/config";

interface UseLiveKitProps {
  roomId: string;
  userId: string;
  role?: string;
  roomToken?: string;
}

interface UseLiveKitReturn {
  token: string | null;
  wsUrl: string;
  isLoading: boolean;
  error: string | null;
  fetchToken: () => Promise<void>;
}

export function useLiveKit({
  roomId,
  userId,
  role = "candidate",
  roomToken,
}: UseLiveKitProps): UseLiveKitReturn {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsUrl = config.livekitUrl;

  const fetchToken = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (roomToken) {
        headers["Authorization"] = `Bearer ${roomToken}`;
      }

      const response = await fetch(`${config.apiUrl}/api/livekit/token`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          room_id: roomId,
          user_id: userId,
          role,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to get LiveKit token");
      }

      const data = await response.json();
      setToken(data.token);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect";
      setError(message);
      console.error("[LiveKit] Token error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [roomId, userId, role, roomToken]);

  return { token, wsUrl, isLoading, error, fetchToken };
}
