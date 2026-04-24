import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    # JWT
    JWT_SECRET_KEY: str = "datasight-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Storage
    DATA_DIR: str = os.path.join(os.path.dirname(__file__), "..", "data")
    DATABASE_URL: Optional[str] = None  # Will default to SQLite in db.py if None
    
    # AI Engine
    GEMINI_API_KEY: str = ""
    
    # App
    PROJECT_NAME: str = "GVS DataNova"
    VERSION: str = "2.0.0"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
