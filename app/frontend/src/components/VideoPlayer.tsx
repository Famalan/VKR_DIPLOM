"use client";

import { useEffect, useRef } from "react";

interface VideoPlayerProps {
  stream: MediaStream | null;
  muted?: boolean;
  label?: string;
  mirror?: boolean;
}

export function VideoPlayer({
  stream,
  muted = false,
  label,
  mirror = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative rounded-xl overflow-hidden bg-gray-800 aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`w-full h-full object-cover ${mirror ? "scale-x-[-1]" : ""}`}
      />
      {label && (
        <div className="absolute bottom-3 left-3 bg-black/50 px-3 py-1 rounded-lg text-sm">
          {label}
        </div>
      )}
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-gray-400">Нет видео</div>
        </div>
      )}
    </div>
  );
}
