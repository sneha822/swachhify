from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user
from app.models import LearningProgress, Lesson, Quiz, QuizAttempt, User
from app.schemas import ProgressIn, QuizSubmit
from app.services import badges, habits, rewards
from app.services.common import now_ist

router = APIRouter(tags=["learning"])


def _lesson_view(l: Lesson, prog: LearningProgress | None = None, full: bool = False) -> dict:
    v = {"id": l.id, "slug": l.slug, "title": l.title, "title_hi": l.title_hi, "category": l.category_slug,
         "description": l.description, "description_hi": l.description_hi, "duration_sec": l.duration_sec,
         "emoji": l.emoji, "thumbnail_url": l.thumbnail_url, "has_video": bool(l.video_url),
         "points": l.points, "has_quiz": l.quiz is not None,
         "progress_pct": prog.progress_pct if prog else 0, "completed": bool(prog and prog.completed)}
    if full:
        v.update({"video_url": l.video_url, "slides": l.slides, "quiz_id": l.quiz.id if l.quiz else None})
    return v


def _progress_map(db: Session, user: User | None) -> dict[int, LearningProgress]:
    if not user:
        return {}
    return {p.lesson_id: p for p in db.scalars(select(LearningProgress).where(LearningProgress.user_id == user.id))}


@router.get("/learning/lessons")
def lessons(category: str | None = None, user: User | None = Depends(get_optional_user),
            db: Session = Depends(get_db)):
    q = select(Lesson).where(Lesson.is_published.is_(True)).order_by(Lesson.sort_order, Lesson.id)
    if category:
        q = q.where(Lesson.category_slug == category)
    progress = _progress_map(db, user)
    return [_lesson_view(l, progress.get(l.id)) for l in db.scalars(q)]


@router.get("/learning/lessons/{slug}")
def lesson(slug: str, user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    l = db.scalar(select(Lesson).where(Lesson.slug == slug, Lesson.is_published.is_(True)))
    if not l:
        raise HTTPException(404, "Lesson not found")
    return _lesson_view(l, _progress_map(db, user).get(l.id), full=True)


@router.post("/learning/lessons/{slug}/progress")
def update_progress(slug: str, body: ProgressIn, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    l = db.scalar(select(Lesson).where(Lesson.slug == slug))
    if not l:
        raise HTTPException(404, "Lesson not found")
    p = db.scalar(select(LearningProgress).where(LearningProgress.user_id == user.id,
                                                 LearningProgress.lesson_id == l.id))
    if not p:
        p = LearningProgress(user_id=user.id, lesson_id=l.id, progress_pct=0)
        db.add(p)
    p.progress_pct = max(p.progress_pct or 0, body.progress_pct)
    p.last_viewed_at = now_ist()
    newly = False
    if p.progress_pct >= 100 and not p.completed:
        p.completed, p.completed_at, newly = True, now_ist(), True
        habits.record(db, user, "learned")
        if user.role == "customer":
            rewards.credit(db, user, l.points, "lesson", f"Finished lesson: {l.title}", reference=l.slug)
            badges.evaluate(db, user)
    db.commit()
    return {"progress_pct": p.progress_pct, "completed": p.completed, "newly_completed": newly,
            "points": l.points if newly else 0}


@router.get("/learning/daily")
def daily(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    out = habits.overview(db, user)
    db.commit()
    return out


@router.post("/learning/daily/tip-read")
def tip_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    habits.record(db, user, "tip_read")
    db.commit()
    return habits.overview(db, user)


@router.post("/learning/daily/challenge-done")
def challenge_done(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    first = habits.record(db, user, "challenge_done")
    if first and user.role == "customer":
        rewards.credit(db, user, rewards.CHALLENGE_POINTS, "challenge", "Daily challenge completed",
                       reference=now_ist().date().isoformat(), notify_user=False)
    db.commit()
    return habits.overview(db, user)


# ── Quizzes ───────────────────────────────────────────────────────────────────────────────────
@router.get("/quizzes/{quiz_id}")
def quiz(quiz_id: int, db: Session = Depends(get_db)):
    qz = db.get(Quiz, quiz_id)
    if not qz:
        raise HTTPException(404, "Quiz not found")
    return {"id": qz.id, "title": qz.title, "pass_pct": qz.pass_pct, "points": qz.points,
            "lesson_slug": qz.lesson.slug if qz.lesson else None,
            "questions": [{"id": q.id, "question": q.question, "question_hi": q.question_hi, "options": q.options}
                          for q in qz.questions]}


@router.post("/quizzes/{quiz_id}/attempts")
def submit_quiz(quiz_id: int, body: QuizSubmit, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    qz = db.get(Quiz, quiz_id)
    if not qz:
        raise HTTPException(404, "Quiz not found")
    results, score = [], 0
    for q in qz.questions:
        sel = body.answers.get(q.id)
        ok = sel == q.correct_index
        score += ok
        results.append({"question_id": q.id, "selected": sel, "correct_index": q.correct_index, "correct": ok,
                        "explanation": q.explanation, "explanation_hi": q.explanation_hi})
    total = len(qz.questions)
    passed = total > 0 and score * 100 >= qz.pass_pct * total
    prior_best = max((a.score for a in db.scalars(select(QuizAttempt).where(
        QuizAttempt.user_id == user.id, QuizAttempt.quiz_id == qz.id))), default=None)
    db.add(QuizAttempt(user_id=user.id, quiz_id=qz.id, score=score, total=total, passed=passed,
                       answers=[{"question_id": r["question_id"], "selected": r["selected"], "correct": r["correct"]}
                                for r in results]))
    habits.record(db, user, "quiz")
    points = 0
    if passed and user.role == "customer":
        txn = rewards.credit(db, user, qz.points, "quiz", f"Passed quiz: {qz.title}", reference=str(qz.id))
        points = txn.points if txn else 0
    db.commit()
    return {"score": score, "total": total, "passed": passed, "points": points, "results": results,
            "improved": prior_best is not None and score > prior_best, "previous_best": prior_best}


@router.get("/quizzes/attempts/me")
def my_attempts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(QuizAttempt).where(QuizAttempt.user_id == user.id)
                      .order_by(QuizAttempt.id.desc()).limit(50)).all()
    return [{"id": a.id, "quiz_id": a.quiz_id, "score": a.score, "total": a.total, "passed": a.passed,
             "created_at": a.created_at} for a in rows]
