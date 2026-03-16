"use client";

import { useState, useCallback } from "react";
import { config } from "@/lib/config";

export interface AIHint {
  id: string;
  dbId: string | null;
  hintType: string | null;
  title: string;
  actionableQuestion: string;
  text: string;
  sourceText: string;
  timestamp: Date;
  tokensUsed: number;
  isAccepted: boolean | null;
}

interface UseAIHintsProps {
  roomId: string;
}

interface UseAIHintsReturn {
  hints: AIHint[];
  isLoading: boolean;
  error: string | null;
  addHint: (hint: AIHint) => void;
  generateSummary: () => Promise<string | null>;
  submitFeedback: (hintId: string, isAccepted: boolean) => Promise<void>;
  clearHints: () => void;
}

export function useAIHints({ roomId }: UseAIHintsProps): UseAIHintsReturn {
  const [hints, setHints] = useState<AIHint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addHint = useCallback((hint: AIHint) => {
    setHints((prev) => [...prev, hint]);
  }, []);

  const submitFeedback = useCallback(
    async (hintId: string, isAccepted: boolean) => {
      const hint = hints.find((h) => h.id === hintId);
      if (!hint?.dbId) return;

      try {
        const response = await fetch(
          `${config.apiUrl}/api/ai/hint/${hint.dbId}/feedback`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_accepted: isAccepted }),
          }
        );

        if (!response.ok) return;

        setHints((prev) =>
          prev.map((h) =>
            h.id === hintId ? { ...h, isAccepted } : h
          )
        );
      } catch (err) {
        console.error("[AI Hints] Feedback error:", err);
      }
    },
    [hints]
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
  }, []);

  return {
    hints,
    isLoading,
    error,
    addHint,
    generateSummary,
    submitFeedback,
    clearHints,
  };
}
