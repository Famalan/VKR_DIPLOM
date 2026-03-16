'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
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
  const [summary, setSummary] = useState<string | null>(null);
  const aiEnabledRef = useRef(false);

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
    generateSummary,
    submitFeedback,
    clearHints,
  } = useAIHints({ roomId });

  const handleHintReceived = useCallback(
    (hint: AIHint) => {
      if (aiEnabledRef.current) {
        addHint(hint);
      }
    },
    [addHint]
  );

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

  const handleGenerateSummary = async () => {
    const result = await generateSummary();
    if (result) {
      setSummary(result);
    }
  };

  const showSidePanels = role === 'interviewer' && (transcriptionEnabled || aiEnabled);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between p-4 pb-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-sm text-gray-400">
              {role === 'interviewer' ? 'Интервьюер' : 'Кандидат'}
            </span>
          </div>

          {role === 'interviewer' && (
            <>
              <button
                onClick={handleToggleTranscription}
                className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                  transcriptionEnabled
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {transcriptionEnabled ? 'STT Вкл' : 'STT Выкл'}
              </button>

              <button
                onClick={handleToggleAI}
                className={`px-3 py-1 rounded-lg text-sm transition-colors ${
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

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            Комната: <span className="font-mono">{roomId}</span>
          </span>
          {role === 'interviewer' && (
            <Link
              href={`/interview/${roomId}/report`}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
            >
              Отчёт
            </Link>
          )}
          <button
            onClick={onLeave}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-lg text-sm transition-colors"
          >
            Выйти
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-4 p-4">
        <div className={showSidePanels ? 'w-1/2' : 'w-full'}>
          <VideoConference />
        </div>

        {showSidePanels && (
          <div className="w-1/2 flex gap-4">
            {transcriptionEnabled && (
              <div className={`${aiEnabled ? 'w-1/2' : 'w-full'} h-[500px]`}>
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
                className={`${transcriptionEnabled ? 'w-1/2' : 'w-full'} h-[500px]`}
              >
                <AIHintsPanel
                  hints={hints}
                  isLoading={aiLoading}
                  error={aiError}
                  onGenerateSummary={
                    transcriptions.length > 0 ? handleGenerateSummary : undefined
                  }
                  onFeedback={submitFeedback}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {summary && (
        <div className="mx-4 mb-4 bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-xl p-4 border border-purple-500/30">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-purple-200">Итоги интервью</h3>
            <button
              onClick={() => setSummary(null)}
              className="text-gray-400 hover:text-white text-sm"
            >
              X
            </button>
          </div>
          <div className="text-sm text-gray-200 whitespace-pre-wrap">
            {summary}
          </div>
        </div>
      )}

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
  const roleFromUrl = urlRole === 'interviewer' || urlRole === 'candidate' ? urlRole : null;

  const [role, setRole] = useState<'interviewer' | 'candidate'>(roleFromUrl || 'candidate');
  const [hasJoined, setHasJoined] = useState(false);

  const { token, wsUrl, isLoading, error, fetchToken } = useLiveKit({
    roomId,
    userId,
    role,
    roomToken: urlToken || undefined,
  });

  const handleJoin = async () => {
    await fetchToken();
    setHasJoined(true);
  };

  const handleLeave = () => {
    router.push('/');
  };

  if (!hasJoined || !token) {
    const showRoleSelection = !roleFromUrl;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full bg-gray-800 rounded-2xl p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">
            Присоединиться к комнате
          </h1>
          <p className="text-gray-400 mb-4">
            Комната: <span className="font-mono text-white">{roomId}</span>
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

          {showRoleSelection && (
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => setRole('interviewer')}
                className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                  role === 'interviewer'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Интервьюер
              </button>
              <button
                onClick={() => setRole('candidate')}
                className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                  role === 'candidate'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Кандидат
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-500/20 text-red-400 p-4 rounded-lg mb-6">
              {error}
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
      data-lk-theme="default"
      style={{ height: '100vh' }}
    >
      <RoomContent roomId={roomId} userId={userId} role={role} onLeave={handleLeave} />
    </LiveKitRoom>
  );
}
