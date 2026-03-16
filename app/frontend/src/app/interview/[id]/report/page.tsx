'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { config } from '@/lib/config';

interface ReportData {
  room: {
    id: string;
    status: string;
    position: string | null;
    created_at: string | null;
    ended_at: string | null;
  };
  statistics: {
    total_utterances: number;
    total_hints: number;
    interviewer_words: number;
    candidate_words: number;
    interviewer_percent: number;
    candidate_percent: number;
  };
  utterances: {
    id: string;
    speaker: string;
    text: string;
    confidence: number | null;
    created_at: string | null;
  }[];
  hints: {
    id: string;
    text: string;
    hint_type: string | null;
    created_at: string | null;
  }[];
  summary: string;
}

const HINT_TYPE_COLORS: Record<string, string> = {
  'УТОЧНЕНИЕ': 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  'ПРОБЕЛ': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  'STAR': 'bg-green-500/20 text-green-300 border-green-500/40',
};

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadReport() {
      try {
        const response = await fetch(
          `${config.apiUrl}/api/rooms/${roomId}/report`
        );
        if (!response.ok) {
          throw new Error('Failed to load report');
        }
        const data = await response.json();
        setReport(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load report'
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadReport();
  }, [roomId]);

  const handleCopyReport = async () => {
    if (!report) return;

    const text = [
      `Отчёт по интервью`,
      `Комната: ${report.room.id}`,
      report.room.position ? `Позиция: ${report.room.position}` : '',
      `Дата: ${report.room.created_at ? new Date(report.room.created_at).toLocaleString() : 'N/A'}`,
      '',
      `--- Статистика ---`,
      `Реплик: ${report.statistics.total_utterances}`,
      `Подсказок: ${report.statistics.total_hints}`,
      `Интервьюер: ${report.statistics.interviewer_percent}%`,
      `Кандидат: ${report.statistics.candidate_percent}%`,
      '',
      `--- Итоговый отчёт ---`,
      report.summary || 'Нет данных',
      '',
      `--- Стенограмма ---`,
      ...report.utterances.map(
        (u) => `[${u.speaker}]: ${u.text}`
      ),
    ]
      .filter(Boolean)
      .join('\n');

    await navigator.clipboard.writeText(text);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Загрузка отчёта...</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="bg-red-500/20 text-red-400 p-6 rounded-xl max-w-md text-center">
          <p className="mb-4">{error || 'Отчёт не найден'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            На главную
          </button>
        </div>
      </div>
    );
  }

  const stats = report.statistics;

  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Отчёт по интервью</h1>
          <p className="text-gray-400 mt-1">
            Комната: <span className="font-mono">{report.room.id}</span>
            {report.room.position && (
              <span className="ml-4">
                Позиция: <span className="text-white">{report.room.position}</span>
              </span>
            )}
          </p>
          {report.room.created_at && (
            <p className="text-gray-500 text-sm mt-1">
              {new Date(report.room.created_at).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleCopyReport}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors text-sm"
          >
            Копировать отчёт
          </button>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
          >
            На главную
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Реплик" value={stats.total_utterances} />
        <StatCard label="Подсказок" value={stats.total_hints} />
        <StatCard
          label="Интервьюер"
          value={`${stats.interviewer_percent}%`}
          sub={`${stats.interviewer_words} слов`}
        />
        <StatCard
          label="Кандидат"
          value={`${stats.candidate_percent}%`}
          sub={`${stats.candidate_words} слов`}
        />
      </div>

      {stats.interviewer_words + stats.candidate_words > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">
            Распределение речи
          </h2>
          <div className="flex rounded-lg overflow-hidden h-8">
            <div
              className="bg-blue-500 flex items-center justify-center text-xs font-medium"
              style={{ width: `${stats.interviewer_percent}%` }}
            >
              {stats.interviewer_percent > 10 &&
                `Интервьюер ${stats.interviewer_percent}%`}
            </div>
            <div
              className="bg-green-500 flex items-center justify-center text-xs font-medium"
              style={{ width: `${stats.candidate_percent}%` }}
            >
              {stats.candidate_percent > 10 &&
                `Кандидат ${stats.candidate_percent}%`}
            </div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Интервьюер</span>
            <span>Кандидат</span>
          </div>
        </div>
      )}

      {report.summary && (
        <div className="mb-8 bg-gradient-to-r from-purple-900/40 to-blue-900/40 rounded-xl p-6 border border-purple-500/30">
          <h2 className="text-lg font-semibold text-purple-200 mb-3">
            AI-резюме интервью
          </h2>
          <div className="text-gray-200 whitespace-pre-wrap leading-relaxed">
            {report.summary}
          </div>
        </div>
      )}

      {report.hints.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">
            Подсказки ({report.hints.length})
          </h2>
          <div className="space-y-3">
            {report.hints.map((hint) => {
              const typeClass = hint.hint_type
                ? HINT_TYPE_COLORS[hint.hint_type] ||
                  'bg-gray-700/50 text-gray-300 border-gray-600'
                : 'bg-gray-700/50 text-gray-300 border-gray-600';

              return (
                <div
                  key={hint.id}
                  className={`border rounded-lg p-4 ${typeClass}`}
                >
                  {hint.hint_type && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-white/10 mb-2 inline-block">
                      {hint.hint_type}
                    </span>
                  )}
                  <p className="whitespace-pre-wrap">{hint.text}</p>
                  {hint.created_at && (
                    <p className="text-xs text-gray-500 mt-2">
                      {new Date(hint.created_at).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {report.utterances.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">
            Стенограмма ({report.utterances.length} реплик)
          </h2>
          <div className="bg-gray-800 rounded-xl p-4 space-y-3 max-h-[600px] overflow-y-auto">
            {report.utterances.map((u) => {
              const isInterviewer =
                u.speaker.toLowerCase().includes('interviewer');
              return (
                <div
                  key={u.id}
                  className={`p-3 rounded-lg ${
                    isInterviewer ? 'bg-blue-500/10 border-l-2 border-blue-500' : 'bg-green-500/10 border-l-2 border-green-500'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-medium ${
                        isInterviewer ? 'text-blue-400' : 'text-green-400'
                      }`}
                    >
                      {isInterviewer ? 'Интервьюер' : 'Кандидат'}
                    </span>
                    {u.created_at && (
                      <span className="text-xs text-gray-500">
                        {new Date(u.created_at).toLocaleTimeString()}
                      </span>
                    )}
                    {u.confidence !== null && (
                      <span className="text-xs text-gray-600">
                        {Math.round(u.confidence * 100)}%
                      </span>
                    )}
                  </div>
                  <p className="text-gray-200 text-sm">{u.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {report.utterances.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">Нет данных для отчёта</p>
          <p className="text-sm">
            Стенограмма и подсказки появятся после проведения интервью с
            включённой транскрипцией
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}
