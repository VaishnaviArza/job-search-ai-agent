import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import Card from '../components/Card'
import Button from '../components/Button'
import Badge from '../components/Badge'
import {
  fetchTracker, interviewStart, interviewAnswer, interviewSaveSession,
  interviewPerformance, voiceTranscribe, voiceSpeak,
} from '../api/client'
import type { ApplicationRecord, ChatMessage } from '../types'

interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
  tags: string[]
}

const markdownComponents = {
  p: ({ ...props }) => <p className="mb-2 last:mb-0" {...props} />,
  strong: ({ ...props }) => <strong className="font-semibold" {...props} />,
  em: ({ ...props }) => <em className="italic" {...props} />,
  ul: ({ ...props }) => <ul className="list-disc pl-5 mb-2 space-y-0.5" {...props} />,
  ol: ({ ...props }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5" {...props} />,
  li: ({ ...props }) => <li {...props} />,
  h1: ({ ...props }) => <h3 className="font-semibold text-sm mb-1" {...props} />,
  h2: ({ ...props }) => <h3 className="font-semibold text-sm mb-1" {...props} />,
  h3: ({ ...props }) => <h3 className="font-semibold text-sm mb-1" {...props} />,
  code: ({ ...props }) => <code className="bg-black/5 rounded px-1 text-xs font-mono" {...props} />,
}

export default function MockInterviewPage() {
  const { appId } = useParams<{ appId: string }>()
  const navigate = useNavigate()

  const [appRecord, setAppRecord] = useState<ApplicationRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([])
  const [historyForApi, setHistoryForApi] = useState<ChatMessage[]>([])
  const [interviewActive, setInterviewActive] = useState(false)
  const [done, setDone] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [sessionSkillTags, setSessionSkillTags] = useState<string[]>([])
  const [sessionSaved, setSessionSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const lastSpokenIndexRef = useRef(-1)

  useEffect(() => {
    if (!appId) return
    fetchTracker().then((apps) => {
      const record = apps.find((a) => a.id === appId)
      if (!record) {
        setLoadError('Application not found.')
        return
      }
      setAppRecord(record)
    })
  }, [appId])

  useEffect(() => {
    if (!appRecord || !appId || interviewActive || !appRecord.jd || !appRecord.tailored_resume_text) return
    setInterviewActive(true)
    setBusy(true)
    interviewStart(appId).then((res) => {
      setDisplayMessages([{ role: 'assistant', content: res.message, tags: res.tags }])
      setHistoryForApi(res.conversation_history)
      setDone(res.done)
    }).finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appRecord, appId])

  // Speaks the latest assistant message whenever voice mode is on -- re-runs when
  // voice mode is toggled on after a message already arrived, so nothing is missed.
  useEffect(() => {
    if (!voiceEnabled || displayMessages.length === 0) return
    const lastIndex = displayMessages.length - 1
    const lastMessage = displayMessages[lastIndex]
    if (lastMessage.role === 'assistant' && lastSpokenIndexRef.current < lastIndex) {
      lastSpokenIndexRef.current = lastIndex
      playTts(lastMessage.content)
    }
  }, [displayMessages, voiceEnabled])

  async function playTts(text: string) {
    try {
      const blob = await voiceSpeak(text)
      const url = URL.createObjectURL(blob)
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = url
        await audioPlayerRef.current.play()
      }
    } catch {
      // voice playback is best-effort
    }
  }

  async function submitAnswer(answer: string) {
    if (!appRecord?.jd || !appRecord.tailored_resume_text || !answer.trim()) return
    setDisplayMessages((msgs) => [...msgs, { role: 'user', content: answer, tags: [] }])
    setInputValue('')
    setBusy(true)
    try {
      const res = await interviewAnswer(historyForApi, appRecord.jd, appRecord.tailored_resume_text, answer)
      setDisplayMessages((msgs) => [...msgs, { role: 'assistant', content: res.message, tags: res.tags }])
      setHistoryForApi(res.conversation_history)
      setSessionSkillTags((tags) => [...tags, ...res.tags])
      setDone(res.done)

      if (res.done && appId && !sessionSaved) {
        const uniqueTags = Array.from(new Set([...sessionSkillTags, ...res.tags]))
        await interviewSaveSession(appId, res.score, res.weak_areas, uniqueTags)
        setSessionSaved(true)
        interviewPerformance(appId)
      }
    } finally {
      setBusy(false)
    }
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    audioChunksRef.current = []
    recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data)
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      setBusy(true)
      try {
        const { text } = await voiceTranscribe(blob)
        if (text.trim()) await submitAnswer(text)
      } finally {
        setBusy(false)
      }
    }
    mediaRecorderRef.current = recorder
    recorder.start()
    setRecording(true)
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  if (loadError) {
    return <div className="max-w-3xl mx-auto px-6 py-10 text-sm text-red-600">{loadError}</div>
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Mock Interview</h1>
        <Button variant="ghost" onClick={() => navigate(`/interview/${appId}`)}>Exit</Button>
      </div>

      {!appRecord ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : !appRecord.jd || !appRecord.tailored_resume_text ? (
        <p className="text-sm text-gray-500">
          This application doesn't have a saved job description / resume yet.
        </p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={voiceEnabled} onChange={(e) => setVoiceEnabled(e.target.checked)} />
            Voice mode
          </label>

          <Card className="space-y-4">
            <div className="space-y-4 max-h-[28rem] overflow-y-auto">
              {displayMessages.map((msg, i) => (
                <div key={i} className={msg.role === 'user' ? 'text-right' : ''}>
                  <div
                    className={`inline-block text-left max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.tags.length > 0 && (
                    <div className="mt-1 space-x-1">
                      {msg.tags.map((t) => <Badge key={t}>{t}</Badge>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <audio ref={audioPlayerRef} hidden />

            {!done ? (
              <div className="flex gap-2">
                {voiceEnabled ? (
                  <Button
                    variant={recording ? 'secondary' : 'primary'}
                    onClick={recording ? stopRecording : startRecording}
                    disabled={busy}
                  >
                    {recording ? 'Stop & Submit' : 'Record Answer'}
                  </Button>
                ) : (
                  <>
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitAnswer(inputValue)}
                      placeholder="Your answer..."
                      disabled={busy}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                    <Button onClick={() => submitAnswer(inputValue)} disabled={busy || !inputValue.trim()}>
                      Send
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-green-600">Interview Complete!</p>
                <Button variant="secondary" onClick={() => navigate(`/interview/${appId}`)}>
                  Back to Prep
                </Button>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
