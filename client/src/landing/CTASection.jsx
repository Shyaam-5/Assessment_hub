import { useNavigate } from 'react-router-dom'
import { ArrowRight, Brain } from 'lucide-react'

export default function CTASection({ subscriptionId = '' }) {
    const navigate = useNavigate()
    const loginQuery = new URLSearchParams()
    loginQuery.set('plan', 'free_trial')
    if (subscriptionId) loginQuery.set('subscriptionId', subscriptionId)
    return (
        <section className="landing-section">
            <div className="cta-section">
                <div className="section-badge" style={{ margin: '0 auto 1.5rem' }}>
                    <Brain size={12} />
                    Get Started Today
                </div>
                <h2 className="section-title" style={{ marginBottom: '1rem' }}>
                    Ready to Transform Your <span className="gradient-text">Assessment Process?</span>
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', lineHeight: 1.7, maxWidth: 560, margin: '0 auto 2.5rem' }}>
                    Join 200+ institutions already using AI Assessment Hub to conduct smarter,
                    faster, and tamper-proof evaluations at scale.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <button
                        className="btn-hero-primary"
                        onClick={() => navigate(`/login?${loginQuery.toString()}`)}
                        style={{ fontSize: '1rem', padding: '0.9rem 2.25rem' }}
                    >
                        Start Free Trial
                        <ArrowRight size={18} />
                    </button>
                    <button
                        className="btn-hero-secondary"
                        onClick={() => document.getElementById('pricing-section')?.scrollIntoView({ behavior: 'smooth' })}
                    >
                        View Pricing
                    </button>
                </div>
            </div>
        </section>
    )
}
