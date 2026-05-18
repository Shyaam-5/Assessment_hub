import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../App'
import {
    Mail, Lock, ArrowRight, Brain, X,
    Sparkles, Database, Network, Cpu, BarChart3, Code2,
    KeyRound,
} from 'lucide-react'
import './Login.css'

const GOOGLE_CLIENT_CONFIGURED = Boolean((import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim())

// Neural Network Background Component
function NeuralBackground() {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        let animationId
        let neurons = []

        const resize = () => {
            canvas.width = window.innerWidth
            canvas.height = window.innerHeight
            initNeurons()
        }

        const initNeurons = () => {
            neurons = []
            const count = Math.floor((canvas.width * canvas.height) / 18000)

            for (let i = 0; i < count; i++) {
                neurons.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    vx: (Math.random() - 0.5) * 0.4,
                    vy: (Math.random() - 0.5) * 0.4,
                    radius: Math.random() * 2 + 1,
                    pulsePhase: Math.random() * Math.PI * 2
                })
            }
        }

        const animate = () => {
            const isLight = document.documentElement.getAttribute('data-theme') === 'light'
            ctx.fillStyle = isLight ? 'rgba(248, 250, 252, 0.08)' : 'rgba(8, 12, 24, 0.08)'
            ctx.fillRect(0, 0, canvas.width, canvas.height)

            neurons.forEach((neuron, i) => {
                neuron.x += neuron.vx
                neuron.y += neuron.vy
                neuron.pulsePhase += 0.015

                if (neuron.x < 0 || neuron.x > canvas.width) neuron.vx *= -1
                if (neuron.y < 0 || neuron.y > canvas.height) neuron.vy *= -1

                neurons.forEach((other, j) => {
                    if (i >= j) return
                    const dx = other.x - neuron.x
                    const dy = other.y - neuron.y
                    const dist = Math.sqrt(dx * dx + dy * dy)

                    if (dist < 120) {
                        const alpha = (1 - dist / 120) * 0.25
                        ctx.beginPath()
                        ctx.strokeStyle = isLight ? `rgba(59, 130, 246, ${alpha * 1.5})` : `rgba(59, 130, 246, ${alpha})`
                        ctx.lineWidth = 0.5
                        ctx.moveTo(neuron.x, neuron.y)
                        ctx.lineTo(other.x, other.y)
                        ctx.stroke()
                    }
                })

                const pulse = Math.sin(neuron.pulsePhase) * 0.3 + 0.7
                const gradient = ctx.createRadialGradient(
                    neuron.x, neuron.y, 0,
                    neuron.x, neuron.y, neuron.radius * 3
                )
                gradient.addColorStop(0, `rgba(59, 130, 246, ${pulse})`)
                gradient.addColorStop(0.5, `rgba(59, 130, 246, ${pulse * 0.3})`)
                gradient.addColorStop(1, 'rgba(59, 130, 246, 0)')

                ctx.beginPath()
                ctx.fillStyle = gradient
                ctx.arc(neuron.x, neuron.y, neuron.radius * 3, 0, Math.PI * 2)
                ctx.fill()

                ctx.beginPath()
                ctx.fillStyle = isLight ? `rgba(37, 99, 235, ${pulse})` : `rgba(147, 197, 253, ${pulse})`
                ctx.arc(neuron.x, neuron.y, neuron.radius, 0, Math.PI * 2)
                ctx.fill()
            })

            animationId = requestAnimationFrame(animate)
        }

        resize()
        const isCurrentLight = document.documentElement.getAttribute('data-theme') === 'light'
        ctx.fillStyle = isCurrentLight ? '#f8fafc' : '#080c18'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        animate()

        window.addEventListener('resize', resize)
        return () => {
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(animationId)
        }
    }, [])

    return <canvas ref={canvasRef} className="neural-canvas" />
}

