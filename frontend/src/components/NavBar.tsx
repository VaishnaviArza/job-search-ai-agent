import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { googleAuthUrl, googleDisconnect, googleStatus } from '../api/client'

const linkBase = 'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors'
const linkActive = 'bg-indigo-50 text-indigo-700'
const linkInactive = 'text-gray-600 hover:bg-gray-100'

function GoogleAccountWidget() {
  const [connected, setConnected] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  function refresh() {
    googleStatus()
      .then((s) => {
        setConnected(s.connected)
        setEmail(s.email)
      })
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  async function handleSignIn() {
    const { url } = await googleAuthUrl()
    window.location.href = url
  }

  async function handleSignOut() {
    await googleDisconnect()
    setConnected(false)
    setEmail(null)
  }

  if (loading) return null

  if (!connected) {
    return (
      <button
        type="button"
        onClick={handleSignIn}
        className="text-sm font-medium text-indigo-600 hover:underline"
      >
        Sign in with Google
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-600">{email || 'Connected'}</span>
      <button
        type="button"
        onClick={handleSignOut}
        className="text-xs text-gray-500 hover:underline"
      >
        Sign out
      </button>
    </div>
  )
}

export default function NavBar() {
  return (
    <header className="border-b border-gray-200 bg-white/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <span className="font-semibold text-gray-900">Career Agent</span>
        <div className="flex items-center gap-4">
          <nav className="flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkInactive}`}
            >
              Home
            </NavLink>
            <NavLink
              to="/tracker"
              className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkInactive}`}
            >
              Application Tracker
            </NavLink>
          </nav>
          <GoogleAccountWidget />
        </div>
      </div>
    </header>
  )
}
