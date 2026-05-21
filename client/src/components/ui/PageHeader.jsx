import { clsx } from './utils'

/**
 * Consistent page-level header used at the top of portal content sections.
 * Accepts a title, subtitle, optional badge text, and right-side actions slot.
 */
export function PageHeader({ title, subtitle, badge, actions, className = '' }) {
    return (
        <div className={clsx(
            'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6',
            className
        )}>
            <div className="min-w-0">
                {badge && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 mb-2 text-[0.7rem] font-bold uppercase tracking-widest rounded-full bg-[var(--primary-alpha)] text-[var(--primary)]">
                        {badge}
                    </span>
                )}
                <h2 className="m-0 text-2xl font-extrabold tracking-tight text-[var(--text-main)] leading-tight">
                    {title}
                </h2>
                {subtitle && (
                    <p className="m-0 mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
                )}
            </div>
            {actions && (
                <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
            )}
        </div>
    )
}
