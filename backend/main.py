import io
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel

import agent
import google_calendar
import voice

app = FastAPI(title="Career Agent API")


# ---------- Phase 1 ----------

class UrlRequest(BaseModel):
    url: str


class AnalyzeRequest(BaseModel):
    jd: str
    resume: str


class CoverLetterRequest(BaseModel):
    jd: str
    resume: str
    gap_analysis: List[str]


class LinkedinRequest(BaseModel):
    jd: str
    resume: str


class DocxRequest(BaseModel):
    text: str


class SaveTrackerRequest(BaseModel):
    jd: str
    gap_analysis: List[str]
    tailored_resume: str
    cover_letter: str


class StatusUpdateRequest(BaseModel):
    status: str


class FieldsUpdateRequest(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None


def _docx_response(buffer: io.BytesIO, filename: str) -> StreamingResponse:
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/resume")
async def upload_resume(file: UploadFile = File(...)):
    text = agent.read_resume(file.file)
    return {"text": text}


@app.post("/api/jd/url")
async def jd_from_url(body: UrlRequest):
    try:
        text = agent.extract_jd_from_url(body.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"text": text}


@app.post("/api/analyze")
async def analyze(body: AnalyzeRequest):
    gap_analysis, tailored_resume = agent.analyze_and_tailor(body.jd, body.resume)
    return {"gap_analysis": gap_analysis, "tailored_resume": tailored_resume}


@app.post("/api/cover-letter")
async def cover_letter(body: CoverLetterRequest):
    text = agent.generate_cover_letter(body.jd, body.resume, body.gap_analysis)
    return {"cover_letter": text}


@app.post("/api/linkedin-message")
async def linkedin_message(body: LinkedinRequest):
    message = agent.generate_linkedin_message(body.jd, body.resume)
    return {"message": message}


@app.post("/api/resume/docx")
async def resume_docx(body: DocxRequest):
    buffer = agent.create_docx(body.text)
    return _docx_response(buffer, "tailored_resume.docx")


@app.post("/api/cover-letter/docx")
async def cover_letter_docx(body: DocxRequest):
    buffer = agent.create_cover_letter_docx(body.text)
    return _docx_response(buffer, "cover_letter.docx")


@app.post("/api/tracker/save")
async def save_tracker(body: SaveTrackerRequest):
    resume_buffer = agent.create_docx(body.tailored_resume)
    cover_letter_buffer = agent.create_cover_letter_docx(body.cover_letter)
    record = agent.save_job_application(
        body.jd, body.gap_analysis, body.tailored_resume,
        resume_buffer.getvalue(), cover_letter_buffer.getvalue(),
    )
    return record


@app.get("/api/tracker")
async def get_tracker():
    return agent.load_application()


@app.patch("/api/tracker/{app_id}/status")
async def patch_status(app_id: str, body: StatusUpdateRequest):
    agent.update_application_status(app_id, body.status)
    applications = agent.load_application()
    record = next((a for a in applications if a.get('id') == app_id), None)
    if not record:
        raise HTTPException(status_code=404, detail="Application not found")
    return record


@app.patch("/api/tracker/{app_id}")
async def patch_fields(app_id: str, body: FieldsUpdateRequest):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    record = agent.update_application_fields(app_id, fields)
    if not record:
        raise HTTPException(status_code=404, detail="Application not found")
    return record


def _find_record_or_404(app_id: str):
    record = next((a for a in agent.load_application() if a.get('id') == app_id), None)
    if not record:
        raise HTTPException(status_code=404, detail="Application not found")
    return record


@app.get("/api/tracker/{app_id}/resume-docx")
async def download_resume_docx(app_id: str):
    record = _find_record_or_404(app_id)
    path = record.get('resume_path')
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Resume file not found")
    return StreamingResponse(
        open(path, 'rb'),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="tailored_resume.docx"'},
    )


@app.get("/api/tracker/{app_id}/cover-letter-docx")
async def download_cover_letter_docx(app_id: str):
    record = _find_record_or_404(app_id)
    path = record.get('cover_letter_path')
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Cover letter file not found")
    return StreamingResponse(
        open(path, 'rb'),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="cover_letter.docx"'},
    )


# ---------- Phase 2 ----------

class InterviewStartRequest(BaseModel):
    app_id: str


class InterviewAnswerRequest(BaseModel):
    conversation_history: List[dict]
    jd: str
    resume: str
    answer: str


class SaveSessionRequest(BaseModel):
    score: Optional[int] = None
    weak_areas: List[str] = []
    skill_tags: List[str] = []


class SetDateRequest(BaseModel):
    date: str


class ScheduleRequest(BaseModel):
    gap_analysis: List[str]
    weak_areas: List[str]
    days_remaining: int


def _interview_turn_response(raw_message: str, conversation_history: list):
    done = '## Interview Complete' in raw_message
    if done:
        clean, score, weak_areas = agent.parse_final_assessment(raw_message)
        return {
            "message": clean, "tags": [], "conversation_history": conversation_history,
            "done": True, "score": score, "weak_areas": weak_areas,
        }
    clean, tags = agent.parse_skill_tags(raw_message)
    return {
        "message": clean, "tags": tags, "conversation_history": conversation_history,
        "done": False, "score": None, "weak_areas": [],
    }


@app.post("/api/interview/start")
async def interview_start(body: InterviewStartRequest):
    record = _find_record_or_404(body.app_id)
    jd = record.get('jd')
    resume = record.get('tailored_resume_text')
    prior_weak_areas = agent.get_prior_weak_areas(body.app_id)
    raw_message, conversation_history = agent.mock_interview(None, [], jd, resume, prior_weak_areas)
    return _interview_turn_response(raw_message, conversation_history)


@app.post("/api/interview/answer")
async def interview_answer(body: InterviewAnswerRequest):
    raw_message, conversation_history = agent.mock_interview(
        body.answer, body.conversation_history, body.jd, body.resume
    )
    return _interview_turn_response(raw_message, conversation_history)


@app.post("/api/interview/{app_id}/save-session")
async def interview_save_session(app_id: str, body: SaveSessionRequest):
    agent.save_interview_session(app_id, body.score, body.weak_areas, body.skill_tags)
    return {"ok": True}


@app.post("/api/interview/{app_id}/date")
async def interview_set_date(app_id: str, body: SetDateRequest):
    agent.set_interview_date(app_id, body.date)
    return {"ok": True}


@app.get("/api/interview/{app_id}/performance")
async def interview_performance(app_id: str):
    return agent.get_performance_summary(app_id)


@app.post("/api/interview/{app_id}/schedule")
async def interview_schedule(app_id: str, body: ScheduleRequest):
    busy_periods: List[dict] = []
    if google_calendar.is_connected():
        try:
            busy_periods = google_calendar.list_upcoming_events(body.days_remaining)
        except Exception:
            busy_periods = []

    other_interviews = [
        {"date": a['interview_date'], "title": a.get('title', 'Unknown'), "company": a.get('company', 'Unknown')}
        for a in agent.load_application()
        if a.get('id') and a.get('id') != app_id and a.get('status') == 'Interview' and a.get('interview_date')
    ]

    schedule = agent.generate_study_schedule(
        body.gap_analysis, body.weak_areas, body.days_remaining, busy_periods, other_interviews
    )
    agent.save_study_schedule(app_id, schedule)
    return {"schedule": schedule}


# ---------- Voice ----------

class SpeakRequest(BaseModel):
    text: str


@app.post("/api/voice/transcribe")
async def voice_transcribe(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    text = voice.transcribe(io.BytesIO(audio_bytes))
    return {"text": text}


@app.post("/api/voice/speak")
async def voice_speak(body: SpeakRequest):
    audio_bytes = voice.speak(body.text)
    return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/mpeg")


# ---------- Google Calendar ----------

class StudyBlockIn(BaseModel):
    date: str
    start: str
    end: str
    topic: str
    resource_title: Optional[str] = None
    resource_url: Optional[str] = None


class CalendarSyncRequest(BaseModel):
    blocks: List[StudyBlockIn]


@app.get("/auth/google")
async def google_auth():
    url = google_calendar.get_authorization_url()
    return {"url": url}


@app.get("/auth/google/callback")
async def google_auth_callback(code: str):
    try:
        google_calendar.exchange_code_for_tokens(code)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Google token exchange failed: {e}")
    return RedirectResponse(url="http://localhost:5173/tracker?google=connected")


@app.get("/api/google/status")
async def google_status():
    connected = google_calendar.is_connected()
    email = google_calendar.get_user_email() if connected else None
    return {"connected": connected, "email": email}


@app.post("/api/google/disconnect")
async def google_disconnect():
    google_calendar.disconnect()
    return {"ok": True}


@app.post("/api/calendar/{app_id}/sync")
async def calendar_sync(app_id: str, body: CalendarSyncRequest):
    blocks_as_dicts = [b.model_dump() for b in body.blocks]

    try:
        access_token = google_calendar.get_valid_access_token()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    old_event_ids = agent.get_calendar_event_ids(app_id)

    if blocks_as_dicts and agent.get_calendar_sync(app_id) == blocks_as_dicts and old_event_ids:
        try:
            still_all_exist = all(
                google_calendar.event_exists(access_token, eid) for eid in old_event_ids
            )
        except Exception:
            still_all_exist = False  # can't verify -- don't falsely claim already-synced
        if still_all_exist:
            return {"created": 0, "failed": 0, "errors": [], "already_synced": True, "replaced": False}

    replaced = bool(old_event_ids)
    for event_id in old_event_ids:
        try:
            google_calendar.delete_calendar_event(access_token, event_id)
        except Exception:
            pass  # best-effort cleanup; a stale/already-gone ID shouldn't block the resync

    created = 0
    new_event_ids: List[str] = []
    errors: List[str] = []
    for block in body.blocks:
        try:
            description = (
                f"{block.resource_title}: {block.resource_url}"
                if block.resource_title and block.resource_url else None
            )
            event = google_calendar.create_calendar_event(
                access_token, block.topic, block.date, block.start, block.end, description
            )
            new_event_ids.append(event['id'])
            created += 1
        except Exception as e:
            errors.append(str(e))

    agent.save_calendar_sync(app_id, blocks_as_dicts if created > 0 else [], new_event_ids)

    return {"created": created, "failed": len(errors), "errors": errors, "already_synced": False, "replaced": replaced}
