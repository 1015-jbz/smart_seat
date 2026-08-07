"""数据库引擎与 Session 工厂

- SQLAlchemy 2.0 风格
- SQLite 数据库文件：backend/data/smart_cabin.db
- 提供 get_db 依赖注入
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from config import DATABASE_URL

# check_same_thread=False 让 FastAPI 的线程池可以使用同一个连接
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 所有 ORM 模型的基类
Base = declarative_base()


def get_db():
    """FastAPI 依赖注入：每个请求获取独立 Session，请求结束自动关闭。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """启动时调用，创建所有数据表。"""
    # 必须先 import models 才能让 Base.metadata 知道所有表
    import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
