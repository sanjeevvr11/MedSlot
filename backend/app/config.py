from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg:///medslot"
    environment: str = "development"

    session_cookie_name: str = "medslot_session"
    session_ttl_hours: int = 24 * 7
    cookie_secure: bool = False

    # Booking rules
    clinic_timezone: str = "Asia/Kolkata"
    slot_step_minutes: int = 15
    min_lead_minutes: int = 60
    booking_horizon_days: int = 30
    cancellation_cutoff_hours: int = 2

    # Login throttling
    login_max_failures: int = 5
    login_window_minutes: int = 15

    @field_validator("database_url")
    @classmethod
    def normalise_driver(cls, value: str) -> str:
        # Render and most hosts hand out postgres:// or postgresql:// URLs.
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix):]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
