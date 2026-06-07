const testimonials = [
    {
        initials: 'JM',
        name: 'Dr. J. Madhusudanan',
        title: 'Professor & Head, Department of Artificial Intelligence and Data Science - Sri Manakula Vinayagar Engineering College',
        text: 'We replaced our entire manual assessment pipeline with AI Assessment Hub. The AI proctoring alone saved our team 200+ hours per semester. The behavior analysis reports are impressively accurate.',
    },
    {
        initials: 'KB',
        name: 'Karthik Balaraman',
        title: 'Founder & CEO - Ocean Academy',
        text: 'We use the platform for our campus hiring process. The coding sandbox + AI interview combination gives us a 360-degree view of candidates that no other tool could provide. Exceptional accuracy.',
    },
    {
        initials: 'RB',
        name: 'Rajasekar B',
        title: 'Edusphere Software Training and Development Institute',
        text: 'Our communication and aptitude test pass rates improved 40% after students started using the AI-generated feedback from assessments. The analytics dashboard is genuinely best-in-class.',
    },
]

export default function TestimonialsSection() {
    return (
        <section className="landing-section full-bleed">
            <div className="landing-container">
                <div className="section-header">
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

