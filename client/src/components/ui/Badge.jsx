import { clsx } from './utils'

const variants = {
    default:   'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
    primary:   'bg-[var(--primary-alpha)] text-[var(--primary)]',
    success:   'bg-[var(--success-alpha)] text-[var(--success)] border border-[rgba(16,185,129,0.3)]',
    warning:   'bg-[var(--warning-alpha)] text-[var(--warning)] border border-[rgba(245,158,11,0.3)]',
    danger:    'bg-[var(--danger-alpha)] text-[var(--danger)] border border-[rgba(239,68,68,0.3)]',
    purple:    'bg-[rgba(139,92,246,0.12)] text-[#8b5cf6] border border-[rgba(139,92,246,0.3)]',
    easy:      'bg-[rgba(16,185,129,0.12)] text-[var(--success)]',
    medium:    'bg-[rgba(245,158,11,0.12)] text-[var(--warning)]',
    hard:      'bg-[rgba(239,68,68,0.12)] text-[var(--danger)]',
    live:      'bg-[var(--success-alpha)] text-[var(--success)] border border-[rgba(16,185,129,0.3)]',
    draft:     'bg-[rgba(148,163,184,0.12)] text-[#94a3b8]',
    closed:    'bg-[var(--danger-alpha)] text-[var(--danger)]',
    accepted:  'bg-[var(--success-alpha)] text-[var(--success)] border border-[rgba(16,185,129,0.3)]',
    rejected:  'bg-[var(--danger-alpha)] text-[var(--danger)] border border-[rgba(239,68,68,0.3)]',
    pending:   'bg-[rgba(251,191,36,0.15)] text-[#fbbf24] border border-[rgba(251,191,36,0.3)]',
}

const sizes = {
    sm: 'px-2 py-0.5 text-[0.65rem]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1 text-sm',
}

export function Badge({
    variant = 'default',
    size = 'md',
    dot = false,
    children,
    className = '',
    ...props
}) {
    return (
        <span
            className={clsx(
                'inline-flex items-center gap-1.5 font-semibold rounded-full uppercase tracking-wide',
                variants[variant],
                sizes[size],
                className
            )}
            {...props}
        >
            {dot && (
                <span className={clsx(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    variant === 'success' || variant === 'accepted' || variant === 'live' ? 'bg-[var(--success)]' :
                    variant === 'danger' || variant === 'rejected' ? 'bg-[var(--danger)]' :
                    variant === 'warning' || variant === 'pending' ? 'bg-[var(--warning)]' :
                    'bg-current'
                )} />
            )}
            {children}
        </span>
    )
}
