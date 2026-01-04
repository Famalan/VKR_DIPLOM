"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSignaling, SignalingMessage } from "./useSignaling";
import { createPeerConnection, getUserMedia } from "@/lib/webrtc";

interface UseWebRTCProps {
  roomId: string;
  userId: string;
}

export function useWebRTC({ roomId, userId }: UseWebRTCProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteUserIdRef = useRef<string | null>(null);

  const handleSignalingMessage = useCallback(
    async (message: SignalingMessage) => {
      const pc = peerConnectionRef.current;

      switch (message.type) {
        case "peers":
          if (message.peers && message.peers.length > 0) {
            remoteUserIdRef.current = message.peers[0];
            await createOffer();
          }
          break;

        case "peer_joined":
          remoteUserIdRef.current = message.peerId || null;
          break;

        case "offer":
          if (pc && message.offer && message.senderId) {
            remoteUserIdRef.current = message.senderId;
            await pc.setRemoteDescription(
              new RTCSessionDescription(message.offer)
            );
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendAnswer(message.senderId, answer);
          }
          break;

        case "answer":
          if (pc && message.answer) {
            await pc.setRemoteDescription(
              new RTCSessionDescription(message.answer)
            );
          }
          break;

        case "ice_candidate":
          if (pc && message.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
          }
          break;

        case "peer_left":
          if (message.peerId === remoteUserIdRef.current) {
            setRemoteStream(null);
            setIsConnected(false);
            remoteUserIdRef.current = null;
          }
          break;
      }
    },
    []
  );

  const { connect, sendOffer, sendAnswer, sendIceCandidate, isConnected: wsConnected } =
    useSignaling({
      roomId,
      userId,
      onMessage: handleSignalingMessage,
    });

  const createOffer = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc || !remoteUserIdRef.current) return;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendOffer(remoteUserIdRef.current, offer);
  }, [sendOffer]);

  const initialize = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const stream = await getUserMedia();
      setLocalStream(stream);

      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0]);
        setIsConnected(true);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && remoteUserIdRef.current) {
          sendIceCandidate(remoteUserIdRef.current, event.candidate);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setIsConnected(true);
          setIsConnecting(false);
        } else if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed"
        ) {
          setIsConnected(false);
        }
      };

      connect();
      setIsConnecting(false);
    } catch (err) {
      console.error("Failed to initialize WebRTC:", err);
      setError("Failed to access camera/microphone");
      setIsConnecting(false);
    }
  }, [connect, sendIceCandidate]);

  const cleanup = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setIsConnected(false);
  }, [localStream]);

  const toggleAudio = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return audioTrack.enabled;
      }
    }
    return false;
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return videoTrack.enabled;
      }
    }
    return false;
  }, [localStream]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  return {
    localStream,
    remoteStream,
    isConnecting,
    isConnected,
    wsConnected,
    error,
    initialize,
    cleanup,
    toggleAudio,
    toggleVideo,
  };
}
