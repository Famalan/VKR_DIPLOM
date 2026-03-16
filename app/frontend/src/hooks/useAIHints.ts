"use client";

import { useState, useCallback, useRef } from "react";
import { config } from "@/lib/config";

interface AIHint {
  id: string;
  text: string;
  hintType: string | null;
  sourceText: string;
  timestamp: Date;
  tokensUsed: number;
}

interface UseAIHintsProps {
  roomId: string;
}

interface UseAIHintsReturn {
  hints: AIHint[];
  isLoading: boolean;
  error: string | null;
  generateHint: (text: string) => Promise<void>;
  generateSummary: () => Promise<string | null>;
  shouldTrigger: (text: string) => boolean;
  clearHints: () => void;
}

export function useAIHints({ roomId }: UseAIHintsProps): UseAIHintsReturn {
  const [hints, setHints] = useState<AIHint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastHintTimeRef = useRef<number>(0);
  const wordsSinceLastHintRef = useRef<number>(0);

  const shouldTrigger = useCallback((text: string): boolean => {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    wordsSinceLastHintRef.current += wordCount;

    const timeSinceLastHint = Date.now() - lastHintTimeRef.current;
    const enoughPause = timeSinceLastHint > 3000;
    const enoughWords = wordsSinceLastHintRef.current >= 5;

    return enoughPause && enoughWords;
  }, []);

  const generateHint = useCallback(
    async (text: string) => {
      if (!text.trim() || text.length < 10) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${config.apiUrl}/api/ai/hint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room_id: roomId, text }),
        });

        if (!response.ok) {
          throw new Error("Failed to generate hint");
        }

        const data = await response.json();

        const newHint: AIHint = {
          id: `hint_${Date.now()}`,
          text: data.hint,
          hintType: data.hint_type || null,
          sourceText: text,
          timestamp: new Date(),
          tokensUsed: data.tokens_used || 0,
        };

        setHints((prev) => [...prev, newHint]);
        lastHintTimeRef.current = Date.now();
        wordsSinceLastHintRef.current = 0;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        console.error("[AI Hints] Error:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [roomId]
  );

  const generateSummary = useCallback(async (): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${config.apiUrl}/api/ai/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_id: roomId }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate summary");
      }

      const data = await response.json();
      return data.summary;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("[AI Hints] Summary error:", err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  const clearHints = useCallback(() => {
    setHints([]);
    setError(null);
    wordsSinceLastHintRef.current = 0;
    lastHintTimeRef.current = 0;
  }, []);

  return {
    hints,
    isLoading,
    error,
    generateHint,
    generateSummary,
    shouldTrigger,
    clearHints,
  };
}
