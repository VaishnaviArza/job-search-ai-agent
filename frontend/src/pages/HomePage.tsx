import { useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/Card'
import Button from '../components/Button'
import {
  uploadResume, fetchJdFromUrl, analyze, generateCoverLetter,
  generateLinkedinMessage, downloadResumeDocx, downloadCoverLetterDocx, saveToTracker,
} from '../api/client'
import type { JdInputMode, ApplicationRecord } from '../types'

const STEPS = ['Tailoring your resume', 'Generating cover letter', 'Preparing your LinkedIn message']

export default function HomePage() {
  const [resumeText, setResumeText] = useState('')
  const [resumeFileName, setResumeFileName] = useState('')
  const [jdMode, setJdMode] = useState<JdInputMode>('paste')
  const [jdPasteText, setJdPasteText] = useState('')
  const [jdUrl, setJdUrl] = useState('')
  const [jd, setJd] = useState('')

  const [stage, setStage] = useState<'input' | 'processing' | 'results'>('input')
  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [gapAnalysis, setGapAnalysis] = useState<string[]>([])
  const [tailoredResume, setTailoredResume] = useState('')
  const [coverLetter, setCoverLetter] = useState('')
  const [linkedinMessage, setLinkedinMessage] = useState('')
  const [copied, setCopied] = useState(false)

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [savedRecord, setSavedRecord] = useState<ApplicationRecord | null>(null)

  const jdContent = jdMode === 'paste' ? jdPasteText : jdUrl
  const analyzeDisabled = !resumeText.trim() || !jdContent.trim()

  async function handleResumeUpload(file: File) {
    setError(null)
    try {
      const { text } = await uploadResume(file)
      setResumeText(text)
      setResumeFileName(file.name)
    } catch {
      setError('Could not read that resume file. Please upload a .docx file.')
    }
  }

  function resetAll() {
    setResumeText('')
    setResumeFileName('')
    setJdMode('paste')
    setJdPasteText('')
    setJdUrl('')
    setJd('')
    setStage('input')
    setStepIndex(0)
    setError(null)
    setGapAnalysis([])
    setTailoredResume('')
    setCoverLetter('')
    setLinkedinMessage('')
    setSaveStatus('idle')
    setSavedRecord(null)
  }

  async function handleAnalyze() {
    setError(null)
    let resolvedJd = jdPasteText.trim()
    if (jdMode !== 'paste') {
      try {
        const { text } = await fetchJdFromUrl(jdUrl.trim())
        resolvedJd = text
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not fetch that URL.')
        return
      }
    }
    setJd(resolvedJd)
    setStage('processing')
    setStepIndex(0)
    try {
      const step1 = await analyze(resolvedJd, resumeText)
      setGapAnalysis(step1.gap_analysis)
      setTailoredResume(step1.tailored_resume)

      setStepIndex(1)
      const step2 = await generateCoverLetter(resolvedJd, resumeText, step1.gap_analysis)
      setCoverLetter(step2.cover_letter)

      setStepIndex(2)
      const linkedinRes = await generateLinkedinMessage(resolvedJd, resumeText)
      setLinkedinMessage(linkedinRes.message)

      setStage('results')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong during analysis.')
      setStage('input')
    }
  }

  async function handleCopyLinkedin() {
    await navigator.clipboard.writeText(linkedinMessage)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleSave() {
    setSaveStatus('saving')
    try {
      const record = await saveToTracker(jd, gapAnalysis, tailoredResume, coverLetter)
      setSavedRecord(record)
      setSaveStatus('saved')
    } catch {
      setSaveStatus('idle')
      setError('Could not save this application. Please try again.')
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {stage === 'input' && (
        <>
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <h2 className="font-semibold text-gray-900 mb-3">Upload Resume</h2>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg py-10 cursor-pointer hover:border-indigo-300 transition-colors">
                <span className="text-sm text-gray-500">
                  {resumeFileName || 'Click to upload your resume (.docx)'}
                </span>
                <input
                  type="file"
                  accept=".docx"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleResumeUpload(e.target.files[0])}
                />
              </label>
              {resumeText && <p className="text-xs text-green-600 mt-2">Resume loaded.</p>}
            </Card>

            <Card>
              <h2 className="font-semibold text-gray-900 mb-3">Job Description</h2>
              <div className="flex gap-2 mb-3">
                {(['paste', 'linkedin', 'company'] as JdInputMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setJdMode(mode)}
                    className={`flex-1 text-xs font-medium px-2 py-1.5 rounded-lg border transition-colors ${
                      jdMode === mode
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {mode === 'paste' ? 'Paste Text' : mode === 'linkedin' ? 'LinkedIn URL' : 'Company URL'}
                  </button>
                ))}
              </div>
              {jdMode === 'paste' ? (
                <textarea
                  value={jdPasteText}
                  onChange={(e) => setJdPasteText(e.target.value)}
                  placeholder="Paste job description here"
                  rows={9}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              ) : (
                <input
                  type="text"
                  value={jdUrl}
                  onChange={(e) => setJdUrl(e.target.value)}
                  placeholder={jdMode === 'linkedin' ? 'https://www.linkedin.com/jobs/view/...' : 'https://company.com/careers/...'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              )}
            </Card>
          </div>

          <Button onClick={handleAnalyze} disabled={analyzeDisabled}>
            Analyze
          </Button>
        </>
      )}

      {stage === 'processing' && (
        <Card className="max-w-md mx-auto">
          <ul className="space-y-3">
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                    i < stepIndex ? 'bg-green-500 text-white'
                      : i === stepIndex ? 'bg-indigo-600 text-white animate-pulse'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {i < stepIndex ? '✓' : i + 1}
                </span>
                <span className={i <= stepIndex ? 'text-gray-900' : 'text-gray-400'}>{label}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {stage === 'results' && (
        <>
          <Card>
            <h2 className="font-semibold text-gray-900 mb-3">Gap Analysis</h2>
            {gapAnalysis.length ? (
              <ul className="space-y-2 text-sm text-gray-700">
                {gapAnalysis.map((gap) => <li key={gap}>• {gap}</li>)}
              </ul>
            ) : <p className="text-sm text-gray-400">No critical gaps identified.</p>}
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Button variant="secondary" onClick={() => downloadResumeDocx(tailoredResume)}>
              Download Tailored Resume
            </Button>
            <Button variant="secondary" onClick={() => downloadCoverLetterDocx(coverLetter)}>
              Download Cover Letter
            </Button>
          </div>

          <Card>
            <h2 className="font-semibold text-gray-900 mb-3">LinkedIn Outreach Message</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 font-mono whitespace-pre-wrap">
              {linkedinMessage}
            </div>
            <Button variant="ghost" className="mt-2" onClick={handleCopyLinkedin}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </Card>

          <div className="flex items-center gap-4">
            {saveStatus !== 'saved' ? (
              <Button onClick={handleSave} disabled={saveStatus === 'saving'}>
                {saveStatus === 'saving' ? 'Saving...' : 'Save to Application Tracker'}
              </Button>
            ) : (
              <p className="text-sm text-green-600">
                Saved: {savedRecord?.title} at {savedRecord?.company} —{' '}
                <Link to="/tracker" className="text-indigo-600 hover:underline">view in tracker</Link>
              </p>
            )}
            <Button variant="ghost" onClick={resetAll}>Start Over</Button>
          </div>
        </>
      )}
    </div>
  )
}
