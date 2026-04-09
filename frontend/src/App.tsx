import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'

import ProtectedRoute from './components/ProtectedRoute'
import PublicOnlyRoute from './components/PublicOnlyRoute'
import Shell from './layout/Shell'
import AboutPage from './pages/AboutPage'
import FlightsPage from './pages/FlightsPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import HolidaysPage from './pages/HolidaysPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import MyTripsPage from './pages/MyTripsPage'
import OffersPage from './pages/OffersPage'
import PersonalInfoPage from './pages/PersonalInfoPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SignupPage from './pages/SignupPage'
import StaysPage from './pages/StaysPage'
import SupportPage from './pages/SupportPage'
import TripDetailsPage from './pages/TripDetailsPage'

function LegacyRunRedirect() {
  const { runId } = useParams<{ runId: string }>()
  return <Navigate to={runId ? `/trips/${runId}` : '/my-trips'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/flights" element={<FlightsPage />} />
          <Route path="/stays" element={<StaysPage />} />
          <Route path="/holidays" element={<HolidaysPage />} />
          <Route path="/offers" element={<OffersPage />} />
          <Route
            path="/my-trips"
            element={
              <ProtectedRoute>
                <MyTripsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/support" element={<SupportPage />} />
          <Route
            path="/trips/:runId"
            element={
              <ProtectedRoute>
                <TripDetailsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/runs/:runId"
            element={
              <ProtectedRoute>
                <LegacyRunRedirect />
              </ProtectedRoute>
            }
          />
          <Route
            path="/personal-info"
            element={
              <ProtectedRoute>
                <PersonalInfoPage />
              </ProtectedRoute>
            }
          />
          <Route path="/about" element={<AboutPage />} />
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicOnlyRoute>
                <SignupPage />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <PublicOnlyRoute>
                <ForgotPasswordPage />
              </PublicOnlyRoute>
            }
          />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/plan" element={<Navigate to="/" replace />} />
          <Route
            path="*"
            element={
              <div className="grid gap-2">
                <div className="text-2xl font-semibold">Page not found</div>
                <div className="text-sm text-slate-600">Try Home, Flights, or Stays from the top navigation.</div>
              </div>
            }
          />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}
