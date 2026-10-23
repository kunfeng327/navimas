import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Chat from './pages/Chat'
import History from './pages/History'
import Diary from './pages/Diary'
import Information from './pages/Information'
import Profile from './pages/Profile'
import Sandbox from './pages/Sandbox'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Chat />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/history" element={<History />} />
      <Route path="/diary" element={<Diary />} />
      <Route path="/information" element={<Information />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/sandbox" element={<Sandbox />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
