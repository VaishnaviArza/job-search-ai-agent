import { BrowserRouter, Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar'
import HomePage from './pages/HomePage'
import TrackerPage from './pages/TrackerPage'
import InterviewPage from './pages/InterviewPage'
import MockInterviewPage from './pages/MockInterviewPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#f8f8f7]">
        <NavBar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tracker" element={<TrackerPage />} />
          <Route path="/interview/:appId" element={<InterviewPage />} />
          <Route path="/interview/:appId/mock" element={<MockInterviewPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
