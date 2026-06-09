import { useEffect, useRef, useState } from 'react'
import { Brain, Monitor, ArrowRight, Laptop, Smartphone } from 'lucide-react'

function isMobileDevice() {
    const ua = navigator.userAgent || navigator.vendor || window.opera
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i.test(ua)
        || window.innerWidth < 768
}

function ParticleCanvas() {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        let animId
        let particles = []

        const resize = () => {
            canvas.width = window.innerWidth
            canvas.height = window.innerHeight
            const count = Math.max(30, Math.floor((canvas.width * canvas.height) / 22000))
            particles = Array.from({ length: count }, () => ({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                r: Math.random() * 1.8 + 0.4,
                pulse: Math.random() * Math.PI * 2,
            }))
        }

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            particles.forEach((p, i) => {
                p.x += p.vx
                p.y += p.vy
                p.pulse += 0.013
                if (p.x < 0 || p.x > canvas.width) p.vx *= -1
                if (p.y < 0 || p.y > canvas.height) p.vy *= -1

                particles.forEach((q, j) => {
                    if (i >= j) return
                    const d = Math.hypot(q.x - p.x, q.y - p.y)
                    if (d < 120) {
                        ctx.strokeStyle = `rgba(99,102,241,${(1 - d / 120) * 0.18})`
                        ctx.lineWidth = 0.6
                        ctx.beginPath()
                        ctx.moveTo(p.x, p.y)
                        ctx.lineTo(q.x, q.y)
                        ctx.stroke()
                    }
                })

                const alpha = Math.sin(p.pulse) * 0.3 + 0.7
                ctx.beginPath()
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
                ctx.fillStyle = `rgba(96,165,250,${alpha * 0.7})`
                ctx.fill()
            })
            animId = requestAnimationFrame(draw)
        }

        window.addEventListener('resize', resize)
        resize()
        draw()
        return () => {
            cancelAnimationFrame(animId)
            window.removeEventListener('resize', resize)
        }
    }, [])

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}
        />
    )
}

