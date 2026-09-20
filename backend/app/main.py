import logging
from contextlib import asynccontextmanager
from pathlib import Path

import jwt
from fastapi import APIRouter, FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import app.models  # noqa: F401  (register all tables)
from app.api.v1 import (
    admin,
    ai,
    auth,
    households,
    impact,
    industries,
    learning,
    notifications,
    partners,
    pickups,
    rewards,
    users,
    waste,
)
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import decode_token
from app.seed.run import run as run_seed
from app.services.realtime import hub

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("swacchify")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.AUTO_CREATE_TABLES:
        Base.metadata.create_all(engine)
    with SessionLocal() as db:
        run_seed(db)
    if settings.ENV == "production" and settings.SECRET_KEY.startswith("dev-only"):
        raise RuntimeError("Set SECRET_KEY before running in production")
    await hub.start()
    yield
    await hub.stop()


app = FastAPI(
    title="Swacchify API",
    version="1.0.0",
    description="Know Your Waste. Do the Right Thing. — household waste guidance, pickups, learning and rewards.",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

api = APIRouter(prefix="/api/v1")
for module in (auth, users, households, waste, ai, learning, pickups, partners, industries, rewards, impact,
               notifications, admin):
    api.include_router(module.router)


@api.websocket("/ws")
async def websocket(ws: WebSocket, token: str = Query(...)):
    """Pushes `notification`, `pickup_update` and `partner_location` events to the signed-in user."""
    try:
        user_id = int(decode_token(token, "access")["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        await ws.close(code=4401)
        return
    await hub.connect(user_id, ws)
    try:
        while True:
            await ws.receive_text()  # keep-alive pings from the client
    except WebSocketDisconnect:
        hub.disconnect(user_id, ws)


app.include_router(api)

Path(settings.MEDIA_DIR).mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.MEDIA_DIR), name="media")


@app.get("/healthz", tags=["meta"])
def health():
    return {"status": "ok"}
