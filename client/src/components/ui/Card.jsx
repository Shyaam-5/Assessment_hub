import { clsx } from './utils'

export function Card({ children, className = '', hover = false, padding = 'md', ...props }) {
    const paddings = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6', xl: 'p-8' }
    return (
        <div
            className={clsx(
                'bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[var(--radius-lg)]',
                'shadow-[var(--card-shadow)] transition-all duration-300',
                hover && 'hover:-translate-y-1 hover:shadow-lg hover:border-[rgba(59,130,246,0.3)]',
                paddings[padding],
                className
            )}
            {...props}
        >
            {children}
        </div>
    )
}

export function CardHeader({ children, className = '', border = true, ...props }) {
    return (
        <div
            className={clsx(
                'flex items-center justify-between',
                border && 'pb-4 mb-4 border-b border-[var(--border-color)]',
                className
            )}
            {...props}
        >
            {children}
        </div>
    )
}

export function CardTitle({ children, icon, className = '' }) {
    return (
        <h3 className={clsx('flex items-center gap-2 text-base font-bold text-[var(--text-main)] m-0', className)}>
            {icon && <span className="opacity-80 text-[var(--primary)]">{icon}</span>}
            {children}
        </h3>
    )
}

export function CardBody({ children, className = '' }) {
    return <div className={clsx('flex-1', className)}>{children}</div>
}
