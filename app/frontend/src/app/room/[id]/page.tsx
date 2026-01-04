'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { VideoPlayer } from '@/components/VideoPlayer';
import { Controls } from '@/components/Controls';
import { useWebRTC } from '@/hooks/useWebRTC';

function generateUserId(): string {
  return `user_${Math.random().toString(36).substring(2, 9)}`;
}

export default function RoomPage() {
  const params = useParams();
  const roomId = params.id as string;
  const router = useRouter();
  const [userId] = useState(() => generateUserId());
  const [hasJoined, setHasJoined] = useState(false);

  const {
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
  } = useWebRTC({ roomId, userId });

  const handleJoin = async () => {
    await initialize();
    setHasJoined(true);
  };

  const handleEndCall = () => {
    cleanup();
    router.push('/');
  };

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  if (!hasJoined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full bg-gray-800 rounded-2xl p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Присоединиться к комнате</h1>
          <p className="text-gray-400 mb-6">
            Комната: <span className="font-mono text-white">{roomId}</span>
          </p>

          {error && <div className="bg-red-500/20 text-red-400 p-4 rounded-lg mb-6">{error}</div>}

          <button
            onClick={handleJoin}
            disabled={isConnecting}
            className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium transition-colors">
            {isConnecting ? 'Подключение...' : 'Присоединиться'}
          </button>

          <p className="text-sm text-gray-500 mt-4">
            Вам потребуется разрешить доступ к камере и микрофону
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-yellow-500'}`}
          />
          <span className="text-sm text-gray-400">
            {wsConnected ? 'Подключено' : 'Подключение...'}
          </span>
        </div>
        <div className="text-sm text-gray-400">
          Комната: <span className="font-mono">{roomId}</span>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <VideoPlayer stream={localStream} muted mirror label="Вы" />
        <VideoPlayer
          stream={remoteStream}
          label={isConnected ? 'Собеседник' : 'Ожидание собеседника...'}
        />
      </div>

      <div className="py-4">
        <Controls
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onEndCall={handleEndCall}
        />
      </div>
    </div>
  );
}
