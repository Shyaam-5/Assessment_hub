import { useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, CheckCircle, ArrowRight, Zap, Shield, BarChart3, Users, Globe, Award } from 'lucide-react'

export default function HeroSection() {
    const canvasRef = useRef(null)
    const navigate = useNavigate()

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        let animId
        let particles = []

        const resize = () => {
            canvas.width = canvas.offsetWidth
            canvas.height = canvas.offsetHeight
            init()
        }

        const init = () => {
            particles = []
            const count = Math.floor((canvas.width * canvas.height) / 14000)
            for (let i = 0; i < count; i++) {
                particles.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    vx: (Math.random() - 0.5) * 0.35,
                    vy: (Math.random() - 0.5) * 0.35,
                    r: Math.random() * 1.5 + 0.5,
                    pulse: Math.random() * Math.PI * 2
                })
            }
        }

        const draw = () => {
            const isLight = document.documentElement.getAttribute('data-theme') === 'light'
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            particles.forEach((p, i) => {
                p.x += p.vx; p.y += p.vy; p.pulse += 0.012
                if (p.x < 0 || p.x > canvas.width) p.vx *= -1
                if (p.y < 0 || p.y > canvas.height) p.vy *= -1
                particles.forEach((q, j) => {
                    if (i >= j) return
                    const dx = q.x - p.x, dy = q.y - p.y
                    const d = Math.sqrt(dx * dx + dy * dy)
                    if (d < 100) {
                        const a = (1 - d / 100) * 0.2
                        ctx.strokeStyle = `rgba(59,130,246,${a})`
                        ctx.lineWidth = 0.6
                        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke()
                    }
                })
                const alpha = Math.sin(p.pulse) * 0.3 + 0.7
                ctx.beginPath()
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
                ctx.fillStyle = isLight ? `rgba(37,99,235,${alpha * 0.7})` : `rgba(147,197,253,${alpha * 0.8})`
                ctx.fill()
            })
            animId = requestAnimationFrame(draw)
        }

        const ro = new ResizeObserver(resize)
        ro.observe(canvas)
        resize()
        draw()
        return () => { cancelAnimationFrame(animId); ro.disconnect() }
    }, [])

    const stats = [
        { value: '50K+', label: 'Assessments Conducted' },
        { value: '200+', label: 'Institutions Served' },
        { value: '98%', label: 'Accuracy Rate' },
        { value: '4.9/5', label: 'Client Satisfaction' },
    ]

    const trustItems = [
        { icon: <Shield size={14} />, text: 'SOC 2 Ready' },
        { icon: <CheckCircle size={14} />, text: 'GDPR Compliant' },
        { icon: <Zap size={14} />, text: 'AI-Powered' },
        { icon: <Globe size={14} />, text: 'Multi-Language' },
    ]

    return (
        <section className="hero-wrapper">
            {/* Animated canvas background */}
            <canvas
                ref={canvasRef}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0, opacity: 0.6 }}
                aria-hidden="true"
            />

            {/* Background gradients */}
            <div className="hero-bg" aria-hidden="true">
                <div className="hero-bg-gradient" />
                <div className="hero-grid-lines" />
            </div>

            {/* Main content */}
            <div className="hero-content">
                <div className="hero-eyebrow">
                    <Brain size={13} />
                    Next-Generation AI Assessment Platform
                </div>

                <h1 className="hero-heading">
                    Assess Smarter.
                    <span className="line-2">Hire Faster. Grow Better.</span>
                </h1>

                <p className="hero-description">
                    AI Assessment Hub transforms how institutions evaluate talent — from AI-proctored exams
                    and behavior analysis to automated coding sandboxes and real-time analytics. All in one platform.
                </p>

                <div className="hero-cta-group">
                    <button
                        className="btn-hero-primary"
                        onClick={() => document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' })}
                        aria-label="Start free trial"
                    >
                        Start Free Trial
                        <ArrowRight size={18} />
                    </button>
                    <button
                        className="btn-hero-secondary"
                        onClick={() => navigate('/login')}
                        aria-label="Login to platform"
                    >
                        Login to Platform
                    </button>
                    <button
                        className="btn-hero-ghost"
                        onClick={() => document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' })}
                        aria-label="View pricing"
                    >
                        View Pricing
                    </button>
                </div>

                {/* Trust indicators */}
                <div className="hero-trust-bar">
                    {trustItems.map((item, i) => (
                        <>
                            {i > 0 && <div key={`div-${i}`} className="hero-trust-divider" aria-hidden="true" />}
                            <div key={item.text} className="hero-trust-item">
                                {item.icon}
                                <span>{item.text}</span>
                            </div>
                        </>
                    ))}
                </div>

                {/* Stats strip */}
                <div className="hero-stats-strip" role="list" aria-label="Platform statistics">
                    {stats.map((s) => (
                        <div key={s.label} className="hero-stat-item" role="listitem">
                            <div className="hero-stat-value">{s.value}</div>
                            <div className="hero-stat-label">{s.label}</div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
