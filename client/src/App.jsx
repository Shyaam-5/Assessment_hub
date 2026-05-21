import { useState, useEffect, createContext, useContext, Component } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import axios from 'axios'
import Login from './pages/Login'
import LandingPage from './pages/LandingPage'
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
            return (
                <div style={{
                    padding: '2.5rem',
                    background: 'var(--bg-primary)',
                    color: 'var(--danger)',
                    minHeight: '100vh',
                    fontFamily: 'monospace',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    maxWidth: 800,
                    margin: '0 auto',
                }}>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-main)' }}>Something went wrong</h1>
                    <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--danger)', fontSize: '0.9rem', background: 'var(--bg-card)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        {this.state.error?.message}
                    </pre>
                    <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--text-muted)', fontSize: '0.75rem', background: 'var(--bg-card)', padding: '1rem', borderRadius: 8, border: '1px solid var(--border-color)', overflow: 'auto', maxHeight: 300 }}>
                        {this.state.error?.stack}
                    </pre>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        style={{ alignSelf: 'flex-start', padding: '0.6rem 1.25rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
                    >
                        Try Again
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}

// Create Auth Context
export const AuthContext = createContext(null)
export const ThemeContext = createContext(null)

export const useAuth = () => useContext(AuthContext)
export const useTheme = () => useContext(ThemeContext)

const STAFF_WORKSPACE_PERMISSIONS = [
    '.create',
    '.assign',
    '.evaluate',
    '.manage',
    'analytics.view',
    'proctoring.view',
    'submissions.view',
    'users.view',
]

const EXAM_TAKER_PERMISSIONS = [
    '.attempt',
    'tests.view_allocated',
    'results.view_own',
]

const userPermissions = (u) => (Array.isArray(u?.permissions) ? u.permissions : [])

const hasStaffWorkspaceAccess = (u) => {
    const perms = userPermissions(u)
    return perms.some((perm) => STAFF_WORKSPACE_PERMISSIONS.some((key) => (
        key.startsWith('.') ? perm.endsWith(key) : perm === key
    )))
}

const hasExamTakerAccess = (u) => {
    const perms = userPermissions(u)
    return u?.role === 'student'
        || u?.role === 'learner'
        || perms.some((perm) => EXAM_TAKER_PERMISSIONS.some((key) => (
            key.startsWith('.') ? perm.endsWith(key) : perm === key
        )))
}

// Protected Route Component
function ProtectedRoute({ children, allowedRoles, requireStaffWorkspace = false, requireExamWorkspace = false }) {
    const { user } = useAuth()

    if (!user) {
        return <Navigate to="/login" replace />
    }

    if (user.mustChangePassword) {
        return <Navigate to="/login" replace />
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        if (user.role === 'admin' || user.role === 'organization_admin') return <Navigate to="/admin" replace />
        if (hasStaffWorkspaceAccess(user)) {
            return <Navigate to="/role" replace />
        }
        return <Navigate to="/student" replace />
    }

    if (requireStaffWorkspace && !hasStaffWorkspaceAccess(user)) {
        return <Navigate to={hasExamTakerAccess(user) ? '/student' : '/login'} replace />
    }

    if (requireExamWorkspace && !hasExamTakerAccess(user)) {
        return <Navigate to={hasStaffWorkspaceAccess(user) ? '/role' : '/login'} replace />
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
    const getToken = () => localStorage.getItem('authToken') || ''
    const authHeaders = (extra = {}) => {
        const h = { 'Content-Type': 'application/json', ...extra }
        const token = getToken()
        if (token) h.Authorization = `Bearer ${token}`
        if (user?.id) h['x-user-id'] = user.id
        if (user?.organizationId) h['x-org-id'] = user.organizationId
        return h
    }

    const getHomePath = (u) => {
        if (!u) return '/'
        if (u.role === 'admin' || u.role === 'organization_admin') return '/admin'
        if (hasStaffWorkspaceAccess(u)) return '/role'
        if (hasExamTakerAccess(u)) return '/student'
        return '/student'
    }

    useEffect(() => {
        // Check for saved user session and verify with backend
        const verifySession = async () => {
            try {
                const savedUser = localStorage.getItem('currentUser')
                if (savedUser && savedUser !== 'undefined') {
                    const token = getToken()
                    if (!token) {
                        localStorage.removeItem('currentUser')
                        setUser(null)
                        setLoading(false)
                        return
                    }
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
                        if (data.accessToken) localStorage.setItem('authToken', data.accessToken)
                    } else {
                        console.warn('Session invalid or expired')
                        localStorage.removeItem('currentUser')
                        localStorage.removeItem('authToken')
                        setUser(null)
                    }
                }
            } catch (error) {
                console.error('Session verification failed:', error)
                localStorage.removeItem('currentUser')
                localStorage.removeItem('authToken')
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
        const token = getToken()
        if (token) axios.defaults.headers.common.Authorization = `Bearer ${token}`
        else delete axios.defaults.headers.common.Authorization
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
            if (data.accessToken) localStorage.setItem('authToken', data.accessToken)
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
            if (data.accessToken) localStorage.setItem('authToken', data.accessToken)
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
            if (data.accessToken) localStorage.setItem('authToken', data.accessToken)
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
            if (data.accessToken) localStorage.setItem('authToken', data.accessToken)
            navigate(getHomePath(data.user))
            return { success: true }
        } catch (error) {
            return { success: false, error: error.message }
        }
    }

    const logout = () => {
        setUser(null)
        localStorage.removeItem('currentUser')
        localStorage.removeItem('authToken')
        navigate('/login')
    }

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light')
    }

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                gap: '1rem',
                background: 'var(--bg-primary)',
            }}>
                <div className="loading-spinner" />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 500 }}>
                    Loading…
                </span>
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
                    <Route path="/landing" element={<Navigate to="/" replace />} />

                    <Route path="/student/*" element={
                        <ProtectedRoute allowedRoles={['student', 'org_user', 'learner']} requireExamWorkspace>
                            <StudentPortal />
                        </ProtectedRoute>
                    } />

                    <Route path="/mentor/*" element={
                        <ProtectedRoute allowedRoles={['mentor']}>
                            <MentorPortal />
                        </ProtectedRoute>
                    } />

                    <Route path="/admin/*" element={
                        <ProtectedRoute allowedRoles={['admin', 'organization_admin']}>
                            <AdminPortal />
                        </ProtectedRoute>
                    } />

                    <Route path="/role/*" element={
                        <ProtectedRoute allowedRoles={['org_user']} requireStaffWorkspace>
                            <AdminPortal />
                        </ProtectedRoute>
                    } />

                    {/* Environment scan routes (public — token-based auth for mobile) */}
                    <Route path="/scan/mobile" element={<ScanMobilePage />} />
                    <Route path="/scan/desktop" element={
                        <ProtectedRoute allowedRoles={['student', 'learner', 'org_user', 'mentor', 'admin', 'organization_admin']}>
                            <ScanDesktopPage />
                        </ProtectedRoute>
                    } />

                    <Route path="/" element={
                        user && !user.mustChangePassword ? <Navigate to={getHomePath(user)} replace /> : <LandingPage />
                    } />

                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </ErrorBoundary>
            </ThemeContext.Provider>
        </AuthContext.Provider>
    )
}

export default App
