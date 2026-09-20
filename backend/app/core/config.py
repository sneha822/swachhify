from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "Swacchify"
    ENV: str = "development"  # development | production | test
    DEBUG: bool = True

    # SQLite works out of the box for local dev; docker-compose sets a PostgreSQL URL.
    DATABASE_URL: str = "sqlite:///./swacchify.db"
    AUTO_CREATE_TABLES: bool = True  # production uses `alembic upgrade head` instead
    SEED_DEMO_DATA: bool = True
    # Optional first admin for production deployments (demo data has its own admin).
    ADMIN_EMAIL: str | None = None
    ADMIN_PASSWORD: str | None = None

    # Optional. When unset, realtime runs in-process and Celery tasks run eagerly.
    REDIS_URL: str | None = None

    SECRET_KEY: str = "dev-only-change-me-in-production-please-32+chars"
    ACCESS_TOKEN_MINUTES: int = 30
    REFRESH_TOKEN_DAYS: int = 14
    # Comma-separated so it can be pasted straight into a hosting dashboard; read via `cors_origins`.
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    FRONTEND_URL: str = "http://localhost:5173"

    # AI. With no credentials the assistant answers from the curated knowledge base only.
    AI_ENABLED: bool = True
    # Read from backend/.env too (the SDK itself only sees real environment variables).
    ANTHROPIC_API_KEY: str | None = None
    AI_MODEL: str = "claude-opus-5"
    AI_EFFORT: str = "low"
    AI_RATE_LIMIT_PER_MINUTE: int = 12

    # Storage: "local" writes under MEDIA_DIR and is served at /media; "s3" needs boto3 + bucket.
    STORAGE_BACKEND: str = "local"
    MEDIA_DIR: str = "./media"
    S3_BUCKET: str | None = None
    S3_REGION: str | None = None
    S3_PUBLIC_BASE_URL: str | None = None

    # Messaging channels beyond in-app. "console" just logs; wire real providers in services/channels.py.
    EMAIL_PROVIDER: str = "console"
    SMS_PROVIDER: str = "console"
    WHATSAPP_PROVIDER: str = "console"

    # Operations
    DEFAULT_CITY: str = "Jaipur"
    DEFAULT_LAT: float = 26.9124
    DEFAULT_LNG: float = 75.7873
    PARTNER_SEARCH_RADIUS_KM: float = 12.0
    SLOT_CAPACITY: int = 20
    AVG_CITY_SPEED_KMPH: float = 18.0
    PARTNER_BASE_FEE: float = 30.0  # INR per completed pickup, plus per-kg category rate

    @property
    def cors_origins(self) -> list[str]:
        """Accepts "a,b" or a JSON array, and tolerates trailing slashes."""
        raw = self.CORS_ORIGINS.strip()
        if raw.startswith("["):
            import json

            return [str(o).rstrip("/") for o in json.loads(raw)]
        return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _database_url(cls, v):
        """Hosts hand out `postgres://` URLs; SQLAlchemy 2 needs an explicit driver."""
        if isinstance(v, str):
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+psycopg://", 1)
            if v.startswith("postgresql://"):
                return v.replace("postgresql://", "postgresql+psycopg://", 1)
        return v

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
