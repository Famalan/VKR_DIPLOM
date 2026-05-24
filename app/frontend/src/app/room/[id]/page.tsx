'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { config } from '@/lib/config';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useLocalParticipant,
  useTracks,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import { TranscriptionPanel } from '@/components/TranscriptionPanel';
import { AIHintsPanel } from '@/components/AIHintsPanel';
import { useTranscription } from '@/hooks/useTranscription';
import { useAIHints, AIHint } from '@/hooks/useAIHints';
import { useLiveKit } from '@/hooks/useLiveKit';

function generateUserId(): string {
  return `user_${Math.random().toString(36).substring(2, 9)}`;
}

function RoomContent({
  roomId,
  userId,
  role,
  onLeave,
}: {
  roomId: string;
  userId: string;
  role: 'interviewer' | 'candidate';
  onLeave: () => void;
}) {
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(role === 'candidate');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const aiEnabledRef = useRef(false);

  const handleCopyLink = async () => {
    if (typeof window === 'undefined') return;
    const candidateLink = `${window.location.origin}/room/${roomId}`;
    try {
      await navigator.clipboard.writeText(candidateLink);
      setToast('Ссылка для кандидата скопирована');
    } catch {
      setToast(`Ссылка: ${candidateLink}`);
    }
    setTimeout(() => setToast(null), 3000);
  };

  const { localParticipant } = useLocalParticipant();

  const localAudioTrack = useTracks([Track.Source.Microphone])
    .filter((t) => t.participant.identity === localParticipant.identity)
    .map((t) => t.publication.track)
    .find(Boolean);

  const localStreamRef = useRef<MediaStream | null>(null);
  const lastTrackRef = useRef<MediaStreamTrack | null>(null);

  const rawTrack = localAudioTrack?.mediaStreamTrack ?? null;
  if (rawTrack !== lastTrackRef.current) {
    lastTrackRef.current = rawTrack;
    localStreamRef.current = rawTrack ? new MediaStream([rawTrack]) : null;
  }
  const localStream = localStreamRef.current;

  const {
    hints,
    isLoading: aiLoading,
    error: aiError,
    addHint,
    clearHints,
  } = useAIHints({ roomId });

  const [cueColor, setCueColor] = useState<'red' | 'yellow' | 'green' | null>(null);
  const [cueTick, setCueTick] = useState(0);
  const cueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHintReceived = useCallback(
    (hint: AIHint) => {
      if (aiEnabledRef.current) {
        addHint(hint);
        if (hint.color) {
          setCueColor(hint.color);
          setCueTick((t) => t + 1);
        }
      }
    },
    [addHint]
  );

  useEffect(() => {
    if (!cueColor || cueTick === 0) return;
    if (cueTimerRef.current) clearTimeout(cueTimerRef.current);
    cueTimerRef.current = setTimeout(() => {
      setCueColor(null);
    }, 1100);
    return () => {
      if (cueTimerRef.current) clearTimeout(cueTimerRef.current);
    };
  }, [cueTick, cueColor]);

  const {
    transcriptions,
    currentText,
    isConnected: transcriptionConnected,
    isReconnecting,
  } = useTranscription({
    roomId,
    userId,
    role,
    stream: localStream,
    enabled: transcriptionEnabled,
    onHintReceived: handleHintReceived,
  });

  const handleToggleTranscription = () => {
    setTranscriptionEnabled(!transcriptionEnabled);
  };

  const handleToggleAI = () => {
    const enabling = !aiEnabled;
    setAiEnabled(enabling);
    aiEnabledRef.current = enabling;
    if (enabling) {
      clearHints();
    }
  };

  const showSidePanels = role === 'interviewer' && (transcriptionEnabled || aiEnabled);

  return (
    <div className="relative h-[100svh] w-full flex flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 flex-wrap shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
            <span className="text-xs sm:text-sm text-gray-400">
              {role === 'interviewer' ? 'Интервьюер' : 'Кандидат'}
            </span>
          </div>

          {role === 'interviewer' && (
            <>
              <button
                onClick={handleToggleTranscription}
                className={`px-2.5 py-1 rounded-lg text-xs sm:text-sm transition-colors ${
                  transcriptionEnabled
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {transcriptionEnabled ? 'STT Вкл' : 'STT Выкл'}
              </button>

              <button
                onClick={handleToggleAI}
                className={`px-2.5 py-1 rounded-lg text-xs sm:text-sm transition-colors ${
                  aiEnabled
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {aiEnabled ? 'AI Вкл' : 'AI Выкл'}
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="hidden md:inline text-xs sm:text-sm text-gray-400">
            Комната: <span className="font-mono">{roomId.substring(0, 8)}…</span>
          </span>
          {role === 'interviewer' && (
            <>
              <button
                onClick={handleCopyLink}
                title="Скопировать ссылку для кандидата"
                className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs sm:text-sm transition-colors flex items-center gap-1"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-3.5 h-3.5"
                  aria-hidden="true"
                >
                  <path d="M8.603 3.799A4.49 4.49 0 0 1 12 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 0 1 1.307 3.599 4.49 4.49 0 0 1-3.43 4.331 1 1 0 1 1-.549-1.923 2.49 2.49 0 0 0 1.91-2.408c.042-.664-.177-1.32-.62-1.81A2.49 2.49 0 0 0 12 4.25a2.49 2.49 0 0 0-1.897.874l-2.19 2.19a1 1 0 1 1-1.414-1.414l2.104-2.101ZM7.32 10.69a1 1 0 0 1 .549 1.923 2.49 2.49 0 0 0-1.91 2.408 2.49 2.49 0 0 0 .62 1.81A2.49 2.49 0 0 0 8 17.75a2.49 2.49 0 0 0 1.897-.874l2.19-2.19a1 1 0 0 1 1.414 1.414l-2.104 2.101a4.49 4.49 0 0 1-3.397 1.549 4.49 4.49 0 0 1-3.397-1.549 4.49 4.49 0 0 1-1.307-3.599 4.49 4.49 0 0 1 3.43-4.331 1 1 0 0 1 .594 0Z" />
                  <path d="M13.06 6.94a1 1 0 0 1 0 1.414l-4.707 4.707a1 1 0 1 1-1.414-1.414l4.707-4.707a1 1 0 0 1 1.414 0Z" />
                </svg>
                <span className="hidden sm:inline">Ссылка</span>
              </button>
            </>
          )}
          <button
            onClick={onLeave}
            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 rounded-lg text-xs sm:text-sm transition-colors"
          >
            Выйти
          </button>
        </div>
      </header>

      {toast && (
        <div className="fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-4 sm:px-6 py-2 rounded-xl shadow-lg text-xs sm:text-sm font-medium animate-fade-in max-w-[calc(100vw-2rem)] text-center pointer-events-none">
          {toast}
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-2 sm:gap-3 p-2 sm:p-3 min-h-0 overflow-hidden">
        <div
          className={`relative min-h-0 ${
            showSidePanels ? 'flex-1 lg:w-1/2 lg:flex-none' : 'flex-1'
          }`}
        >
          <VideoConference />
          {cueColor && (
            <div
              key={`cue_${cueTick}`}
              className={`cue-overlay cue-active cue-${cueColor}`}
              aria-hidden
            />
          )}
        </div>

        {showSidePanels && (
          <div className="flex flex-col sm:flex-row lg:w-1/2 gap-2 sm:gap-3 min-h-0 max-h-[45vh] lg:max-h-none lg:flex-1 overflow-hidden">
            {transcriptionEnabled && (
              <div
                className={`${
                  aiEnabled ? 'sm:w-1/2' : 'w-full'
                } flex-1 sm:flex-none min-h-0 overflow-hidden`}
              >
                <TranscriptionPanel
                  transcriptions={transcriptions}
                  currentText={currentText}
                  isConnected={transcriptionConnected}
                  isReconnecting={isReconnecting}
                />
              </div>
            )}

            {aiEnabled && (
              <div
                className={`${
                  transcriptionEnabled ? 'sm:w-1/2' : 'w-full'
                } flex-1 sm:flex-none min-h-0 overflow-hidden`}
              >
                <AIHintsPanel
                  hints={hints}
                  isLoading={aiLoading}
                  error={aiError}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <RoomAudioRenderer />
    </div>
  );
}

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = params.id as string;
  const router = useRouter();
  const [userId] = useState(() => generateUserId());

  const urlRole = searchParams.get('role') as 'interviewer' | 'candidate' | null;
  const urlToken = searchParams.get('token');
  const role: 'interviewer' | 'candidate' =
    urlRole === 'interviewer' && urlToken ? 'interviewer' : 'candidate';

  const [hasJoined, setHasJoined] = useState(false);
  const [roomStatus, setRoomStatus] = useState<'loading' | 'ok' | 'not_found' | 'ended'>('loading');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const { token, wsUrl, isLoading, error, fetchToken } = useLiveKit({
    roomId,
    userId,
    role,
    roomToken: urlToken || undefined,
  });

  useEffect(() => {
    async function validateRoom() {
      try {
        const res = await fetch(`${config.apiUrl}/api/rooms/${roomId}`);
        if (res.status === 404) {
          setRoomStatus('not_found');
          return;
        }
        if (!res.ok) {
          setRoomStatus('not_found');
          return;
        }
        const data = await res.json();
        if (data.status === 'ended') {
          setRoomStatus('ended');
          return;
        }
        setRoomStatus('ok');
      } catch {
        setRoomStatus('not_found');
      }
    }
    validateRoom();
  }, [roomId]);

  const handleJoin = async () => {
    try {
      setConnectionError(null);
      await fetchToken();
      setHasJoined(true);
    } catch (err) {
      setConnectionError(
        'Не удалось подключиться. Попробуйте очистить кеш браузера или открыть в другом браузере.'
      );
    }
  };

  const handleLeave = () => {
    router.push('/');
  };

  if (roomStatus === 'loading') {
    return (
      <div className="min-h-[100svh] flex items-center justify-center p-4">
        <div className="text-gray-400">Загрузка...</div>
      </div>
    );
  }

  if (roomStatus === 'not_found') {
    return (
      <div className="min-h-[100svh] flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="max-w-md w-full bg-gray-800 rounded-2xl p-6 sm:p-8 text-center">
          <h1 className="text-xl sm:text-2xl font-bold mb-4">Комната не найдена</h1>
          <p className="text-gray-400 mb-6 text-sm sm:text-base break-words">
            Комната с ID <span className="font-mono text-white">{roomId}</span> не существует или была удалена.
          </p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
          >
            На главную
          </button>
        </div>
      </div>
    );
  }

  if (roomStatus === 'ended') {
    return (
      <div className="min-h-[100svh] flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="max-w-md w-full bg-gray-800 rounded-2xl p-6 sm:p-8 text-center">
          <h1 className="text-xl sm:text-2xl font-bold mb-4">Собеседование завершено</h1>
          <p className="text-gray-400 mb-6 text-sm sm:text-base">
            Это собеседование уже завершилось.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={`/interview/${roomId}/report`}
              className="flex-1 py-3 px-6 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors text-center"
            >
              Посмотреть отчёт
            </Link>
            <button
              onClick={() => router.push('/')}
              className="flex-1 py-3 px-6 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              На главную
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasJoined || !token) {
    return (
      <div className="min-h-[100svh] flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="max-w-md w-full bg-gray-800 rounded-2xl p-6 sm:p-8 text-center">
          <h1 className="text-xl sm:text-2xl font-bold mb-4">
            Присоединиться к комнате
          </h1>
          <p className="text-gray-400 mb-4 text-sm sm:text-base">
            Комната: <span className="font-mono text-white">{roomId.substring(0, 8)}...</span>
          </p>

          <div className="mb-6">
            <span className={`inline-block px-4 py-2 rounded-lg text-sm font-medium ${
              role === 'interviewer'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                : 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
            }`}>
              {role === 'interviewer' ? 'Вы входите как Интервьюер' : 'Вы входите как Кандидат'}
            </span>
          </div>

          {(error || connectionError) && (
            <div className="bg-red-500/20 text-red-400 p-4 rounded-lg mb-6 text-sm">
              <p>{error || connectionError}</p>
              <p className="mt-2 text-red-400/70">
                Совет: попробуйте очистить кеш (Ctrl+Shift+R), отключить блокировщики или открыть в другом браузере.
              </p>
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={isLoading}
            className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-medium transition-colors"
          >
            {isLoading ? 'Подключение...' : 'Присоединиться'}
          </button>

          <p className="text-sm text-gray-500 mt-4">
            Вам потребуется разрешить доступ к камере и микрофону
          </p>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={wsUrl}
      connect={true}
      audio={true}
      video={true}
      onDisconnected={handleLeave}
      onError={(err) => {
        console.error('[LiveKit] Connection error:', err);
        setConnectionError(
          'Ошибка подключения к видеосерверу. Попробуйте перезагрузить страницу.'
        );
        setHasJoined(false);
      }}
      data-lk-theme="default"
      style={{ height: '100svh' }}
    >
      <RoomContent roomId={roomId} userId={userId} role={role} onLeave={handleLeave} />
    </LiveKitRoom>
  );
}
