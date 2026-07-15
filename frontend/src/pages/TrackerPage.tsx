import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Card from '../components/Card'
import Button from '../components/Button'
import StatusSelect from '../components/StatusSelect'
import EditableCell from '../components/EditableCell'
import { fetchTracker, updateStatus, updateFields, trackerResumeDocxUrl, trackerCoverLetterDocxUrl } from '../api/client'
import type { ApplicationRecord } from '../types'

export default function TrackerPage() {
  const [applications, setApplications] = useState<ApplicationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const justConnectedGoogle = searchParams.get('google') === 'connected'

  useEffect(() => {
    fetchTracker().then(setApplications).finally(() => setLoading(false))
  }, [])

  async function handleStatusChange(appId: string, status: string) {
    const updated = await updateStatus(appId, status)
    setApplications((apps) => apps.map((a) => (a.id === appId ? updated : a)))
  }

  async function handleFieldChange(appId: string, field: 'title' | 'company' | 'location', value: string) {
    const updated = await updateFields(appId, { [field]: value })
    setApplications((apps) => apps.map((a) => (a.id === appId ? updated : a)))
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Application Tracker</h1>

      {justConnectedGoogle && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 mb-6">
          Google Calendar connected. Open an application's Interview Prep page to sync a study plan.
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : applications.length === 0 ? (
        <Card><p className="text-sm text-gray-400">No applications saved yet.</p></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Files</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app, i) => {
                const key = app.id || `${app.title}-${i}`
                const status = app.status || 'Applied'
                return (
                  <tr key={key} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 text-gray-900">
                      {app.id ? (
                        <EditableCell value={app.title || ''} onSave={(v) => handleFieldChange(app.id!, 'title', v)} />
                      ) : (app.title || 'Unknown')}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {app.id ? (
                        <EditableCell value={app.company || ''} onSave={(v) => handleFieldChange(app.id!, 'company', v)} />
                      ) : (app.company || 'Unknown')}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {app.id ? (
                        <EditableCell value={app.location || ''} onSave={(v) => handleFieldChange(app.id!, 'location', v)} />
                      ) : (app.location || 'Unknown')}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{app.date_applied || app.date_saved || ''}</td>
                    <td className="px-4 py-3">
                      {app.id ? (
                        <StatusSelect value={status} onChange={(s) => handleStatusChange(app.id!, s)} />
                      ) : (
                        <span className="text-gray-500">{status}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                      {app.id && app.resume_path && (
                        <a href={trackerResumeDocxUrl(app.id)} className="text-indigo-600 hover:underline">Resume</a>
                      )}
                      {app.id && app.cover_letter_path && (
                        <a href={trackerCoverLetterDocxUrl(app.id)} className="text-indigo-600 hover:underline">Cover letter</a>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {app.id && app.jd && status === 'Interview' && (
                        <Button variant="secondary" className="whitespace-nowrap" onClick={() => navigate(`/interview/${app.id}`)}>
                          Start Prep
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
