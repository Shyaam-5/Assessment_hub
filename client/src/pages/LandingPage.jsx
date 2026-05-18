import { useEffect, useState } from 'react'
import HeroSection from '../landing/HeroSection'
import AboutSection from '../landing/AboutSection'
import FeaturesSection from '../landing/FeaturesSection'
import HowItWorksSection from '../landing/HowItWorksSection'
import TestimonialsSection from '../landing/TestimonialsSection'
import PricingSection from '../landing/PricingSection'
import CTASection from '../landing/CTASection'
import '../landing/landing.css'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

export default function LandingPage() {
    const [subscriptionId, setSubscriptionId] = useState((import.meta.env.VITE_SUBSCRIPTION_ID || '').trim())

    useEffect(() => {
        let active = true
        const loadPublicConfig = async () => {
            try {
                const res = await fetch(`${API_BASE}/public/config`)
                if (!res.ok) return
                const data = await res.json().catch(() => ({}))
                const id = typeof data?.subscriptionId === 'string' ? data.subscriptionId.trim() : ''
                if (active && id) setSubscriptionId(id)
            } catch {
                // Keep env fallback when API is unavailable.
            }
        }
        loadPublicConfig()
        return () => { active = false }
    }, [])

    return (
        <div>
            <HeroSection />
            <AboutSection />
            <FeaturesSection />
            <HowItWorksSection />
            <TestimonialsSection />
            <PricingSection subscriptionId={subscriptionId} />
            <CTASection subscriptionId={subscriptionId} />
        </div>
    )
}
