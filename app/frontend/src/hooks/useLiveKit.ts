"use client";

import { useState, useCallback } from "react";
import { config } from "@/lib/config";

interface UseLiveKitProps {
  roomId: string;
  userId: string;
  role?: string;
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
}: UseLiveKitProps): UseLiveKitReturn {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsUrl = config.livekitUrl;

  const fetchToken = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${config.apiUrl}/api/livekit/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: roomId,
          user_id: userId,
          role,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get LiveKit token");
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
  }, [roomId, userId, role]);

  return { token, wsUrl, isLoading, error, fetchToken };
}
