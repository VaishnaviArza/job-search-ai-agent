export interface InterviewSession {
  date: string
  score: number | null
  weak_areas: string[]
  skill_tags: string[]
}

export interface ApplicationRecord {
  id?: string
  jd_hash?: string
  title: string
  company: string
  location: string
  date_applied?: string
  date_saved?: string
  status: string
  jd?: string
  gap_analysis?: string[]
  resume_path?: string
  cover_letter_path?: string
  tailored_resume_text?: string
  interview_date?: string
  interview_sessions?: InterviewSession[]
  redirect_url?: string
  study_schedule?: StudyBlock[]
  calendar_synced_blocks?: StudyBlock[]
}

export const STATUS_OPTIONS = ['Applied', 'Shortlisted', 'Interview', 'Offer', 'Rejected']

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface InterviewTurnResponse {
  message: string
  tags: string[]
  conversation_history: ChatMessage[]
  done: boolean
  score: number | null
  weak_areas: string[]
}

export interface PerformanceSummary {
  scores: number[]
  weak_area_counts: Record<string, number>
  sessions: InterviewSession[]
}

export interface StudyBlock {
  date: string
  start: string
  end: string
  topic: string
  resource_title?: string
  resource_url?: string
}

export type JdInputMode = 'paste' | 'linkedin' | 'company'
