"""WebSocket fan-out.

Handlers are sync (run in a threadpool), so `publish()` is thread-safe. With REDIS_URL set, events go
through Redis pub/sub so every API instance delivers to its own sockets; otherwise an in-process queue.
"""

import asyncio
import json
import logging
from collections import defaultdict

from fastapi import WebSocket

from app.core.config import settings

log = logging.getLogger("swacchify.realtime")
CHANNEL = "swacchify:events"


class RealtimeHub:
    def __init__(self) -> None:
        self.sockets: dict[int, set[WebSocket]] = defaultdict(set)
        self.loop: asyncio.AbstractEventLoop | None = None
        self.queue: asyncio.Queue | None = None
        self._redis = None
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self.loop = asyncio.get_running_loop()
        if settings.REDIS_URL:
            try:
                import redis
                import redis.asyncio as aioredis

                self._redis = redis.Redis.from_url(settings.REDIS_URL)
                self._redis.ping()
                self._task = asyncio.create_task(self._redis_listener(aioredis.Redis.from_url(settings.REDIS_URL)))
                log.info("realtime: using Redis pub/sub")
                return
            except Exception as exc:  # pragma: no cover - depends on infra
                log.warning("realtime: Redis unavailable (%s); falling back to in-process", exc)
                self._redis = None
        self.queue = asyncio.Queue()
        self._task = asyncio.create_task(self._queue_listener())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self.sockets[user_id].add(ws)

    def disconnect(self, user_id: int, ws: WebSocket) -> None:
        self.sockets[user_id].discard(ws)

    def publish(self, user_id: int, event: str, data: dict | None = None) -> None:
        message = {"user_id": user_id, "event": event, "data": data or {}}
        if self._redis is not None:
            try:
                self._redis.publish(CHANNEL, json.dumps(message, default=str))
                return
            except Exception as exc:  # pragma: no cover
                log.warning("realtime publish failed: %s", exc)
        if self.loop and self.queue is not None:
            try:
                self.loop.call_soon_threadsafe(self.queue.put_nowait, message)
            except RuntimeError:  # loop closed (tests / shutdown)
                pass

    async def _deliver(self, message: dict) -> None:
        payload = json.dumps({"event": message["event"], "data": message["data"]}, default=str)
        for ws in list(self.sockets.get(message["user_id"], ())):
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect(message["user_id"], ws)

    async def _queue_listener(self) -> None:
        assert self.queue is not None
        while True:
            await self._deliver(await self.queue.get())

    async def _redis_listener(self, client) -> None:  # pragma: no cover - depends on infra
        pubsub = client.pubsub()
        await pubsub.subscribe(CHANNEL)
        async for msg in pubsub.listen():
            if msg.get("type") == "message":
                await self._deliver(json.loads(msg["data"]))


hub = RealtimeHub()
