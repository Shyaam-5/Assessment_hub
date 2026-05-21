import { Building2, Settings, Users, Shield, BarChart3 } from 'lucide-react'

const steps = [
    {
        num: '01',
        icon: <Building2 size={20} />,
        color: '#3b82f6',
        title: 'Institution Registers',
        desc: 'Sign up, choose your plan, and get instant access to the admin dashboard with zero setup delay.',
    },
    {
        num: '02',
        icon: <Settings size={20} />,
        color: '#8b5cf6',
        title: 'Setup Assessments',
        desc: 'Create coding challenges, aptitude tests, skill evaluations, or communication assessments with AI-generated questions.',
    },
    {
        num: '03',
        icon: <Users size={20} />,
        color: '#06b6d4',
        title: 'Assign Students',
        desc: 'Upload student lists, assign tests with deadlines, and configure access permissions in minutes.',
    },
    {
        num: '04',
        icon: <Shield size={20} />,
        color: '#10b981',
        title: 'AI-Proctored Exams',
        desc: 'Students take exams in a fully monitored environment with real-time violation detection and alerts.',
    },
    {
        num: '05',
        icon: <BarChart3 size={20} />,
        color: '#f59e0b',
        title: 'Receive AI Reports',
        desc: 'Instant detailed reports with topic-wise scores, behavioral insights, and downloadable analytics.',
    },
]

export default function HowItWorksSection() {
    return (
        <section className="landing-section" id="how-it-works">
            <div className="section-header">
                <div className="section-badge">How It Works</div>
                <h2 className="section-title">
                    From Sign-Up to <span className="gradient-text">AI Reports</span> in Minutes
                </h2>
                <p className="section-subtitle" style={{ margin: '0 auto' }}>
                    A streamlined five-step workflow that gets your institution up and running without any technical overhead.
                </p>
            </div>

            <div className="steps-container">
                {/* Connector line — decorative */}
                <div className="steps-connector" aria-hidden="true" />

                {steps.map((step, i) => (
                    <div key={step.num} className="step-card" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="step-number" style={{ background: `linear-gradient(135deg, ${step.color}, ${step.color}bb)` }}>
                            {step.num}
                        </div>
                        <div className="card-icon-wrapper" style={{ background: step.color + '18', color: step.color, marginBottom: '1rem' }}>
                            {step.icon}
                        </div>
                        <h3 className="step-title">{step.title}</h3>
                        <p className="step-desc">{step.desc}</p>
                    </div>
                ))}
            </div>
        </section>
    )
}
