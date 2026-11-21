import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ClientApp from './ClientApp.tsx'
import AuthGate from './components/AuthGate'
import MediaRoute from './components/MediaRoute'

const mediaRoute = window.location.pathname.match(/^\/(watch|photos|audio)\/([^/]+)$/);

const app = mediaRoute
  ? <MediaRoute kind={mediaRoute[1] as "watch" | "photos" | "audio"} mediaId={decodeURIComponent(mediaRoute[2])} />
  : window.location.pathname.startsWith('/admin')
    ? <AuthGate requiredRole="admin"><App /></AuthGate>
    : <ClientApp />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {app}
  </StrictMode>,
)
