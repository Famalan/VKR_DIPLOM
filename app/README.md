# Interview Platform - Инструкция по запуску

## Требования

- Docker & Docker Compose
- Node.js 18+
- Python 3.11+
- PostgreSQL, Redis, LiveKit (через Docker)

---

## 1. Запуск инфраструктуры (PostgreSQL + Redis + LiveKit)

```bash
cd /Users/vladimirmarkov/Desktop/VKR_DIPLOM/app
docker-compose up -d db redis livekit
```

Проверить:

```bash
docker ps | grep -E "postgres|redis|livekit"
```

---

## 2. Запуск Backend (FastAPI)

### Первый раз (установка зависимостей):

```bash
cd /Users/vladimirmarkov/Desktop/VKR_DIPLOM/app/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Запуск:

```bash
cd /Users/vladimirmarkov/Desktop/VKR_DIPLOM/app/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend будет доступен: http://localhost:8000
Проверить: http://localhost:8000/health

---

## 3. Запуск Frontend (Next.js)

### Первый раз (установка зависимостей):

```bash
cd /Users/vladimirmarkov/Desktop/VKR_DIPLOM/app/frontend
npm install
```

### Запуск:

```bash
cd /Users/vladimirmarkov/Desktop/VKR_DIPLOM/app/frontend
npm run dev
```

Frontend будет доступен: http://localhost:3000

---

## 4. Использование

1. Открыть http://localhost:3000
2. Нажать "Создать новую комнату"
3. Нажать "Войти в комнату"
4. Разрешить доступ к камере и микрофону
5. **STT** -- транскрипция речи в реальном времени (gRPC стриминг через SaluteSpeech)
6. **AI** -- AI-подсказки для интервьюера с контекстом диалога (GigaChat)
7. **Отчёт** -- страница аналитики после интервью

---

## Быстрый запуск (все команды)

```bash
# Терминал 1 - Инфраструктура
cd /Users/vladimirmarkov/Desktop/VKR_DIPLOM/app
docker-compose up -d db redis livekit

# Терминал 2 - Backend
cd /Users/vladimirmarkov/Desktop/VKR_DIPLOM/app/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Терминал 3 - Frontend
cd /Users/vladimirmarkov/Desktop/VKR_DIPLOM/app/frontend
npm run dev
```

---

## Структура проекта

```
app/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── main.py                 # Точка входа
│   │   ├── config.py               # Настройки (.env)
│   │   ├── database.py             # Подключение к PostgreSQL
│   │   ├── models.py               # Room, Participant, Utterance, Hint
│   │   ├── schemas.py              # Pydantic схемы
│   │   ├── routers/
│   │   │   ├── rooms.py            # REST API комнат
│   │   │   ├── livekit_token.py    # LiveKit JWT токены
│   │   │   ├── transcription.py    # STT WebSocket (gRPC стриминг)
│   │   │   ├── ai_hints.py         # AI подсказки
│   │   │   └── report.py           # Отчёт по интервью
│   │   ├── services/
│   │   │   ├── room_service.py
│   │   │   ├── transcription_service.py  # SaluteSpeech gRPC
│   │   │   ├── ai_hints_service.py       # GigaChat с контекстом
│   │   │   ├── redis_service.py          # Redis wrapper
│   │   │   ├── utterance_service.py      # CRUD utterances
│   │   │   ├── hint_service.py           # CRUD hints
│   │   │   └── auth_service.py           # JWT авторизация
│   │   └── grpc_generated/               # SaluteSpeech proto
│   ├── alembic/                          # Миграции БД
│   └── requirements.txt
│
├── frontend/                # Next.js frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx             # Главная страница
│   │   │   ├── room/[id]/page.tsx   # Страница комнаты (LiveKit)
│   │   │   └── interview/[id]/report/page.tsx  # Аналитика
│   │   ├── components/
│   │   │   ├── AIHintsPanel.tsx
│   │   │   ├── Controls.tsx
│   │   │   ├── TranscriptionPanel.tsx
│   │   │   └── VideoPlayer.tsx
│   │   ├── hooks/
│   │   │   ├── useLiveKit.ts        # LiveKit подключение
│   │   │   ├── useTranscription.ts  # AudioWorklet + WebSocket STT
│   │   │   └── useAIHints.ts        # AI подсказки с умным триггером
│   │   └── lib/
│   │       └── config.ts
│   ├── public/
│   │   └── audio-processor.js       # AudioWorklet для PCM 16kHz
│   └── package.json
│
├── docker-compose.yml       # PostgreSQL + Redis + LiveKit
├── .env                     # Переменные окружения
└── README.md
```

---

## Переменные окружения

Файл `.env` в папке `app/`:

```env
DATABASE_URL=postgresql+asyncpg://...
SALUTE_SPEECH_CREDENTIALS=...
GIGACHAT_CREDENTIALS=...
REDIS_URL=redis://localhost:6379/0
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
LIVEKIT_URL=ws://localhost:7880
JWT_SECRET=...
CORS_ORIGINS=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
```

---

## Порты

| Сервис     | Порт |
| ---------- | ---- |
| Frontend   | 3000 |
| Backend    | 8000 |
| PostgreSQL | 5432 |
| Redis      | 6379 |
| LiveKit    | 7880 |

---

## Остановка

```bash
# Остановить frontend/backend: Ctrl+C в терминале

# Остановить инфраструктуру
cd /Users/vladimirmarkov/Desktop/VKR_DIPLOM/app
docker-compose down
```
