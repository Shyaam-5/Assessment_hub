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
            <div className="section-header">
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
            <div className="about-highlight-row">
                {[
                    { num: '14+', label: 'Assessment Modules', sub: 'Coding, SQL, MCQ, AI Interview, Communication, and more' },
                    { num: '3', label: 'AI Agents', sub: 'Proctor, Behavior Analyzer, and Analytics Intelligence' },
                    { num: '40+', label: 'Languages Supported', sub: 'Multi-language coding execution via Judge0' },
                ].map((item) => (
                    <div key={item.label} className="about-stat-cell">
                        <div className="about-stat-num">{item.num}</div>
                        <div className="about-stat-label">{item.label}</div>
                        <div className="about-stat-sub">{item.sub}</div>
                    </div>
                ))}
            </div>

            {/* Pillars grid */}
            <div className="about-pillars-grid">
                {pillars.map((p) => (
                    <div key={p.title} className="glass-card">
                        <div className="card-icon-wrapper" style={{ background: p.color + '1a', color: p.color }}>
                            {p.icon}
                        </div>
                        <h3 className="glass-card-title">{p.title}</h3>
                        <p className="glass-card-desc">{p.desc}</p>
                    </div>
                ))}
            </div>

            {/* Who is it for */}
            <div className="about-built-for">
                <p className="about-built-for-label">Built for</p>
                <div className="about-built-for-tags">
                    {['Colleges & Universities', 'Placement Training Institutes', 'Recruitment Agencies', 'Corporate HR Teams', 'EdTech Platforms', 'Bootcamps'].map(label => (
                        <span key={label} className="about-tag">{label}</span>
                    ))}
                </div>
            </div>
        </section>
    )
}
