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
  const gainNodeRef = useRef<GainNode | null>(null);
  const onHintReceivedRef = useRef(onHintReceived);
  onHintReceivedRef.current = onHintReceived;

  const [serverError, setServerError] = useState<string | null>(null);

  const startStreaming = useCallback(async () => {
    if (!stream) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      console.log("[STT] No audio track available");
      return;
    }

    try {
      setServerError(null);
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
          const cb = onHintReceivedRef.current;
          if (cb && data.payload) {
            const rawColor = (data.payload.color || "").toString().toLowerCase();
            const color =
              rawColor === "red" || rawColor === "yellow" || rawColor === "green"
                ? (rawColor as "red" | "yellow" | "green")
                : null;
            cb({
              id: `hint_${Date.now()}`,
              dbId: data.payload.dbId || null,
              hintType: data.payload.hintType || null,
              severity:
                typeof data.payload.severity === "number"
                  ? data.payload.severity
                  : null,
              color,
              title: data.payload.title || "",
              actionableQuestion: data.payload.actionableQuestion || "",
              text: data.payload.text || "",
              sourceText: data.payload.sourceText || "",
              topic: data.payload.topic || null,
              timestamp: new Date(),
              tokensUsed: data.payload.tokensUsed || 0,
            });
          }
        } else if (data.type === "reconnecting") {
          setIsReconnecting(true);
          setCurrentText("");
        } else if (data.type === "error") {
          const msg = data.message || "Ошибка STT";
          console.error("[STT] Server error:", msg);
          setServerError(msg);
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

      if (audioContext.state === "suspended") {
        await audioContext.resume();
        console.log("[STT] AudioContext resumed, state=", audioContext.state);
      }

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
      const gain = audioContext.createGain();
      gain.gain.value = 0;
      gainNodeRef.current = gain;
      workletNode.connect(gain);
      gain.connect(audioContext.destination);

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
