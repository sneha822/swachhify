FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
RUN useradd --create-home --uid 10001 swacchify

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY --chown=swacchify:swacchify . .
RUN mkdir -p /app/media && chown swacchify:swacchify /app/media
USER swacchify

EXPOSE 8000
# Migrations run first; seeding is idempotent and happens on startup.
# $PORT is injected by most hosts (Render, Railway, Fly); 8000 is the local default.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