// AI Illustration Component
function AIIllustration() {
    return (
        <div className="ai-illustration">
            <div className="illustration-container">
                {/* Central Brain */}
                <div className="central-brain">
                    <Brain size={80} />
                    <div className="brain-pulse"></div>
                    <div className="brain-pulse delay-1"></div>
                    <div className="brain-pulse delay-2"></div>
                </div>

                {/* Floating Icons */}
                <div className="floating-icon icon-1">
                    <Database size={28} />
                </div>
                <div className="floating-icon icon-2">
                    <BarChart3 size={28} />
                </div>
                <div className="floating-icon icon-3">
                    <Code2 size={28} />
                </div>
                <div className="floating-icon icon-4">
                    <Cpu size={28} />
                </div>
                <div className="floating-icon icon-5">
                    <Network size={28} />
                </div>
                <div className="floating-icon icon-6">
                    <Sparkles size={28} />
                </div>

                {/* Connection Lines */}
                <svg className="connection-lines" viewBox="0 0 400 400">
                    <defs>
                        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
                            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.1" />
                        </linearGradient>
                    </defs>
                    <circle cx="200" cy="200" r="80" fill="none" stroke="url(#lineGradient)" strokeWidth="1" strokeDasharray="5,5" className="rotating-circle" />
                    <circle cx="200" cy="200" r="130" fill="none" stroke="url(#lineGradient)" strokeWidth="0.5" strokeDasharray="3,3" className="rotating-circle reverse" />
                    <circle cx="200" cy="200" r="170" fill="none" stroke="url(#lineGradient)" strokeWidth="0.5" strokeDasharray="2,4" className="rotating-circle" />
                </svg>
            </div>

            <h3 className="illustration-title">
                <Sparkles size={20} />
                AI-Powered Proctoring
            </h3>
            <p className="illustration-desc">
                Secure assessments with intelligent monitoring and real-time evaluation
            </p>
        </div>
    )
}

