from __future__ import annotations

from supabase import Client, create_client

from app.settings import settings


def get_supabase_admin_client() -> Client:
    if not settings.supabase_is_configured():
        raise RuntimeError(
            "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env"
        )
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
