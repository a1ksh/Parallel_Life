FROM node:24-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ .
COPY backend/app/scenarios/kk.json backend/app/scenarios/ru.json backend/app/scenarios/legacy-text.json /app/backend/app/scenarios/
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./backend/app
COPY public ./public
COPY --from=frontend /app/frontend/out ./frontend/out
WORKDIR /app/backend
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
