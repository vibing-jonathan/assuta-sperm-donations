from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Runtime configuration loaded from the repository's local environment."""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Donor Administration API"
    app_environment: str = "development"
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:5173"
    supabase_project_url: str = ""
    supabase_publishable_key: str = ""
    allowed_admin_emails: str = "jgabbayj@gmail.com,robieis153@gmail.com"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_admin_email_set(self) -> frozenset[str]:
        return frozenset(
            email.strip().casefold()
            for email in self.allowed_admin_emails.split(",")
            if email.strip()
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