export default function MobileBlock({ children }) {
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const check = () => setIsMobile(isMobileDevice())
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    if (!isMobile) return children

    return (
        <div style={{
            position: 'relative',
            minHeight: '100vh',
            overflow: 'hidden',
            background: '#0f172a',
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* Radial glow accents */}
            <div aria-hidden="true" style={{
                position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
                background: `
                    radial-gradient(ellipse at 15% 10%, rgba(37,99,235,0.18) 0%, transparent 45%),
                    radial-gradient(ellipse at 85% 85%, rgba(139,92,246,0.14) 0%, transparent 45%)
                `,
            }} />

            <ParticleCanvas />

            {/* Nav bar */}
            <nav style={{
                position: 'relative', zIndex: 10,
                padding: '1.25rem 1.5rem',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: '1px solid rgba(59,130,246,0.1)',
                background: 'rgba(15,23,42,0.7)',
                backdropFilter: 'blur(14px)',
            }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.3px',
                    background: 'linear-gradient(135deg, #60a5fa, #a855f7)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                    <span style={{
                        width: 32, height: 32, borderRadius: 9,
                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <Brain size={18} color="#fff" />
                    </span>
                    AI Assessment Hub
                </div>
            </nav>

            {/* Main content */}
            <div style={{
                position: 'relative', zIndex: 10,
                flex: 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '2.5rem 1.5rem',
                textAlign: 'center',
                gap: 0,
            }}>
                {/* Icon cluster */}
                <div style={{
                    position: 'relative',
                    width: 96, height: 96,
                    marginBottom: '2rem',
                }}>
                    {/* Glow ring */}
                    <div style={{
                        position: 'absolute', inset: -8,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)',
                    }} />
                    {/* Outer ring */}
                    <div style={{
                        position: 'absolute', inset: 0,
                        borderRadius: '50%',
                        border: '1px solid rgba(59,130,246,0.3)',
                        animation: 'mb-pulse-ring 3s ease-in-out infinite',
                    }} />
                    {/* Icon circle */}
                    <div style={{
                        position: 'absolute', inset: 8,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #1e3a8a 0%, #1e293b 100%)',
                        border: '1px solid rgba(59,130,246,0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 32px rgba(59,130,246,0.2)',
                    }}>
                        <Monitor size={34} color="#60a5fa" strokeWidth={1.5} />
                    </div>
                    {/* Small phone badge */}
                    <div style={{
                        position: 'absolute', bottom: 0, right: 0,
                        width: 28, height: 28, borderRadius: '50%',
                        background: '#1e293b',
                        border: '2px solid #0f172a',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Smartphone size={14} color="#ef4444" strokeWidth={2} />
                    </div>
                </div>

                {/* Heading */}
                <h1 style={{
                    margin: '0 0 0.75rem',
                    fontSize: 'clamp(1.6rem, 6vw, 2.25rem)',
                    fontWeight: 800,
                    lineHeight: 1.2,
                    letterSpacing: '-0.5px',
                    background: 'linear-gradient(135deg, #f8fafc 0%, #94a3b8 100%)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                    Desktop Required
                </h1>

                {/* Divider accent */}
                <div style={{
                    width: 48, height: 3, borderRadius: 2,
                    background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                    margin: '0 auto 1.25rem',
                }} />

                {/* Body text */}
                <p style={{
                    margin: '0 0 0.5rem',
                    fontSize: '1rem',
                    lineHeight: 1.7,
                    color: '#94a3b8',
                    maxWidth: 300,
                }}>
                    This page is only accessible on a
                    <span style={{ color: '#60a5fa', fontWeight: 600 }}> desktop or laptop</span>.
                </p>
                <p style={{
                    margin: '0 0 2.25rem',
                    fontSize: '0.875rem',
                    color: '#64748b',
                    maxWidth: 280,
                }}>
                    Please switch to a larger device to access the platform.
                </p>

                {/* Device hints */}
                <div style={{
                    display: 'flex', gap: '0.75rem',
                    marginBottom: '2rem',
                    flexWrap: 'wrap', justifyContent: 'center',
                }}>
                    {[
                        { icon: Monitor, label: 'Desktop PC' },
                        { icon: Laptop, label: 'Laptop' },
                    ].map(({ icon: Icon, label }) => (
                        <div key={label} style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            padding: '0.45rem 0.9rem',
                            borderRadius: 20,
                            background: 'rgba(59,130,246,0.08)',
                            border: '1px solid rgba(59,130,246,0.2)',
                            color: '#93c5fd',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                        }}>
                            <Icon size={14} strokeWidth={2} />
                            {label}
                        </div>
                    ))}
                </div>

                {/* CTA button */}
                <a
                    href="/"
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.8rem 2rem',
                        borderRadius: 12,
                        background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                        color: '#fff',
                        textDecoration: 'none',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        letterSpacing: '0.01em',
                        boxShadow: '0 4px 24px rgba(59,130,246,0.35)',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 8px 32px rgba(59,130,246,0.45)'
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.transform = ''
                        e.currentTarget.style.boxShadow = '0 4px 24px rgba(59,130,246,0.35)'
                    }}
                >
                    Back to Home
                    <ArrowRight size={16} strokeWidth={2.5} />
                </a>
            </div>

            {/* Footer note */}
            <div style={{
                position: 'relative', zIndex: 10,
                textAlign: 'center',
                padding: '1rem 1.5rem',
                color: '#475569',
                fontSize: '0.75rem',
                borderTop: '1px solid rgba(255,255,255,0.04)',
            }}>
                AI Assessment Hub &mdash; Built for professional environments
            </div>

            <style>{`
                @keyframes mb-pulse-ring {
                    0%, 100% { opacity: 0.4; transform: scale(1); }
                    50% { opacity: 0.9; transform: scale(1.06); }
                }
            `}</style>
        </div>
    )
}
