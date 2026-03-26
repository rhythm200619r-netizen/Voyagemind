import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import Shell from './layout/Shell'
import AboutPage from './pages/AboutPage'
import FlightsPage from './pages/FlightsPage'
import HolidaysPage from './pages/HolidaysPage'
import HomePage from './pages/HomePage'
import MyTripsPage from './pages/MyTripsPage'
import OffersPage from './pages/OffersPage'
import RunDetailsPage from './pages/RunDetailsPage'
import RunsPage from './pages/RunsPage'
import StaysPage from './pages/StaysPage'
import SupportPage from './pages/SupportPage'
import TripDetailsPage from './pages/TripDetailsPage'

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
          <Route path="/my-trips" element={<MyTripsPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/trips/:runId" element={<TripDetailsPage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/runs/:runId" element={<RunDetailsPage />} />
          <Route path="/about" element={<AboutPage />} />
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
