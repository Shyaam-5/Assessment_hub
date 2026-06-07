import React, { useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    ArrowRight,
    Award,
    BarChart3,
    Brain,
    Building2,
    CheckCircle,
    ChevronDown,
    Code2,
    Globe,
    Lock,
    MonitorCheck,
    PieChart,
    Shield,
    Sparkles,
    Users,
    Video,
    Zap,
} from 'lucide-react'

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
            particles = Array.from({ length: Math.max(38, Math.floor((canvas.width * canvas.height) / 18000)) }, () => ({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.25,
                vy: (Math.random() - 0.5) * 0.25,
                r: Math.random() * 1.6 + 0.5,
                pulse: Math.random() * Math.PI * 2,
            }))
        }

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            particles.forEach((p, i) => {
                p.x += p.vx
                p.y += p.vy
                p.pulse += 0.014
                if (p.x < 0 || p.x > canvas.width) p.vx *= -1
                if (p.y < 0 || p.y > canvas.height) p.vy *= -1
                particles.forEach((q, j) => {
                    if (i >= j) return
                    const distance = Math.hypot(q.x - p.x, q.y - p.y)
                    if (distance < 130) {
                        ctx.strokeStyle = `rgba(99,102,241,${(1 - distance / 130) * 0.2})`
                        ctx.lineWidth = 0.7
                        ctx.beginPath()
                        ctx.moveTo(p.x, p.y)
                        ctx.lineTo(q.x, q.y)
                        ctx.stroke()
                    }
                })
                const alpha = Math.sin(p.pulse) * 0.32 + 0.68
                ctx.beginPath()
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
                ctx.fillStyle = `rgba(34,211,238,${alpha * 0.75})`
                ctx.fill()
            })
            animId = requestAnimationFrame(draw)
        }

        const ro = new ResizeObserver(resize)
        ro.observe(canvas)
        resize()
        draw()
        return () => {
            cancelAnimationFrame(animId)
            ro.disconnect()
        }
    }, [])

    const trustItems = [
        { icon: Shield, text: 'SOC 2 Ready' },
        { icon: CheckCircle, text: 'GDPR Compliant' },
        { icon: Zap, text: 'AI-Powered' },
        { icon: Globe, text: 'Multi-Language' },
    ]

    const stats = [
        { icon: Building2, value: '500+', label: 'Institutions' },
        { icon: Users, value: '1M+', label: 'Assessments Conducted' },
        { icon: Award, value: '5M+', label: 'Candidates Evaluated' },
        { icon: MonitorCheck, value: '98.7%', label: 'Customer Satisfaction' },
    ]

    return (
        <section className="hero-wrapper landing-page">
            <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />
            <div className="hero-bg" aria-hidden="true">
                <div className="hero-bg-gradient" />
                <div className="hero-grid-lines" />
            </div>

            <nav className="landing-nav">
                <button className="landing-nav-logo" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    <span className="landing-nav-logo-icon"><Brain size={24} /></span>
                    <span>AI Assessment <strong>Hub</strong></span>
                </button>
                <div className="landing-nav-links" aria-label="Landing navigation">
                    <button className="landing-nav-link" onClick={() => document.getElementById('features-section')?.scrollIntoView({ behavior: 'smooth' })}>Features</button>
                    <button className="landing-nav-link" onClick={() => document.getElementById('about-section')?.scrollIntoView({ behavior: 'smooth' })}>For Institutions</button>
                    <button className="landing-nav-link" onClick={() => document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' })}>Pricing</button>
                </div>
                <button className="btn-primary-landing" onClick={() => navigate('/login')}>
                    Login to Platform <ArrowRight size={17} />
                </button>
            </nav>

            <div className="hero-content">
                <div className="hero-copy">
                    <div className="hero-eyebrow">
                        <Brain size={15} />
                        Next-Generation AI Assessment Platform
                    </div>
                    <h1 className="hero-heading">
                        Assess Smarter.
                        <span className="line-2">Hire Faster. Grow Better.</span>
                    </h1>
                    <p className="hero-description">
                        AI Assessment Hub transforms how institutions evaluate talent - from AI-proctored exams and behavior analysis
                        to automated coding sandboxes and real-time analytics. All in one platform.
                    </p>
                    <div className="hero-cta-group">
                        <button className="btn-hero-primary" onClick={() => document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' })}>
                            Start Free Trial <ArrowRight size={19} />
                        </button>
                        <button className="btn-hero-secondary" onClick={() => navigate('/login')}>Login to Platform</button>
                        <button className="btn-hero-ghost" onClick={() => document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' })}>
                            View Pricing <ArrowRight size={15} />
                        </button>
                    </div>
                    <div className="hero-trust-bar">
                        {trustItems.map((item, index) => {
                            const Icon = item.icon
                            return (
                                <React.Fragment key={item.text}>
                                    {index > 0 && <div className="hero-trust-divider" aria-hidden="true" />}
                                    <div className="hero-trust-item">
                                        <Icon size={16} />
                                        <span>{item.text}</span>
                                    </div>
                                </React.Fragment>
                            )
                        })}
                    </div>
                </div>

                <div className="hero-visual" aria-label="AI Assessment Hub analytics preview">
                    <div className="hero-orbit orbit-a" />
                    <div className="hero-orbit orbit-b" />
                    <div className="floating-card float-proctor">
                        <Video size={22} />
                        <span><strong>AI Proctoring</strong>Ensures exam integrity</span>
                    </div>
                    <div className="floating-card float-analytics">
                        <BarChart3 size={24} />
                        <span><strong>Real-time Analytics</strong>Actionable insights</span>
                    </div>
                    <div className="floating-card float-behavior">
                        <Brain size={25} />
                        <span><strong>Behavior Analysis</strong>Smarter insights</span>
                    </div>
                    <div className="floating-card float-secure">
                        <Lock size={22} />
                        <span><strong>Secure & Reliable</strong>Your data is protected</span>
                    </div>
                    <div className="floating-card float-code">
                        <Code2 size={24} />
                        <span><strong>Coding Sandbox</strong>Run. Test. Evaluate.</span>
                    </div>

                    <div className="dashboard-device">
                        <div className="dashboard-screen">
                            <div className="dashboard-top">
                                <span><Brain size={16} /> AI Assessment Hub</span>
                                <span>University of Tech</span>
                            </div>
                            <div className="dashboard-body">
                                <aside className="dashboard-sidebar">
                                    {['Dashboard', 'Assessments', 'Candidates', 'Proctoring', 'Analytics', 'Settings'].map((item, index) => (
                                        <span className={index === 0 ? 'active' : ''} key={item}>{item}</span>
                                    ))}
                                </aside>
                                <main className="dashboard-main">
                                    <h3>Overview</h3>
                                    <div className="metric-grid">
                                        {[
                                            ['Total Assessments', '2,543', '+ 11.2%'],
                                            ['Candidates Evaluated', '18,736', '+ 36.4%'],
                                            ['Completion Rate', '92.4%', '+ 5.6%'],
                                            ['Avg. Score', '78.6%', '+ 9.2%'],
                                        ].map(([label, value, change]) => (
                                            <div className="metric-card" key={label}>
                                                <span>{label}</span>
                                                <strong>{value}</strong>
                                                <em>{change}</em>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="analytics-grid">
                                        <div className="chart-card">
                                            <div className="chart-head"><span>Assessment Activity</span><small>This Month</small></div>
                                            <svg viewBox="0 0 260 84" role="img" aria-label="Assessment activity line chart">
                                                <polyline points="0,70 18,52 36,66 54,41 72,35 90,62 108,47 126,57 144,29 162,65 180,42 198,50 216,31 234,26 252,10" />
                                            </svg>
                                        </div>
                                        <div className="skills-card">
                                            <PieChart size={72} />
                                            <div>
                                                <span>Python <b>42%</b></span>
                                                <span>SQL <b>28%</b></span>
                                                <span>Data Structures <b>18%</b></span>
                                                <span>Others <b>12%</b></span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="recent-list">
                                        {['Backend Developer Hiring', 'Data Science Internship', 'Aptitude Test'].map((item, index) => (
                                            <span key={item}>
                                                <Sparkles size={13} />
                                                {item}
                                                <strong>{index === 1 ? 'In Progress' : 'Completed'}</strong>
                                            </span>
                                        ))}
                                    </div>
                                </main>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="hero-stats-strip" role="list" aria-label="Platform statistics">
                    <p>Trusted by Institutions Worldwide</p>
                    {stats.map((stat) => {
                        const Icon = stat.icon
                        return (
                            <div key={stat.label} className="hero-stat-item" role="listitem">
                                <span className="hero-stat-icon"><Icon size={26} /></span>
                                <span>
                                    <strong className="hero-stat-value">{stat.value}</strong>
                                    <em className="hero-stat-label">{stat.label}</em>
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}
