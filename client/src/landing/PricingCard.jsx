import { Check, X, ArrowRight } from 'lucide-react'

export default function PricingCard({ plan, yearly, onCta }) {
    const displayPrice = yearly ? plan.priceYearly : plan.price
    const isFloat = plan.id === 'free_trial'

    const formatPrice = (n) => {
        if (n === 0) return '0'
        if (n >= 100000) return `${(n / 100000).toFixed(1)}L`
        if (n >= 1000) return `${Math.floor(n / 1000)},${String(n % 1000).padStart(3, '0')}`
        return String(n)
    }

    return (
        <div className={`pricing-card ${plan.featured ? 'featured' : ''}`}>
            <div className="pricing-card-glow-top" aria-hidden="true" />

            {plan.badge && (
                <div className="plan-badge" role="note">{plan.badge}</div>
            )}

            <h3 className="pricing-plan-name">{plan.name}</h3>
            <p className="pricing-plan-desc">{plan.desc}</p>

            <div className="pricing-amount">
                {displayPrice > 0 && <span className="pricing-currency">₹</span>}
                <span className={`pricing-number ${isFloat ? 'free' : ''}`}>
                    {isFloat ? 'Free' : formatPrice(displayPrice)}
                </span>
            </div>
            <div className="pricing-period">
                {isFloat ? plan.period : (yearly ? 'per year' : plan.period)}
            </div>

            <ul className="pricing-features-list" role="list">
                {plan.features.map((f) => (
                    <li
                        key={f.text}
                        className={`pricing-feature-item ${f.yes ? '' : 'disabled'}`}
                        role="listitem"
                    >
                        <span className={`pricing-feature-check ${f.yes ? 'yes' : 'no'}`} aria-hidden="true">
                            {f.yes ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
                        </span>
                        <span>{f.text}</span>
                    </li>
                ))}
            </ul>

            <button
                className={`pricing-cta-btn ${plan.ctaStyle}`}
                onClick={onCta}
                aria-label={`${plan.cta} — ${plan.name} plan`}
            >
                {plan.cta}
                <ArrowRight size={16} />
            </button>
        </div>
    )
}
