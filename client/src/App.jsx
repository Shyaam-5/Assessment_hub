import { useState, useEffect, createContext, useContext, Component } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import axios from 'axios'
import Login from './pages/Login'
import StudentPortal from './pages/StudentPortal'
import MentorPortal from './pages/MentorPortal'
import AdminPortal from './pages/AdminPortal'
import ScanMobilePage from './prescan/pages/ScanMobilePage'
import ScanDesktopPage from './prescan/pages/ScanDesktopPage'

// Error Boundary to catch React runtime errors
class ErrorBoundary extends Component {
    constructor(props) { super(props); this.state = { hasError: false, error: null } }
    static getDerivedStateFromError(error) { return { hasError: true, error } }
    componentDidCatch(error, info) { console.error('ErrorBoundary caught:', error, info) }
    render() {
        if (this.state.hasError) {
            return (<div style={{ padding: 40, background: '#1e1e2e', color: '#ff6b6b', minHeight: '100vh', fontFamily: 'monospace' }}>
                <h1>Something went wrong</h1>
                <pre style={{ whiteSpace: 'pre-wrap', color: '#ffa07a' }}>{this.state.error?.message}</pre>
                <pre style={{ whiteSpace: 'pre-wrap', color: '#888', fontSize: 12 }}>{this.state.error?.stack}</pre>
                <button onClick={() => this.setState({ hasError: false, error: null })} style={{ marginTop: 20, padding: '10px 20px', background: '#4a4a6a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Try Again</button>
            </div>)
        }
        return this.props.children
    }
}

// Create Auth Context
export const AuthContext = createContext(null)
export const ThemeContext = createContext(null)

export const useAuth = () => useContext(AuthContext)
export const useTheme = () => useContext(ThemeContext)

// Protected Route Component
function ProtectedRoute({ children, allowedRoles }) {
    const { user } = useAuth()

    if (!user) {
        return <Navigate to="/login" replace />
    }

    if (user.mustChangePassword) {
        return <Navigate to="/login" replace />
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        if (user.role === 'admin' || user.role === 'organization_admin') return <Navigate to="/admin" replace />
        if (Array.isArray(user.permissions) && user.permissions.some(p => p.endsWith('.create'))) {
            return <Navigate to="/mentor" replace />
        }
        return <Navigate to="/student" replace />
    }

    return children
}

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

/** Normalize FastAPI `detail` (string or validation list) for UI / automation. */
function readApiError(data) {
    if (!data || typeof data !== 'object') return null
    if (typeof data.detail === 'string') return data.detail
    if (Array.isArray(data.detail)) {
        return data.detail
            .map((d) => (d && typeof d.msg === 'string' ? d.msg : JSON.stringify(d)))
            .join('; ')
    }
    return typeof data.error === 'string' ? data.error : null
}

function App() {
    const [user, setUser] = useState(null)
    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem('theme')
        if (saved) return saved
        // Auto-detect system preference
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    })
    const [loading, setLoading] = useState(true)
    const navigate = useNavigate()
    const authHeaders = (extra = {}) => {
        const h = { 'Content-Type': 'application/json', ...extra }
        if (user?.id) h['x-user-id'] = user.id
        if (user?.organizationId) h['x-org-id'] = user.organizationId
        return h
    }

    const getHomePath = (u) => {
        if (!u) return '/login'
        if (u.role === 'admin' || u.role === 'organization_admin') return '/admin'
        const perms = Array.isArray(u.permissions) ? u.permissions : []
        if (perms.includes('tests.create') || perms.includes('coding.create') || perms.includes('aptitude.create')) {
            return '/mentor'
        }
        return '/student'
    }

