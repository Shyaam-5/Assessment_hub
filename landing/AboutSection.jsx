import { Brain, Shield, BarChart3, Cpu, Users, MessageSquare, Code2, TrendingUp } from 'lucide-react'

const pillars = [
    {
        icon: <Brain size={22} />,
        color: '#3b82f6',
        title: 'AI-Powered Evaluation',
        desc: 'Groq-powered AI analyzes code quality, communication fluency, aptitude depth, and behavioral patterns with human-level accuracy.',
    },
    {
        icon: <Shield size={22} />,
        color: '#8b5cf6',
        title: 'Real-Time Proctoring',
        desc: 'Multimodal AI proctoring using computer vision and behavioral analysis ensures 100% exam integrity without human intervention.',
    },
    {
        icon: <Code2 size={22} />,
        color: '#06b6d4',
        title: 'Coding & SQL Sandbox',
        desc: 'Judge0-powered multi-language execution engine with 40+ languages, real-time output, and AI-assisted feedback loops.',
    },
    {
        icon: <MessageSquare size={22} />,
        color: '#10b981',
        title: 'Communication Assessment',
        desc: 'Four-module AI evaluation covering pronunciation, fluency, grammar, listening comprehension, and presentation skills.',
    },
    {
        icon: <BarChart3 size={22} />,
        color: '#f59e0b',
        title: 'Advanced Analytics',
        desc: 'Institution-wide dashboards with topic-level insights, peer comparisons, percentile rankings, and exportable reports.',
    },
    {
        icon: <Cpu size={22} />,
        color: '#ec4899',
        title: 'Automated Hiring Workflows',
        desc: 'From skill test to AI interview to final score — the entire hiring pipeline runs autonomously, saving 80% recruiter time.',
    },
]

export default function AboutSection() {
    return (
        <section className="landing-section" id="about-section">
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
                <div className="section-badge">
                    <Brain size={12} />
                    About the Platform
                </div>
                <h2 className="section-title">
                    The Complete <span className="gradient-text">Assessment OS</span>
                    <br />for Modern Institutions
                </h2>
                <p className="section-subtitle" style={{ margin: '0 auto' }}>
                    AI Assessment Hub is not just a testing platform — it is a full-stack talent evaluation
                    ecosystem built for colleges, placement centers, and corporate hiring teams that demand
                    speed, accuracy, and intelligence at scale.
                </p>
            </div>

            {/* 3-col highlight row */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1px',
                background: 'var(--border-color)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                marginBottom: '3rem',
                border: '1px solid var(--border-color)',
            }}>
                {[
                    { num: '14+', label: 'Assessment Modules', sub: 'Coding, SQL, MCQ, AI Interview, Communication, and more' },
                    { num: '3', label: 'AI Agents', sub: 'Proctor, Behavior Analyzer, and Analytics Intelligence' },
                    { num: '40+', label: 'Languages Supported', sub: 'Multi-language coding execution via Judge0' },
                ].map((item) => (
                    <div key={item.label} style={{
                        background: 'var(--bg-card)',
                        padding: '2rem 1.5rem',
                        textAlign: 'center',
                    }}>
                        <div style={{
                            fontSize: '2.5rem',
                            fontWeight: 900,
                            background: 'linear-gradient(135deg, #60a5fa, #a855f7)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            marginBottom: '0.35rem',
                            lineHeight: 1.1
                        }}>{item.num}</div>
                        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.95rem', marginBottom: '0.3rem' }}>{item.label}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.sub}</div>
                    </div>
                ))}
            </div>

            {/* Pillars grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '1.25rem',
            }}>
                {pillars.map((p) => (
                    <div key={p.title} className="glass-card">
                        <div className="card-icon-wrapper" style={{
                            background: p.color + '1a',
                            color: p.color,
                        }}>
                            {p.icon}
                        </div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text)' }}>
                            {p.title}
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.65 }}>
                            {p.desc}
                        </p>
                    </div>
                ))}
            </div>

            {/* Who is it for */}
            <div style={{ marginTop: '3.5rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1.25rem' }}>
                    Built for
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.75rem' }}>
                    {['Colleges & Universities', 'Placement Training Institutes', 'Recruitment Agencies', 'Corporate HR Teams', 'EdTech Platforms', 'Bootcamps'].map(label => (
                        <span key={label} style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-secondary)',
                            padding: '0.45rem 1rem',
                            borderRadius: '2rem',
                            fontSize: '0.83rem',
                            fontWeight: 500,
                        }}>{label}</span>
                    ))}
                </div>
            </div>
        </section>
    )
}
