import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from '@/auth/ProtectedRoute'
import DashboardPage from '@/pages/DashboardPage'
import AiAssistantPage from '@/pages/dashboard/AiAssistantPage'
import ContactsPage from '@/pages/dashboard/ContactsPage'
import OverviewPage from '@/pages/dashboard/OverviewPage'
import OpportunityPage from '@/pages/dashboard/OpportunityPage'
import QuotesPage from '@/pages/dashboard/QuotesPage'
import SettingsPage from '@/pages/dashboard/SettingsPage'
import SignInPage from '@/pages/SignInPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<SignInPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="opportunity" element={<OpportunityPage />} />
        <Route path="ai-assistant" element={<AiAssistantPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="quotes" element={<QuotesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
