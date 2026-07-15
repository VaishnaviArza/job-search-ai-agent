import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Card from '../components/Card'
import Button from '../components/Button'
import {
  fetchTracker, interviewPerformance, interviewSetDate, interviewSchedule,
  googleAuthUrl, googleStatus, syncScheduleToCalendar,
} from '../api/client'
import type { ApplicationRecord, PerformanceSummary, StudyBlock } from '../types'

export default function InterviewPage() {
  const { appId } = useParams<{ appId: string }>()
  const navigate = useNavigate()

  const [appRecord, setAppRecord] = useState<ApplicationRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [interviewDate, setInterviewDateState] = useState<string | null>(null)
  const [datePickerValue, setDatePickerValue] = useState(new Date().toISOString().slice(0, 10))
  const [editingDate, setEditingDate] = useState(false)

  const [performance, setPerformance] = useState<PerformanceSummary | null>(null)
  const [schedule, setSchedule] = useState<StudyBlock[]>([])

  const [googleConnected, setGoogleConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [syncedBlocks, setSyncedBlocks] = useState<StudyBlock[] | null>(null)

  useEffect(() => {
    if (!appId) return
    fetchTracker().then((apps) => {
      const record = apps.find((a) => a.id === appId)
      if (!record) {
        setLoadError('Application not found.')
        return
      }
      setAppRecord(record)
      setInterviewDateState(record.interview_date || null)
      setSchedule(record.study_schedule || [])
      setSyncedBlocks(record.calendar_synced_blocks || null)
    })
    interviewPerformance(appId).then(setPerformance)
    googleStatus().then((s) => setGoogleConnected(s.connected))
  }, [appId])

  const isSynced = useMemo(
    () => schedule.length > 0 && !!syncedBlocks && JSON.stringify(schedule) === JSON.stringify(syncedBlocks),
    [schedule, syncedBlocks]
  )

  const daysRemaining = useMemo(() => {
    if (!interviewDate) return null
    const diff = Math.ceil((new Date(interviewDate).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)
    return diff
  }, [interviewDate])

  const priorWeakAreas = useMemo(() => {
    if (!performance || performance.sessions.length === 0) return []
    return performance.sessions[performance.sessions.length - 1].weak_areas
  }, [performance])

  async function handleConfirmDate() {
    if (!appId) return
    await interviewSetDate(appId, datePickerValue)
    setInterviewDateState(datePickerValue)
    setEditingDate(false)
    setSchedule([])
    setSyncResult(null)
  }

  async function handleGenerateSchedule() {
    if (!appRecord || !appId || daysRemaining == null) return
    const weakAreas = performance ? Object.keys(performance.weak_area_counts) : []
    const res = await interviewSchedule(appId, appRecord.gap_analysis || [], weakAreas, daysRemaining)
    setSchedule(res.schedule)
    setSyncResult(null)
  }

  async function handleConnectGoogle() {
    const { url } = await googleAuthUrl()
    window.location.href = url
  }

  async function handleSyncToCalendar() {
    if (!appId) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await syncScheduleToCalendar(appId, schedule)
      setSyncedBlocks(schedule)
      setSyncResult(
        res.already_synced
          ? 'These events are already on your calendar.'
          : res.failed > 0
          ? `${res.created} event(s) added, ${res.failed} failed.`
          : res.replaced
          ? `Replaced your old study plan with ${res.created} new event(s).`
          : `${res.created} event(s) added to your calendar.`
      )
    } catch {
      setSyncResult('Could not sync to Google Calendar.')
    } finally {
      setSyncing(false)
    }
  }

  const scoreData = useMemo(
    () => (performance?.scores || []).map((score, i) => ({ session: i + 1, score })),
    [performance]
  )
  const rankedWeakAreas = useMemo(() => {
    if (!performance) return []
    return Object.entries(performance.weak_area_counts).sort((a, b) => b[1] - a[1])
  }, [performance])

  if (loadError) {
    return <div className="max-w-3xl mx-auto px-6 py-10 text-sm text-red-600">{loadError}</div>
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Interview Prep</h1>
        <Button variant="ghost" onClick={() => navigate('/tracker')}>Exit</Button>
      </div>

      {!appRecord ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : !appRecord.jd || !appRecord.tailored_resume_text ? (
        <p className="text-sm text-gray-500">
          This application doesn't have a saved job description / resume yet.
        </p>
      ) : (
        <>
          <Card>
            {interviewDate && !editingDate ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-600">
                  {daysRemaining} day(s) until your interview ({interviewDate})
                </p>
                <button
                  type="button"
                  onClick={() => { setDatePickerValue(interviewDate); setEditingDate(true) }}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600">When is your interview?</label>
                <input
                  type="date"
                  value={datePickerValue}
                  onChange={(e) => setDatePickerValue(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm"
                />
                <Button variant="secondary" onClick={handleConfirmDate}>Confirm</Button>
                {interviewDate && (
                  <Button variant="ghost" onClick={() => setEditingDate(false)}>Cancel</Button>
                )}
              </div>
            )}
          </Card>

          <Card>
            {priorWeakAreas.length > 0 && (
              <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 text-sm rounded-lg px-4 py-3 mb-4">
                Last time: focus on {priorWeakAreas.join(', ')}
              </div>
            )}
            <div className="flex gap-3">
              <Button onClick={() => navigate(`/interview/${appId}/mock`)}>Start Mock Interview</Button>
              <Button variant="secondary" onClick={handleGenerateSchedule}>Generate Study Plan</Button>
            </div>
          </Card>

          {performance && performance.scores.length > 0 && (
            <Card>
              <h2 className="font-semibold text-gray-900 mb-4">Performance Trends</h2>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={scoreData} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="session" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={{ stroke: '#e5e7eb' }} tickLine={false} label={{ value: 'Session', position: 'insideBottom', offset: -2, fontSize: 12, fill: '#9ca3af' }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e5e7eb' }} />
                  <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2} dot={{ r: 4, fill: '#4f46e5' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-1">
                {rankedWeakAreas.map(([area, count]) => (
                  <p key={area} className="text-sm text-gray-700">
                    <span className="font-medium">{area}</span> — {count} session(s)
                  </p>
                ))}
              </div>
            </Card>
          )}

          {schedule.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Study Schedule</h2>
                <div className="flex items-center gap-2">
                  {isSynced && <span className="text-xs text-green-600">✓ Synced</span>}
                  {googleConnected ? (
                    <Button onClick={handleSyncToCalendar} disabled={syncing}>
                      {syncing ? 'Syncing...' : isSynced ? 'Re-sync to Calendar' : 'Add to Google Calendar'}
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={handleConnectGoogle}>
                      Connect Google Calendar
                    </Button>
                  )}
                </div>
              </div>
              {syncResult && <p className="text-sm text-gray-600 mb-3">{syncResult}</p>}
              <div className="space-y-2">
                {schedule.map((block, i) => (
                  <div key={i} className="border-l-4 border-indigo-500 bg-indigo-50/50 rounded-r-lg px-3 py-2">
                    <p className="text-sm font-medium text-gray-900">{block.topic}</p>
                    <p className="text-xs text-gray-500">{block.date}, {block.start}–{block.end}</p>
                    {block.resource_title && block.resource_url && (
                      <a
                        href={block.resource_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        {block.resource_title}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
