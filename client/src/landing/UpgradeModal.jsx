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
            className="upgrade-modal-overlay"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Upgrade required"
        >
            <div className="upgrade-modal-card" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="upgrade-modal-close" aria-label="Close dialog">
                    <X size={18} />
                </button>

                <div className="upgrade-modal-icon" style={{ color: target.color }}>
                    <Lock size={24} />
                </div>

                <h2 className="upgrade-modal-title">Upgrade to {target.label}</h2>
                <p className="upgrade-modal-desc">
                    <strong style={{ color: 'var(--text)' }}>{featureName}</strong> is available on the{' '}
                    <span style={{ color: target.color, fontWeight: 700 }}>{target.label}</span> plan and above.
                </p>

                <div className="upgrade-modal-includes">
                    <p className="upgrade-modal-includes-title">{target.label} plan includes</p>
                    <ul className="upgrade-modal-features">
                        {highlights.map(h => (
                            <li key={h} className="upgrade-modal-feature-item">
                                <CheckCircle size={14} color="var(--success)" />
                                {h}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="upgrade-modal-actions">
                    <button onClick={() => { onClose(); navigate('/#pricing-section') }} className="upgrade-modal-btn-primary">
                        View Pricing <ArrowRight size={15} />
                    </button>
                    <button onClick={onClose} className="upgrade-modal-btn-ghost">
                        Later
                    </button>
                </div>
            </div>
        </div>
    )
}
