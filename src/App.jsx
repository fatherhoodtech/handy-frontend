import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardPage from '@/pages/DashboardPage'
import SignInPage from '@/pages/SignInPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<SignInPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
