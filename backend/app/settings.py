from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    _ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
    model_config = SettingsConfigDict(env_file=str(_ENV_PATH), extra="ignore")

    app_env: str = "dev"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    cors_origins: str = (
        "http://localhost:5173,http://localhost:5174,"
        "http://127.0.0.1:5173,http://127.0.0.1:5174"
    )

    # Keep these optional so the server can boot even if .env isn't configured yet.
    # Requests that need Supabase will return a clear error.
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    
    gemini_api_key: str = ""
    rapidapi_key: str = ""

    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def cors_origin_regex(self) -> str:
        # Allow local dev frontends on any port so fetches do not break when Vite chooses a different port.
        return r"https?://(localhost|127\.0\.0\.1)(:\d+)?"

    def supabase_is_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)


settings = Settings()
