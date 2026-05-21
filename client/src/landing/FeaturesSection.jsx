import { Brain, Shield, BarChart3, Code2, MessageSquare, Eye, Activity, Globe, Database, FileText, Cpu, Zap } from 'lucide-react'

const features = [
    { icon: <Brain size={20} />, color: '#3b82f6', title: 'AI Skill Assessments', desc: 'MCQ, coding, and SQL tests auto-evaluated by AI with detailed scoring rubrics.' },
    { icon: <FileText size={20} />, color: '#8b5cf6', title: 'Aptitude Tests', desc: 'Quantitative, logical reasoning, and verbal ability tests with time-bound environments.' },
    { icon: <Globe size={20} />, color: '#06b6d4', title: 'Global Assessments', desc: 'Full-length comprehensive exams combining multiple question types in one session.' },
    { icon: <MessageSquare size={20} />, color: '#10b981', title: 'Communication Testing', desc: 'AI-evaluated speaking, listening, grammar, and presentation modules.' },
    { icon: <Cpu size={20} />, color: '#f59e0b', title: 'AI Interview Engine', desc: 'Conversational AI interviews with role-specific questions and instant scoring.' },
    { icon: <Eye size={20} />, color: '#ec4899', title: 'AI Proctoring', desc: 'Computer vision based exam monitoring — face detection, tab switch, suspicious activity alerts.' },
    { icon: <Activity size={20} />, color: '#ef4444', title: 'Behavior Analysis', desc: 'Behavioral pattern profiling and trust scoring across the full exam session.' },
    { icon: <Shield size={20} />, color: '#6366f1', title: 'Real-Time Monitoring', desc: 'Live dashboards for admins — track active exams, violations, and submission feeds.' },
    { icon: <Database size={20} />, color: '#14b8a6', title: 'SQL & Coding Sandbox', desc: '40+ language execution via Judge0 with real-time output and AI feedback.' },
    { icon: <BarChart3 size={20} />, color: '#f97316', title: 'AI Reports', desc: 'Automated performance reports with topic-wise analysis and improvement suggestions.' },
    { icon: <Brain size={20} />, color: '#a855f7', title: 'Analytics Dashboard', desc: 'Institution-wide insights, peer comparisons, percentile rankings, and data exports.' },
    { icon: <Globe size={20} />, color: '#0ea5e9', title: 'Multi-Language Support', desc: 'Platform UI available in multiple languages for diverse learner demographics.' },
]

export default function FeaturesSection() {
    return (
        <section className="landing-section full-bleed" id="features-section">
            <div className="landing-container">
                <div className="section-header">
                    <div className="section-badge">
                        <Zap size={12} />
                        Platform Features
                    </div>
                    <h2 className="section-title">
                        Everything You Need to <span className="gradient-text">Assess at Scale</span>
                    </h2>
                    <p className="section-subtitle" style={{ margin: '0 auto' }}>
                        From environment verification to AI-generated reports — every module is built
                        for accuracy, speed, and enterprise reliability.
                    </p>
                </div>

                <div className="features-grid">
                    {features.map((f) => (
                        <div key={f.title} className="feature-card">
                            <div className="feature-card-glow" aria-hidden="true" />
                            <div className="card-icon-wrapper" style={{ background: f.color + '18', color: f.color }}>
                                {f.icon}
                            </div>
                            <h3 className="feature-card-title">{f.title}</h3>
                            <p className="feature-card-desc">{f.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
