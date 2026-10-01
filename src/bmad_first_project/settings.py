"""Application configuration, read from the environment."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings. `DATABASE_URL` overrides the default SQLite file."""

    model_config = SettingsConfigDict(extra="ignore")

    database_url: str = "sqlite:///./data/app.db"