    useEffect(() => {
        // Check for saved user session and verify with backend
        const verifySession = async () => {
            try {
                const savedUser = localStorage.getItem('currentUser')
                if (savedUser && savedUser !== 'undefined') {
                    const parsedUser = JSON.parse(savedUser)

                    // Verify with backend
                    const response = await fetch(`${API_BASE}/auth/verify`, {
                        method: 'POST',
                        headers: authHeaders(),
                        body: JSON.stringify({ userId: parsedUser.id })
                    })

                    if (response.ok) {
                        const data = await response.json()
                        setUser(data.user)
                        localStorage.setItem('currentUser', JSON.stringify(data.user))
                    } else {
                        console.warn('Session invalid or expired')
                        localStorage.removeItem('currentUser')
                        setUser(null)
                    }
                }
            } catch (error) {
                console.error('Session verification failed:', error)
                localStorage.removeItem('currentUser')
                setUser(null)
            } finally {
                setLoading(false)
            }
        }

        verifySession()
    }, [])

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem('theme', theme)
    }, [theme])

    useEffect(() => {
        const uid = user?.id || ''
        const orgId = user?.organizationId || ''
        if (uid) {
            axios.defaults.headers.common['x-user-id'] = uid
        } else {
            delete axios.defaults.headers.common['x-user-id']
        }
        if (orgId) {
            axios.defaults.headers.common['x-org-id'] = orgId
        } else {
            delete axios.defaults.headers.common['x-org-id']
        }
    }, [user])

    const login = async (email, password) => {
        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ email, password })
            })

            const data = await response.json().catch(() => ({}))

            if (!response.ok) {
                const detail = readApiError(data) || 'Login failed'
                throw new Error(detail)
            }

            if (data.requiresOtp && data.challengeId) {
                return {
                    success: true,
                    requiresOtp: true,
                    challengeId: data.challengeId,
                    expiresIn: data.expiresIn,
                    emailMasked: data.emailMasked,
                }
            }

            if (!data.user || !data.user.id) {
                return { success: false, error: 'Unexpected response from server after login. Try again.' }
            }

            setUser(data.user)
            localStorage.setItem('currentUser', JSON.stringify(data.user))
            navigate(getHomePath(data.user))
            return { success: true }
        } catch (error) {
            return { success: false, error: error.message }
        }
    }

    const loginWithGoogle = async (credential) => {
        if (!credential) {
            return { success: false, error: 'Missing Google credential' }
        }
        try {
            const response = await fetch(`${API_BASE}/auth/google`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ credential }),
            })
            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                throw new Error(readApiError(data) || 'Google sign-in failed')
            }
            if (data.requiresOtp && data.challengeId) {
                return {
                    success: true,
                    requiresOtp: true,
                    challengeId: data.challengeId,
                    expiresIn: data.expiresIn,
                    emailMasked: data.emailMasked,
                }
            }

            if (!data.user || !data.user.id) {
                return { success: false, error: 'Unexpected response from server after Google sign-in. Try again.' }
            }

            setUser(data.user)
            localStorage.setItem('currentUser', JSON.stringify(data.user))
            navigate(getHomePath(data.user))
            return { success: true }
        } catch (error) {
            return { success: false, error: error.message }
        }
    }

    const verifyOtp = async (challengeId, otp) => {
        try {
            const response = await fetch(`${API_BASE}/auth/verify-otp`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ challengeId, otp }),
            })
            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                const msg = readApiError(data) || 'Verification failed'
                throw new Error(msg)
            }
            if (data.mustChangePassword && data.setupToken) {
                return {
                    success: true,
                    mustChangePassword: true,
                    setupToken: data.setupToken,
                    user: data.user,
                }
            }
            if (!data.user || !data.user.id) {
                return { success: false, error: 'Unexpected response after OTP verification. Try again.' }
            }
            setUser(data.user)
            localStorage.setItem('currentUser', JSON.stringify(data.user))
            navigate(getHomePath(data.user))
            return { success: true }
        } catch (error) {
            return { success: false, error: error.message }
        }
    }

    const completeFirstLogin = async (setupToken, newPassword) => {
        try {
            const response = await fetch(`${API_BASE}/auth/complete-first-login`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ setupToken, newPassword }),
            })
            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                const msg = readApiError(data) || 'Could not update password'
                throw new Error(msg)
            }
            if (!data.user || !data.user.id) {
                return { success: false, error: 'Unexpected response after password update. Try again.' }
            }
            setUser(data.user)
            localStorage.setItem('currentUser', JSON.stringify(data.user))
            navigate(getHomePath(data.user))
            return { success: true }
        } catch (error) {
            return { success: false, error: error.message }
        }
    }

    const logout = () => {
        setUser(null)
        localStorage.removeItem('currentUser')
        navigate('/login')
    }

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light')
    }

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                background: 'var(--bg-secondary)'
            }}>
                <div className="loading-spinner"></div>
            </div>
        )
    }

    return (
        <AuthContext.Provider value={{ user, login, loginWithGoogle, verifyOtp, completeFirstLogin, logout }}>
            <ThemeContext.Provider value={{ theme, toggleTheme }}>
                <ErrorBoundary>
                <Routes>
                    <Route path="/login" element={
                        user && !user.mustChangePassword ? <Navigate to={getHomePath(user)} replace /> : <Login />
                    } />

                    <Route path="/student/*" element={
                        <ProtectedRoute allowedRoles={['student']}>
                            <StudentPortal />
                        </ProtectedRoute>
                    } />

                    <Route path="/mentor/*" element={
                        <ProtectedRoute allowedRoles={['mentor', 'org_user']}>
                            <MentorPortal />
                        </ProtectedRoute>
                    } />

                    <Route path="/admin/*" element={
                        <ProtectedRoute allowedRoles={['admin', 'organization_admin']}>
                            <AdminPortal />
                        </ProtectedRoute>
                    } />

                    {/* Environment scan routes (public — token-based auth for mobile) */}
                    <Route path="/scan/mobile" element={<ScanMobilePage />} />
                    <Route path="/scan/desktop" element={
                        <ProtectedRoute allowedRoles={['student', 'mentor', 'admin']}>
                            <ScanDesktopPage />
                        </ProtectedRoute>
                    } />

                    <Route path="/" element={
                        user && !user.mustChangePassword ? <Navigate to={getHomePath(user)} replace /> : <Navigate to="/login" replace />
                    } />

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </ErrorBoundary>
            </ThemeContext.Provider>
        </AuthContext.Provider>
    )
}

export default App
