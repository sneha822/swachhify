from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class AIConversation(TimestampMixin, Base):
    __tablename__ = "ai_conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Signed-out visitors can chat too; this secret proves they own the conversation.
    guest_key: Mapped[str | None] = mapped_column(String(48))
    title: Mapped[str] = mapped_column(String(160), default="New chat")
    language: Mapped[str] = mapped_column(String(8), default="en")
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    messages: Mapped[list["AIMessage"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", order_by="AIMessage.id"
    )


class AIMessage(TimestampMixin, Base):
    __tablename__ = "ai_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(12))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    # Structured assistant reply rendered by the client (answer card, clarify options, actions).
    payload: Mapped[dict | None] = mapped_column(JSON)
    intent: Mapped[str | None] = mapped_column(String(32), index=True)
    matched_item_slug: Mapped[str | None] = mapped_column(String(64), index=True)
    category_slug: Mapped[str | None] = mapped_column(String(32), index=True)
    source: Mapped[str | None] = mapped_column(String(24))  # knowledge_base | ai | fallback
    confidence: Mapped[float | None] = mapped_column(Float)
    feedback: Mapped[int | None] = mapped_column(Integer)  # 1 helpful, -1 not helpful
    feedback_note: Mapped[str | None] = mapped_column(Text)

    conversation: Mapped[AIConversation] = relationship(back_populates="messages")


class Lesson(TimestampMixin, Base):
    """A micro-lesson (20–90 s). Plays `video_url` when set, otherwise narrated story slides."""

    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(160))
    title_hi: Mapped[str | None] = mapped_column(String(160))
    category_slug: Mapped[str] = mapped_column(String(32), index=True)  # waste category or "general"
    description: Mapped[str] = mapped_column(Text)
    description_hi: Mapped[str | None] = mapped_column(Text)
    duration_sec: Mapped[int] = mapped_column(Integer, default=45)
    emoji: Mapped[str] = mapped_column(String(8), default="🎬")
    video_url: Mapped[str | None] = mapped_column(String(500))
    thumbnail_url: Mapped[str | None] = mapped_column(String(500))
    # [{"emoji": str, "text": str, "text_hi": str}]
    slides: Mapped[list] = mapped_column(JSON, default=list)
    points: Mapped[int] = mapped_column(Integer, default=5)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)

    quiz: Mapped["Quiz | None"] = relationship(back_populates="lesson", uselist=False, cascade="all, delete-orphan")


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), unique=True)
    title: Mapped[str] = mapped_column(String(160))
    pass_pct: Mapped[int] = mapped_column(Integer, default=60)
    points: Mapped[int] = mapped_column(Integer, default=10)

    lesson: Mapped[Lesson | None] = relationship(back_populates="quiz")
    questions: Mapped[list["QuizQuestion"]] = relationship(
        back_populates="quiz", cascade="all, delete-orphan", order_by="QuizQuestion.sort_order"
    )


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"), index=True)
    question: Mapped[str] = mapped_column(Text)
    question_hi: Mapped[str | None] = mapped_column(Text)
    options: Mapped[list] = mapped_column(JSON)  # [{"text": str, "text_hi": str}]
    correct_index: Mapped[int] = mapped_column(Integer)
    explanation: Mapped[str] = mapped_column(Text)
    explanation_hi: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    quiz: Mapped[Quiz] = relationship(back_populates="questions")


class QuizAttempt(TimestampMixin, Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"), index=True)
    score: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    passed: Mapped[bool] = mapped_column(Boolean)
    answers: Mapped[list] = mapped_column(JSON)  # [{"question_id", "selected", "correct"}]


class LearningProgress(Base):
    __tablename__ = "learning_progress"
    __table_args__ = (UniqueConstraint("user_id", "lesson_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), index=True)
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DailyContent(Base):
    """Daily tips and challenges, rotated by day-of-year."""

    __tablename__ = "daily_content"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), index=True)  # tip | challenge
    text: Mapped[str] = mapped_column(Text)
    text_hi: Mapped[str | None] = mapped_column(Text)
    category_slug: Mapped[str | None] = mapped_column(String(32))


class HabitStreak(Base):
    __tablename__ = "habit_streaks"
    __table_args__ = (UniqueConstraint("user_id", "kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    current: Mapped[int] = mapped_column(Integer, default=0)
    longest: Mapped[int] = mapped_column(Integer, default=0)
    last_date: Mapped[date | None] = mapped_column(Date)


class DailyActivity(Base):
    """One row per user/day/kind — powers streaks and weekly/monthly goals."""

    __tablename__ = "daily_activity"
    __table_args__ = (UniqueConstraint("user_id", "day", "kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    kind: Mapped[str] = mapped_column(String(24))  # learned | tip_read | challenge_done | asked_ai
