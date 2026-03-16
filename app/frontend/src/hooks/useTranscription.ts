"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { config } from "@/lib/config";
import type { AIHint } from "@/hooks/useAIHints";

interface TranscriptionResult {
  userId: string;
  role: string;
  roleLabel: string;
  text: string;
  isFinal: boolean;
}

interface UseTranscriptionProps {
  roomId: string;
  userId: string;
  role: "interviewer" | "candidate";
  stream: MediaStream | null;
  enabled: boolean;
  onHintReceived?: (hint: AIHint) => void;
}

export function useTranscription({
  roomId,
  userId,
  role,
  stream,
  enabled,
  onHintReceived,
}: UseTranscriptionProps) {
  const [transcriptions, setTranscriptions] = useState<TranscriptionResult[]>(
    []
  );
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [currentText, setCurrentText] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const startStreaming = useCallback(async () => {
    if (!stream) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      console.log("[STT] No audio track available");
      return;
    }

    try {
      const wsUrl = `${config.wsUrl}/ws/transcribe/${roomId}/${userId}/${role}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[STT] WebSocket connected");
        setIsConnected(true);
        setIsReconnecting(false);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "transcription") {
          setIsReconnecting(false);
          if (data.isFinal) {
            setTranscriptions((prev) => [
              ...prev,
              {
                userId: data.userId,
                role: data.role || "candidate",
                roleLabel: data.roleLabel || "Кандидат",
                text: data.text,
                isFinal: true,
              },
            ]);
            setCurrentText("");
          } else {
            setCurrentText(data.text);
          }
        } else if (data.type === "hint") {
          if (onHintReceived && data.payload) {
            onHintReceived({
              id: `hint_${Date.now()}`,
              dbId: data.payload.dbId || null,
              hintType: data.payload.hintType || null,
              title: data.payload.title || "",
              actionableQuestion: data.payload.actionableQuestion || "",
              text: data.payload.text || "",
              sourceText: data.payload.sourceText || "",
              timestamp: new Date(),
              tokensUsed: data.payload.tokensUsed || 0,
              isAccepted: null,
            });
          }
        } else if (data.type === "reconnecting") {
          setIsReconnecting(true);
          setCurrentText("");
        } else if (data.type === "error") {
          console.error("[STT] Server error:", data.message);
        }
      };

      ws.onclose = () => {
        console.log("[STT] WebSocket closed");
        setIsConnected(false);
        setIsReconnecting(false);
      };

      ws.onerror = (err) => {
        console.error("[STT] WebSocket error:", err);
      };

      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        ws.addEventListener("open", () => resolve(), { once: true });
        ws.addEventListener("error", () => reject(new Error("WS failed")), {
          once: true,
        });
      });

      const audioStream = new MediaStream([audioTrack]);
      const audioContext = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = audioContext;

      await audioContext.audioWorklet.addModule("/audio-processor.js");

      const source = audioContext.createMediaStreamSource(audioStream);
      sourceNodeRef.current = source;

      const workletNode = new AudioWorkletNode(audioContext, "audio-processor");
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event: MessageEvent) => {
        if (ws.readyState === WebSocket.OPEN) {
          const pcmBuffer: ArrayBuffer = event.data;
          ws.send(pcmBuffer);
        }
      };

      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      console.log("[STT] Audio pipeline started (AudioWorklet -> WebSocket -> gRPC)");
    } catch (error) {
      console.error("[STT] Failed to start streaming:", error);
      setIsConnected(false);
    }
  }, [stream, roomId, userId, role, onHintReceived]);

  const stopStreaming = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsReconnecting(false);
    console.log("[STT] Streaming stopped");
  }, []);

  useEffect(() => {
    if (enabled && stream) {
      startStreaming();
    } else {
      stopStreaming();
    }

    return () => {
      stopStreaming();
    };
  }, [enabled, stream, startStreaming, stopStreaming]);

  const clearTranscriptions = useCallback(() => {
    setTranscriptions([]);
    setCurrentText("");
  }, []);

  return {
    transcriptions,
    currentText,
    isConnected,
    isReconnecting,
    clearTranscriptions,
  };
}
