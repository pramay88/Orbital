import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ClientApp from './ClientApp.tsx'
import AuthGate from './components/AuthGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname.startsWith('/admin')
      ? <AuthGate requiredRole="admin"><App /></AuthGate>
      : <ClientApp />}
  </StrictMode>,
)
