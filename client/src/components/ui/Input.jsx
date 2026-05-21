import { clsx } from './utils'

export function Input({
    label,
    error,
    helper,
    icon,
    iconRight,
    className = '',
    wrapClassName = '',
    ...props
}) {
    return (
        <div className={clsx('flex flex-col gap-1.5', wrapClassName)}>
            {label && (
                <label className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    {label}
                </label>
            )}
            <div className="relative">
                {icon && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none">
                        {icon}
                    </span>
                )}
                <input
                    className={clsx(
                        'w-full px-3 py-2 rounded-[var(--radius-md)] text-sm',
                        'bg-[var(--bg-card)] border border-[var(--border-color)]',
                        'text-[var(--text-main)] placeholder:text-[var(--text-muted)]',
                        'transition-all duration-200',
                        'focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_var(--primary-alpha)]',
                        error && 'border-[var(--danger)] focus:border-[var(--danger)] focus:shadow-[0_0_0_3px_var(--danger-alpha)]',
                        icon && 'pl-9',
                        iconRight && 'pr-9',
                        className
                    )}
                    {...props}
                />
                {iconRight && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                        {iconRight}
                    </span>
                )}
            </div>
            {error && <p className="text-xs text-[var(--danger)] mt-0.5">{error}</p>}
            {helper && !error && <p className="text-xs text-[var(--text-muted)]">{helper}</p>}
        </div>
    )
}

export function Select({ label, error, className = '', wrapClassName = '', children, ...props }) {
    return (
        <div className={clsx('flex flex-col gap-1.5', wrapClassName)}>
            {label && (
                <label className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                    {label}
                </label>
            )}
            <select
                className={clsx(
                    'w-full px-3 py-2 rounded-[var(--radius-md)] text-sm appearance-none',
                    'bg-[var(--bg-card)] border border-[var(--border-color)]',
                    'text-[var(--text-main)]',
                    'transition-all duration-200',
                    'focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_var(--primary-alpha)]',
                    error && 'border-[var(--danger)]',
                    className
                )}
                {...props}
            >
                {children}
            </select>
            {error && <p className="text-xs text-[var(--danger)] mt-0.5">{error}</p>}
        </div>
    )
}
