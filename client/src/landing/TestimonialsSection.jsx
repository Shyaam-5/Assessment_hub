const testimonials = [
    {
        initials: 'RK',
        name: 'Rajesh Kumar',
        title: 'Director of Placement — Tier 1 Engineering College',
        text: 'We replaced our entire manual assessment pipeline with AI Assessment Hub. The AI proctoring alone saved our team 200+ hours per semester. The behavior analysis reports are impressively accurate.',
    },
    {
        initials: 'PM',
        name: 'Priya Mehta',
        title: 'Head of L&D — Fortune 500 IT Company',
        text: 'We use the platform for our campus hiring process. The coding sandbox + AI interview combination gives us a 360-degree view of candidates that no other tool could provide. Exceptional accuracy.',
    },
    {
        initials: 'AS',
        name: 'Anand Sharma',
        title: 'CEO — EdTech Training Institute',
        text: 'Our communication and aptitude test pass rates improved 40% after students started using the AI-generated feedback from assessments. The analytics dashboard is genuinely best-in-class.',
    },
]

export default function TestimonialsSection() {
    return (
        <section className="landing-section" style={{ background: 'transparent', maxWidth: '100%', padding: '6rem 0' }}>
            <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 2rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
                    <div className="section-badge">Client Stories</div>
                    <h2 className="section-title">
                        Trusted by <span className="gradient-text">Leading Institutions</span>
                    </h2>
                </div>

                <div className="testimonials-grid">
                    {testimonials.map((t) => (
                        <div key={t.name} className="testimonial-card">
                            <div className="testimonial-quote" aria-hidden="true">"</div>
                            <p className="testimonial-text">{t.text}</p>
                            <div className="testimonial-author">
                                <div className="testimonial-avatar" aria-hidden="true">{t.initials}</div>
                                <div>
                                    <div className="testimonial-author-name">{t.name}</div>
                                    <div className="testimonial-author-title">{t.title}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
