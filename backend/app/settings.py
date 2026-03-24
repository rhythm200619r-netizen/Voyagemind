from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    cors_origins: str = "http://localhost:5173"

    # Keep these optional so the server can boot even if .env isn't configured yet.
    # Requests that need Supabase will return a clear error.
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def supabase_is_configured(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)


settings = Settings()
