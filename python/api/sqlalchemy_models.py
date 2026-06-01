"""
WinsiBot — SQLAlchemy Models
ORM sobre la SQLite existente — compatible con FastAPI
"""

from sqlalchemy import create_engine, Column, String, Integer, Float
from sqlalchemy.orm import DeclarativeBase, Session
from pathlib import Path

DB_PATH = Path(__file__).parent.parent.parent / 'data' / 'db' / 'winsibot.db'
DB_URL  = f'sqlite:///{DB_PATH}'

engine = create_engine(
    DB_URL,
    connect_args = { 'check_same_thread': False, 'timeout': 10 },
    pool_recycle = 300,
)

class Base(DeclarativeBase):
    pass

# ─── Modelos ──────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = 'users'
    sender      = Column(String, primary_key=True)
    push_name   = Column(String, default='')
    exp         = Column(Integer, default=0)
    level       = Column(Integer, default=1)
    money       = Column(Integer, default=0)
    diamonds    = Column(Integer, default=0)
    premium     = Column(Integer, default=0)
    banned      = Column(Integer, default=0)
    ban_reason  = Column(String,  default='')
    registered  = Column(Integer, default=0)
    updated_at  = Column(String)

class GroupConfig(Base):
    __tablename__ = 'group_config'
    jid         = Column(String, primary_key=True)
    muted       = Column(Integer, default=0)
    antilink    = Column(Integer, default=0)
    antispam    = Column(Integer, default=0)
    modoadmin   = Column(Integer, default=0)
    welcome     = Column(Integer, default=0)
    updated_at  = Column(String)

class HealthLog(Base):
    __tablename__ = 'health_logs'
    id          = Column(Integer, primary_key=True, autoincrement=True)
    timestamp   = Column(String, nullable=False)
    status      = Column(String, nullable=False)
    score       = Column(Float,  nullable=False)
    checks      = Column(String, nullable=False)
    alerts      = Column(String, nullable=False)

class SessionEvent(Base):
    __tablename__ = 'session_events'
    id          = Column(Integer, primary_key=True, autoincrement=True)
    event       = Column(String, nullable=False)
    detail      = Column(String, default='')
    created_at  = Column(String)

def init_sqlalchemy():
    """Crear tablas si no existen — llamar al startup"""
    Base.metadata.create_all(engine)

def get_session() -> Session:
    """Retorna sesión SQLAlchemy"""
    return Session(engine)