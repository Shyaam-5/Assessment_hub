import { clsx } from '../ui/utils'

const variants = {
    primary:   'bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)] shadow-sm hover:shadow-md',
    secondary: 'bg-transparent border border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)]',
    ghost:     'bg-transparent text-[var(--text-muted)] hover:bg-[rgba(59,130,246,0.08)] hover:text-[var(--text-main)]',
    danger:    'bg-[var(--danger)] text-white hover:bg-red-700 shadow-sm hover:shadow-md',
    success:   'bg-[var(--success)] text-white hover:bg-emerald-600 shadow-sm',
    outline:   'bg-transparent border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary-alpha)]',
}

const sizes = {
    xs: 'px-2.5 py-1 text-xs gap-1',
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-base gap-2',
}

export function Button({
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    icon,
    iconRight,
    children,
    className = '',
    ...props
}) {
    return (
        <button
            disabled={disabled || loading}
            className={clsx(
                'inline-flex items-center justify-center font-semibold rounded-[var(--radius-md)]',
                'transition-all duration-200 ease-out cursor-pointer',
                'hover:-translate-y-px active:translate-y-0',
                'focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-2',
                'disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0',
                variants[variant],
                sizes[size],
                className
            )}
            {...props}
        >
            {loading ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : icon}
            {children && <span>{children}</span>}
            {!loading && iconRight}
        </button>
    )
}
