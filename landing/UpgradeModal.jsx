import { useNavigate } from 'react-router-dom'
import { X, ArrowRight, Lock, CheckCircle } from 'lucide-react'

/**
 * UpgradeModal — shown when a user clicks a locked/premium feature.
 * Props:
 *   open: bool
 *   onClose: fn
 *   featureName: string  — the feature they tried to access
 *   requiredPlan: string  — "basic" | "pro"
 *   currentPlan: string
 */
export default function UpgradeModal({ open, onClose, featureName, requiredPlan = 'pro', currentPlan = 'free_trial' }) {
    const navigate = useNavigate()
    if (!open) return null

    const planMeta = {
        free_trial: { label: 'Free Trial', color: '#10b981' },
        basic: { label: 'Basic', color: '#3b82f6' },
        pro: { label: 'Pro', color: '#8b5cf6' },
    }

    const target = planMeta[requiredPlan] || planMeta.pro

    const includedIn = {
        basic: ['AI Proctoring', 'Coding Assessments', 'SQL Assessments', 'Analytics Dashboard', 'Live Monitoring'],
        pro: ['Behavior Analysis Agent', 'AI Interview Engine', 'Advanced Reporting', 'All AI Agents', 'Priority Support'],
    }

    const highlights = includedIn[requiredPlan] || includedIn.pro

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '1rem',
            }}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Upgrade required"
        >
            <div
                style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-xl)',
                    padding: '2rem',
                    maxWidth: 440,
                    width: '100%',
                    position: 'relative',
                    boxShadow: 'var(--modal-shadow)',
                    animation: 'slideUp 0.2s ease',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Close */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: '1rem', right: '1rem',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', padding: '0.25rem',
                        borderRadius: '6px', display: 'flex',
                    }}
                    aria-label="Close dialog"
                >
                    <X size={18} />
                </button>

                {/* Lock icon */}
                <div style={{
                    width: 56, height: 56,
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
                    border: '1px solid rgba(59,130,246,0.25)',
                    borderRadius: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '1.25rem',
                    color: target.color,
                }}>
                    <Lock size={24} />
                </div>

                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text)' }}>
                    Upgrade to {target.label}
                </h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                    <strong style={{ color: 'var(--text)' }}>{featureName}</strong> is available on the{' '}
                    <span style={{ color: target.color, fontWeight: 700 }}>{target.label}</span> plan and above.
                </p>

                {/* What's included */}
                <div style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                }}>
                    <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '0.75rem' }}>
                        {target.label} plan includes
                    </p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {highlights.map(h => (
                            <li key={h} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                <CheckCircle size={14} color="var(--success)" />
                                {h}
                            </li>
                        ))}
                    </ul>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={() => { onClose(); navigate('/#pricing-section') }}
                        style={{
                            flex: 1, padding: '0.75rem',
                            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                            border: 'none', borderRadius: 10, color: 'white',
                            fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                        }}
                    >
                        View Pricing <ArrowRight size={15} />
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '0.75rem 1.25rem',
                            background: 'none', border: '1px solid var(--border-color)',
                            borderRadius: 10, color: 'var(--text-muted)',
                            fontWeight: 500, fontSize: '0.9rem', cursor: 'pointer',
                        }}
                    >
                        Later
                    </button>
                </div>
            </div>
        </div>
    )
}
