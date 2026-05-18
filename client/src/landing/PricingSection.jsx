import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PricingCard from './PricingCard'
import { DollarSign } from 'lucide-react'

const FREE_FEATURES = [
    { text: 'Up to 25 students', yes: true },
    { text: 'Up to 3 assessments', yes: true },
    { text: 'Communication assessment', yes: true },
    { text: 'Basic aptitude tests', yes: true },
    { text: '7-day trial', yes: true },
    { text: 'Coding & SQL assessments', yes: false },
    { text: 'AI proctoring', yes: false },
    { text: 'Analytics dashboard', yes: false },
    { text: 'AI agents', yes: false },
    { text: 'Live monitoring', yes: false },
]

const BASIC_FEATURES = [
    { text: 'Up to 500 students', yes: true },
    { text: 'Unlimited assessments', yes: true },
    { text: 'Communication & aptitude tests', yes: true },
    { text: 'Coding & SQL assessments', yes: true },
    { text: 'AI-generated questions', yes: true },
    { text: 'Analytics dashboard', yes: true },
    { text: 'Real-time monitoring', yes: true },
    { text: 'AI Proctoring Agent', yes: true },
    { text: 'Behavior Analysis Agent', yes: false },
    { text: 'AI interview engine', yes: false },
]

const PRO_FEATURES = [
    { text: 'Unlimited students', yes: true },
    { text: 'All assessment types', yes: true },
    { text: 'All AI agents (Proctor + Behavior + Analytics)', yes: true },
    { text: 'AI interview engine', yes: true },
    { text: 'Advanced analytics & exports', yes: true },
    { text: 'Institution-wide monitoring', yes: true },
    { text: 'Full proctoring suite', yes: true },
    { text: 'Global assessments', yes: true },
    { text: 'Priority support', yes: true },
    { text: 'Dedicated onboarding', yes: true },
]

export default function PricingSection({ standalone = false, subscriptionId = '' }) {
    const [yearly, setYearly] = useState(false)
    const navigate = useNavigate()

    const plans = [
        {
            id: 'free_trial',
            subscriptionId: '',
            name: 'Free Trial',
            desc: 'Explore the platform with no commitment.',
            price: 0,
            priceYearly: 0,
            period: '7-day trial',
            features: FREE_FEATURES,
            cta: 'Start Free Trial',
            ctaStyle: 'outline',
            badge: null,
            featured: false,
        },
        {
            id: 'basic',
            subscriptionId,
            name: 'Basic',
            desc: 'For growing institutions and training centers.',
            price: 4999,
            priceYearly: 49999,
            period: 'per month',
            features: BASIC_FEATURES,
            cta: 'Upgrade to Basic',
            ctaStyle: 'outline',
            badge: null,
            featured: false,
        },
        {
            id: 'pro',
            subscriptionId,
            name: 'Pro',
            desc: 'Enterprise-grade complete assessment platform.',
            price: 12999,
            priceYearly: 129999,
            period: 'per month',
            features: PRO_FEATURES,
            cta: 'Get Pro Access',
            ctaStyle: 'primary',
            badge: 'Most Popular',
            featured: true,
        },
    ]

    return (
        <section
            className="landing-section"
            id="pricing-section"
            style={{ background: 'transparent', maxWidth: standalone ? '100%' : undefined, padding: standalone ? '2rem 2rem 6rem' : undefined }}
        >
            <div style={{ maxWidth: 1280, margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    {!standalone && (<>
                        <div className="section-badge">
                            <DollarSign size={12} />
                            Pricing
                        </div>
                        <h2 className="section-title">
                            Simple, Transparent <span className="gradient-text">Pricing</span>
                        </h2>
                        <p className="section-subtitle" style={{ margin: '0 auto 2rem' }}>
                            Choose the plan that fits your institution. Upgrade anytime. No hidden fees.
                        </p>
                    </>)}

                    {/* Billing Toggle */}
                    <div className="billing-toggle">
                        <span className={`toggle-label ${!yearly ? 'active' : ''}`}>Monthly</span>
                        <button
                            className={`toggle-track ${yearly ? 'active' : ''}`}
                            onClick={() => setYearly(v => !v)}
                            aria-label="Toggle billing cycle"
                            role="switch"
                            aria-checked={yearly}
                        >
                            <div className="toggle-thumb" />
                        </button>
                        <span className={`toggle-label ${yearly ? 'active' : ''}`}>Yearly</span>
                        {yearly && <span className="toggle-save-badge">Save 17%</span>}
                    </div>
                </div>

                <div className="pricing-grid">
                    {plans.map((plan) => (
                        <PricingCard
                            key={plan.id}
                            plan={plan}
                            yearly={yearly}
                            onCta={() => {
                                const params = new URLSearchParams()
                                params.set('plan', plan.id)
                                if (plan.subscriptionId) params.set('subscriptionId', plan.subscriptionId)
                                navigate(`/login?${params.toString()}`)
                            }}
                        />
                    ))}
                </div>

                {/* Fine print */}
                <p style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    All prices in INR. Annual plans billed upfront. Cancel anytime. Contact us for custom enterprise quotes.
                </p>
            </div>
        </section>
    )
}
