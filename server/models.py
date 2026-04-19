from sqlalchemy import Column, String, Integer, Float, ForeignKey, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(128), unique=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    files = relationship("FileRecord", back_populates="user")
    chats = relationship("ChatRecord", back_populates="user")
    query_logs = relationship("QueryLog", back_populates="user")

class FileRecord(Base):
    __tablename__ = "files"
    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    filename = Column(String, nullable=False)
    filepath = Column(String, nullable=False)
    rows = Column(Integer)
    columns = Column(Integer)
    quality_score = Column(Integer)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="files")
    chats = relationship("ChatRecord", back_populates="file")
    context = relationship("ContextRecord", back_populates="file", uselist=False)

class ChatRecord(Base):
    __tablename__ = "chats"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    file_id = Column(String(36), ForeignKey("files.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    user_prompt = Column(Text, nullable=False)
    chart_type = Column(String)
    x_column = Column(String)
    y_column = Column(String)
    aggregation = Column(String)
    chart_data = Column(Text)  # JSON string
    insights = Column(Text)    # JSON string
    kpis = Column(Text)        # JSON string
    ml_result = Column(Text)    # JSON string
    summary = Column(Text)
    color = Column(String)
    confidence = Column(Float)
    reasoning = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    file = relationship("FileRecord", back_populates="chats")
    user = relationship("User", back_populates="chats")


class QueryLog(Base):
    """Minimal audit: who asked what and when (PostgreSQL-friendly)."""
    __tablename__ = "query_logs"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    query = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="query_logs")


class ContextRecord(Base):
    __tablename__ = "context"
    file_id = Column(String(36), ForeignKey("files.id"), primary_key=True)
    last_chart_type = Column(String)
    last_x = Column(String)
    last_y = Column(String)
    last_color = Column(String)
    found_columns = Column(Text) # JSON string
    updated_at = Column(DateTime, default=datetime.utcnow)
    
    file = relationship("FileRecord", back_populates="context")
