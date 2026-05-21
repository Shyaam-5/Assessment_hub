import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App.jsx'
import { I18nProvider } from './services/i18n.jsx'
import './index.css'
import './styles/responsive.css'
import './styles/darkmode.css'
import './styles/accessibility.css'

// Detect system dark mode preference on first load (before React renders)
if (!localStorage.getItem('theme')) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('[PWA] Service Worker registered:', reg.scope))
            .catch(err => console.warn('[PWA] SW registration failed:', err))
    })
}

const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()

function GoogleAuthShell({ children }) {
    if (!googleClientId) {
        return children
    }
    return (
        <GoogleOAuthProvider clientId={googleClientId}>
            {children}
        </GoogleOAuthProvider>
    )
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <GoogleAuthShell>
                <I18nProvider>
                    <App />
                </I18nProvider>
            </GoogleAuthShell>
        </BrowserRouter>
    </React.StrictMode>,
)
