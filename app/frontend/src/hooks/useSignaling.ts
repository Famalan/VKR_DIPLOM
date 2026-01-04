"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { config } from "@/lib/config";

export interface SignalingMessage {
  type: string;
  peers?: string[];
  peerId?: string;
  senderId?: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

interface UseSignalingProps {
  roomId: string;
  userId: string;
  onMessage: (message: SignalingMessage) => void;
}

export function useSignaling({ roomId, userId, onMessage }: UseSignalingProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    const wsUrl = `${config.wsUrl}/ws/${roomId}/${userId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as SignalingMessage;
      onMessage(message);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = () => {};

    wsRef.current = ws;
  }, [roomId, userId, onMessage]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendOffer = useCallback(
    (targetId: string, offer: RTCSessionDescriptionInit) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "offer",
            targetId,
            offer,
          })
        );
      }
    },
    []
  );

  const sendAnswer = useCallback(
    (targetId: string, answer: RTCSessionDescriptionInit) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "answer",
            targetId,
            answer,
          })
        );
      }
    },
    []
  );

  const sendIceCandidate = useCallback(
    (targetId: string, candidate: RTCIceCandidate) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "ice_candidate",
            targetId,
            candidate: candidate.toJSON(),
          })
        );
      }
    },
    []
  );

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    isConnected,
  };
}
