import { Check, X, Minus } from 'lucide-react'

const ROWS = [
    { feature: 'Students Allowed', free: '25', basic: '500', pro: 'Unlimited' },
    { feature: 'Assessments', free: '3', basic: 'Unlimited', pro: 'Unlimited' },
    { feature: 'Communication Tests', free: true, basic: true, pro: true },
    { feature: 'Aptitude Tests', free: true, basic: true, pro: true },
    { feature: 'Coding Assessments', free: false, basic: true, pro: true },
    { feature: 'SQL Assessments', free: false, basic: true, pro: true },
    { feature: 'Skill Tests', free: false, basic: true, pro: true },
    { feature: 'AI-Generated Questions', free: false, basic: true, pro: true },
    { feature: 'Analytics Dashboard', free: false, basic: true, pro: true },
    { feature: 'Live Monitoring', free: false, basic: true, pro: true },
    { feature: 'AI Proctoring Agent', free: false, basic: true, pro: true },
    { feature: 'Behavior Analysis Agent', free: false, basic: false, pro: true },
    { feature: 'AI Analytics Agent', free: false, basic: false, pro: true },
    { feature: 'AI Interview Engine', free: false, basic: false, pro: true },
    { feature: 'Global Assessments', free: false, basic: true, pro: true },
    { feature: 'Advanced Reporting', free: false, basic: false, pro: true },
    { feature: 'Priority Support', free: false, basic: false, pro: true },
]

function Cell({ val }) {
    if (typeof val === 'boolean') {
        return val
            ? <Check size={16} color="var(--success)" strokeWidth={3} />
            : <X size={16} color="var(--danger)" strokeWidth={3} />
    }
    return <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>{val}</span>
}

export default function FeatureComparisonTable() {
    return (
        <div style={{ overflowX: 'auto' }}>
            <table className="comparison-table" aria-label="Feature comparison across plans">
                <thead>
                    <tr>
                        <th>Feature</th>
                        <th>Free Trial</th>
                        <th className="highlight-col">Basic</th>
                        <th style={{ background: 'rgba(59,130,246,0.08)', color: 'var(--primary)' }}>Pro</th>
                    </tr>
                </thead>
                <tbody>
                    {ROWS.map((row) => (
                        <tr key={row.feature}>
                            <td>{row.feature}</td>
                            <td><Cell val={row.free} /></td>
                            <td className="highlight-col"><Cell val={row.basic} /></td>
                            <td style={{ background: 'rgba(59,130,246,0.04)' }}><Cell val={row.pro} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
