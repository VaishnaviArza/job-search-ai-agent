import type {
  ApplicationRecord,
  ChatMessage,
  InterviewTurnResponse,
  PerformanceSummary,
  StudyBlock,
} from '../types'

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail || detail
    } catch {
      // ignore
    }
    throw new Error(detail)
  }
  return res.json()
}

export async function uploadResume(file: File): Promise<{ text: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/resume', { method: 'POST', body: form })
  return jsonOrThrow(res)
}

export async function fetchJdFromUrl(url: string): Promise<{ text: string }> {
  const res = await fetch('/api/jd/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  return jsonOrThrow(res)
}

export async function analyze(jd: string, resume: string): Promise<{ gap_analysis: string[]; tailored_resume: string }> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jd, resume }),
  })
  return jsonOrThrow(res)
}

export async function generateCoverLetter(jd: string, resume: string, gapAnalysis: string[]): Promise<{ cover_letter: string }> {
  const res = await fetch('/api/cover-letter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jd, resume, gap_analysis: gapAnalysis }),
  })
  return jsonOrThrow(res)
}

export async function generateLinkedinMessage(jd: string, resume: string): Promise<{ message: string }> {
  const res = await fetch('/api/linkedin-message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jd, resume }),
  })
  return jsonOrThrow(res)
}

async function downloadDocx(url: string, body: object, filename: string): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  triggerDownload(blob, filename)
}

function triggerDownload(blob: Blob, filename: string) {
  const objectUrl = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(objectUrl)
}

export async function downloadResumeDocx(text: string): Promise<void> {
  return downloadDocx('/api/resume/docx', { text }, 'tailored_resume.docx')
}

export async function downloadCoverLetterDocx(text: string): Promise<void> {
  return downloadDocx('/api/cover-letter/docx', { text }, 'cover_letter.docx')
}

export async function saveToTracker(
  jd: string, gapAnalysis: string[], tailoredResume: string, coverLetter: string
): Promise<ApplicationRecord> {
  const res = await fetch('/api/tracker/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jd, gap_analysis: gapAnalysis, tailored_resume: tailoredResume, cover_letter: coverLetter }),
  })
  return jsonOrThrow(res)
}

export async function fetchTracker(): Promise<ApplicationRecord[]> {
  const res = await fetch('/api/tracker')
  return jsonOrThrow(res)
}

export async function updateStatus(appId: string, status: string): Promise<ApplicationRecord> {
  const res = await fetch(`/api/tracker/${appId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  return jsonOrThrow(res)
}

export async function updateFields(
  appId: string, fields: Partial<Pick<ApplicationRecord, 'title' | 'company' | 'location'>>
): Promise<ApplicationRecord> {
  const res = await fetch(`/api/tracker/${appId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  return jsonOrThrow(res)
}

export function trackerResumeDocxUrl(appId: string): string {
  return `/api/tracker/${appId}/resume-docx`
}

export function trackerCoverLetterDocxUrl(appId: string): string {
  return `/api/tracker/${appId}/cover-letter-docx`
}

export async function interviewStart(appId: string): Promise<InterviewTurnResponse> {
  const res = await fetch('/api/interview/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId }),
  })
  return jsonOrThrow(res)
}

export async function interviewAnswer(
  conversationHistory: ChatMessage[], jd: string, resume: string, answer: string
): Promise<InterviewTurnResponse> {
  const res = await fetch('/api/interview/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_history: conversationHistory, jd, resume, answer }),
  })
  return jsonOrThrow(res)
}

export async function interviewSaveSession(
  appId: string, score: number | null, weakAreas: string[], skillTags: string[]
): Promise<void> {
  await fetch(`/api/interview/${appId}/save-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score, weak_areas: weakAreas, skill_tags: skillTags }),
  })
}

export async function interviewSetDate(appId: string, date: string): Promise<void> {
  await fetch(`/api/interview/${appId}/date`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date }),
  })
}

export async function interviewPerformance(appId: string): Promise<PerformanceSummary> {
  const res = await fetch(`/api/interview/${appId}/performance`)
  return jsonOrThrow(res)
}

export async function interviewSchedule(
  appId: string, gapAnalysis: string[], weakAreas: string[], daysRemaining: number
): Promise<{ schedule: StudyBlock[] }> {
  const res = await fetch(`/api/interview/${appId}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gap_analysis: gapAnalysis, weak_areas: weakAreas, days_remaining: daysRemaining }),
  })
  return jsonOrThrow(res)
}

export async function voiceTranscribe(blob: Blob): Promise<{ text: string }> {
  const form = new FormData()
  form.append('file', blob, 'answer.webm')
  const res = await fetch('/api/voice/transcribe', { method: 'POST', body: form })
  return jsonOrThrow(res)
}

export async function voiceSpeak(text: string): Promise<Blob> {
  const res = await fetch('/api/voice/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error('TTS failed')
  return res.blob()
}

export async function googleAuthUrl(): Promise<{ url: string }> {
  const res = await fetch('/auth/google')
  return jsonOrThrow(res)
}

export async function googleStatus(): Promise<{ connected: boolean; email: string | null }> {
  const res = await fetch('/api/google/status')
  return jsonOrThrow(res)
}

export async function googleDisconnect(): Promise<void> {
  await fetch('/api/google/disconnect', { method: 'POST' })
}

export async function syncScheduleToCalendar(
  appId: string, blocks: StudyBlock[]
): Promise<{ created: number; failed: number; errors: string[]; already_synced: boolean; replaced: boolean }> {
  const res = await fetch(`/api/calendar/${appId}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  })
  return jsonOrThrow(res)
}