function Login() {
    const [searchParams] = useSearchParams()
    const [step, setStep] = useState('credentials')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [otp, setOtp] = useState('')
    const [challengeId, setChallengeId] = useState('')
    const [emailMasked, setEmailMasked] = useState('')
    const [setupToken, setSetupToken] = useState('')
    const [pendingName, setPendingName] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [showLoginPanel, setShowLoginPanel] = useState(false)
    const { login, loginWithGoogle, verifyOtp, completeFirstLogin } = useAuth()
    const selectedPlan = (searchParams.get('plan') || '').trim()
    const selectedSubscriptionId = (searchParams.get('subscriptionId') || '').trim()

    const FIRST_PW_MIN = 8

    const resetFlow = () => {
        setStep('credentials')
        setOtp('')
        setChallengeId('')
        setEmailMasked('')
        setSetupToken('')
        setPendingName('')
        setNewPassword('')
        setConfirmPassword('')
        setError('')
    }

    const closePanel = () => {
        setShowLoginPanel(false)
        resetFlow()
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        const result = await login(email, password)

        if (!result.success) {
            setError(result.error)
            setLoading(false)
            return
        }
        if (result.requiresOtp && result.challengeId) {
            setChallengeId(result.challengeId)
            setEmailMasked(result.emailMasked || '')
            setStep('otp')
        }
        setLoading(false)
    }

    const handleOtpSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        const result = await verifyOtp(challengeId, otp.trim())
        if (!result.success) {
            setError(result.error)
            setLoading(false)
            return
        }
        if (result.mustChangePassword && result.setupToken) {
            setSetupToken(result.setupToken)
            setPendingName(result.user?.name || '')
            setStep('firstPassword')
            setOtp('')
            setLoading(false)
            return
        }
        setLoading(false)
    }

    const handleFirstPasswordSubmit = async (e) => {
        e.preventDefault()
        setError('')
        if (newPassword.length < FIRST_PW_MIN) {
            setError(`Password must be at least ${FIRST_PW_MIN} characters`)
            return
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match')
            return
        }
        setLoading(true)
        const result = await completeFirstLogin(setupToken, newPassword)
        if (!result.success) {
            setError(result.error)
        }
        setLoading(false)
    }

    return (
        <div className="login-page">
            <NeuralBackground />

            {/* Navigation */}
            <nav className="login-nav">
                <div className="nav-logo">
                    <Brain className="logo-icon-svg" size={28} />
                    <span className="logo-text">Assessment Hub</span>
                </div>
                <button className="nav-login-btn" onClick={() => setShowLoginPanel(true)}>
                    Login <ArrowRight size={16} />
                </button>
            </nav>

            {/* Main Content */}
            <div className="login-content">
                {/* Left - Hero Section */}
                <div className="hero-section">
                    <div className="hero-badge">
                        <Brain size={16} />
                        <span>AI-Powered Assessment & Proctoring Platform</span>
                    </div>
                    <h1 className="hero-title">
                        Secure
                        Assessments
                    </h1>
                    <p className="hero-subtitle">
                        AI-proctored coding tests, aptitude assessments, and skill evaluations
                        with real-time monitoring, intelligent cheating detection, and
                        comprehensive analytics.
                    </p>
                    <button className="cta-button" onClick={() => setShowLoginPanel(true)}>
                        Get Started <ArrowRight size={18} />
                    </button>
                </div>

                {/* Right - Dynamic Content (Illustration or Login Card) */}
                <div className="dynamic-container">
                    {!showLoginPanel ? (
                        <AIIllustration />
                    ) : (
                        <div className="login-card-inline animate-slideIn">
                            <button type="button" className="panel-back" onClick={() => (step === 'credentials' ? closePanel() : resetFlow())}>
                                <X size={20} />
                            </button>

                            {step === 'credentials' && (
                                <>
                                    <div className="card-header">
                                        <div className="header-icon">
                                            <Brain size={32} />
                                        </div>
                                        <h2>Welcome Back</h2>
                                        <p>Sign in to access your assessment portal</p>
                                        {selectedPlan && (
                                            <p className="google-hint" style={{ marginTop: '0.35rem' }}>
                                                Selected plan: <strong>{selectedPlan}</strong>
                                                {selectedSubscriptionId ? ` | Subscription ID: ${selectedSubscriptionId}` : ''}
                                            </p>
                                        )}
                                    </div>

                                    <form onSubmit={handleSubmit} className="login-form">
                                        <div className="form-group">
                                            <label htmlFor="email">Email Address</label>
                                            <div className="input-field">
                                                <Mail className="field-icon" size={18} />
                                                <input
                                                    type="email"
                                                    id="email"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    placeholder="Enter your email"
                                                    required
                                                    autoComplete="username"
                                                />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label htmlFor="password">Password</label>
                                            <div className="input-field">
                                                <Lock className="field-icon" size={18} />
                                                <input
                                                    type="password"
                                                    id="password"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    placeholder="Enter your password"
                                                    required
                                                    autoComplete="current-password"
                                                />
                                            </div>
                                        </div>

                                        {error && <div className="error-message">{error}</div>}

                                        <button type="submit" className="submit-btn" disabled={loading}>
                                            {loading ? (
                                                <>
                                                    <div className="btn-spinner"></div>
                                                    Signing in...
                                                </>
                                            ) : (
                                                <>
                                                    Continue
                                                    <ArrowRight size={18} />
                                                </>
                                            )}
                                        </button>

                                        {GOOGLE_CLIENT_CONFIGURED && (
                                            <>
                                                <div className="login-divider" aria-hidden="true">
                                                    <span>or</span>
                                                </div>
                                                <div className="google-signin-wrap">
                                                    <GoogleLogin
                                                        onSuccess={async (cred) => {
                                                            setError('')
                                                            setLoading(true)
                                                            const res = await loginWithGoogle(cred.credential)
                                                            if (!res.success) {
                                                                setError(res.error || 'Google sign-in failed')
                                                                setLoading(false)
                                                                return
                                                            }
                                                            if (res.requiresOtp && res.challengeId) {
                                                                setChallengeId(res.challengeId)
                                                                setEmailMasked(res.emailMasked || '')
                                                                setStep('otp')
                                                            }
                                                            setLoading(false)
                                                        }}
                                                        onError={() => {
                                                            setError('Google sign-in was cancelled or failed')
                                                        }}
                                                        useOneTap={false}
                                                        use_fedcm_for_prompt={false}
                                                        use_fedcm_for_button={false}
                                                        theme="filled_black"
                                                        size="large"
                                                        width="320"
                                                        text="continue_with"
                                                        shape="pill"
                                                    />
                                                </div>
                                                <p className="google-hint">
                                                    Google sign-in only works if an administrator has already created your account with the same email.
                                                </p>
                                            </>
                                        )}
                                    </form>
                                </>
                            )}

                            {step === 'otp' && (
                                <>
                                    <div className="card-header">
                                        <div className="header-icon">
                                            <KeyRound size={32} />
                                        </div>
                                        <h2>Verification code</h2>
                                        <p>
                                            Enter the code sent to {emailMasked || 'your email'}.
                                            Check your inbox (and spam folder).
                                        </p>
                                    </div>
                                    <form onSubmit={handleOtpSubmit} className="login-form">
                                        <div className="form-group">
                                            <label htmlFor="otp">One-time code</label>
                                            <div className="input-field">
                                                <KeyRound className="field-icon" size={18} />
                                                <input
                                                    type="text"
                                                    id="otp"
                                                    inputMode="numeric"
                                                    autoComplete="one-time-code"
                                                    value={otp}
                                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 12))}
                                                    placeholder="6-digit code"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        {error && <div className="error-message">{error}</div>}
                                        <button type="submit" className="submit-btn" disabled={loading}>
                                            {loading ? (
                                                <>
                                                    <div className="btn-spinner"></div>
                                                    Verifying...
                                                </>
                                            ) : (
                                                <>
                                                    Verify & sign in
                                                    <ArrowRight size={18} />
                                                </>
                                            )}
                                        </button>
                                        <p className="google-hint" style={{ marginTop: '1rem' }}>
                                            If email did not arrive, confirm SMTP settings on the server or check the API log for the code in development.
                                        </p>
                                    </form>
                                </>
                            )}

                            {step === 'firstPassword' && (
                                <>
                                    <div className="card-header">
                                        <div className="header-icon">
                                            <Lock size={32} />
                                        </div>
                                        <h2>Set your password</h2>
                                        <p>
                                            {pendingName ? `Hi ${pendingName}, ` : ''}
                                            Replace your temporary password with one only you know (min. {FIRST_PW_MIN} characters).
                                        </p>
                                    </div>
                                    <form onSubmit={handleFirstPasswordSubmit} className="login-form">
                                        <div className="form-group">
                                            <label htmlFor="newPassword">New password</label>
                                            <div className="input-field">
                                                <Lock className="field-icon" size={18} />
                                                <input
                                                    type="password"
                                                    id="newPassword"
                                                    value={newPassword}
                                                    onChange={(e) => setNewPassword(e.target.value)}
                                                    placeholder={`At least ${FIRST_PW_MIN} characters`}
                                                    required
                                                    autoComplete="new-password"
                                                    minLength={FIRST_PW_MIN}
                                                />
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="confirmPassword">Confirm password</label>
                                            <div className="input-field">
                                                <Lock className="field-icon" size={18} />
                                                <input
                                                    type="password"
                                                    id="confirmPassword"
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    placeholder="Repeat new password"
                                                    required
                                                    autoComplete="new-password"
                                                />
                                            </div>
                                        </div>
                                        {error && <div className="error-message">{error}</div>}
                                        <button type="submit" className="submit-btn" disabled={loading}>
                                            {loading ? (
                                                <>
                                                    <div className="btn-spinner"></div>
                                                    Saving...
                                                </>
                                            ) : (
                                                <>
                                                    Save and continue
                                                    <ArrowRight size={18} />
                                                </>
                                            )}
                                        </button>
                                    </form>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default Login
