"use client";

import { useState, useCallback } from "react";

export type HintColor = "red" | "yellow" | "green";

export interface AIHint {
  id: string;
  dbId: string | null;
  hintType: string | null;
  severity: number | null;
  color: HintColor | null;
  title: string;
  actionableQuestion: string;
  text: string;
  sourceText: string;
  topic: string | null;
  timestamp: Date;
  tokensUsed: number;
}

interface UseAIHintsReturn {
  hints: AIHint[];
  isLoading: boolean;
  error: string | null;
  addHint: (hint: AIHint) => void;
  clearHints: () => void;
}

export function useAIHints(_props?: { roomId: string }): UseAIHintsReturn {
  void _props;
  const [hints, setHints] = useState<AIHint[]>([]);
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addHint = useCallback((hint: AIHint) => {
    setHints((prev) => [...prev, hint]);
  }, []);

  const clearHints = useCallback(() => {
    setHints([]);
    setError(null);
  }, []);

  return {
    hints,
    isLoading,
    error,
    addHint,
    clearHints,
  };
}
