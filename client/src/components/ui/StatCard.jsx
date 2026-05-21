import { clsx } from './utils'

const colorMap = {
    blue:    { icon: 'bg-gradient-to-br from-blue-500 to-blue-600', glow: 'rgba(59,130,246,0.15)',  accent: '#3b82f6' },
    green:   { icon: 'bg-gradient-to-br from-emerald-500 to-emerald-600', glow: 'rgba(16,185,129,0.15)', accent: '#10b981' },
    purple:  { icon: 'bg-gradient-to-br from-violet-500 to-violet-600', glow: 'rgba(139,92,246,0.15)',  accent: '#8b5cf6' },
    pink:    { icon: 'bg-gradient-to-br from-pink-500 to-pink-600', glow: 'rgba(236,72,153,0.15)',   accent: '#ec4899' },
    orange:  { icon: 'bg-gradient-to-br from-orange-500 to-orange-600', glow: 'rgba(249,115,22,0.15)',  accent: '#f97316' },
    cyan:    { icon: 'bg-gradient-to-br from-cyan-500 to-cyan-600', glow: 'rgba(6,182,212,0.15)',   accent: '#06b6d4' },
    emerald: { icon: 'bg-gradient-to-br from-emerald-400 to-teal-500', glow: 'rgba(52,211,153,0.15)', accent: '#34d399' },
    red:     { icon: 'bg-gradient-to-br from-red-500 to-red-600', glow: 'rgba(239,68,68,0.15)',    accent: '#ef4444' },
}

export function StatCard({ icon, label, value, delta, color = 'blue', className = '' }) {
    const c = colorMap[color] ?? colorMap.blue

    return (
        <div
            className={clsx(
                'relative overflow-hidden rounded-[var(--radius-lg)] p-5',
                'bg-[var(--bg-card)] border border-[var(--border-color)]',
                'shadow-[var(--card-shadow)] transition-all duration-300',
                'hover:-translate-y-1 cursor-default',
                className
            )}
            style={{
                '--stat-accent': c.accent,
                '--stat-glow': c.glow,
            }}
        >
            {/* Decorative glow top-right */}
            <div
                className="absolute top-0 right-0 w-24 h-24 pointer-events-none"
                style={{ background: `radial-gradient(circle at top right, ${c.glow}, transparent 70%)` }}
            />

            <div className="relative flex items-center gap-4 z-10">
                <div className={clsx(
                    'w-12 h-12 rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0',
                    'text-white shadow-md',
                    c.icon
                )}>
                    {icon}
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-2xl font-extrabold text-[var(--text-main)] leading-tight tracking-tight">
                        {value}
                    </span>
                    <span className="text-xs font-medium text-[var(--text-muted)] leading-snug">{label}</span>
                    {delta !== undefined && (
                        <span className={clsx(
                            'mt-1 w-fit text-[0.68rem] font-bold px-1.5 py-0.5 rounded-full',
                            delta > 0 ? 'bg-[var(--success-alpha)] text-[var(--success)]' :
                            delta < 0 ? 'bg-[var(--danger-alpha)] text-[var(--danger)]' :
                            'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                        )}>
                            {delta > 0 ? `+${delta}%` : delta < 0 ? `${delta}%` : 'No change'}
                        </span>
                    )}
                </div>
            </div>

            {/* Bottom accent bar */}
            <div
                className="absolute bottom-0 left-0 right-0 h-[3px] opacity-60"
                style={{ background: `linear-gradient(90deg, ${c.accent}, transparent)` }}
            />
        </div>
    )
}
