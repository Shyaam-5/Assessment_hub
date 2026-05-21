import { clsx } from './utils'

export function EmptyState({ icon, title, description, action, size = 'md', className = '' }) {
    const sizes = {
        sm: { wrap: 'py-8 px-4', iconBox: 'w-12 h-12', iconSize: 24, title: 'text-base', desc: 'text-xs' },
        md: { wrap: 'py-12 px-6', iconBox: 'w-16 h-16', iconSize: 28, title: 'text-lg',   desc: 'text-sm' },
        lg: { wrap: 'py-16 px-8', iconBox: 'w-20 h-20', iconSize: 36, title: 'text-xl',   desc: 'text-sm' },
    }
    const s = sizes[size]

    return (
        <div className={clsx('flex flex-col items-center justify-center text-center', s.wrap, className)}>
            {icon && (
                <div className={clsx(
                    s.iconBox,
                    'flex items-center justify-center rounded-full mb-4',
                    'bg-[var(--primary-alpha)] text-[var(--primary)] opacity-80'
                )}>
                    {typeof icon === 'function' ? icon({ size: s.iconSize }) : icon}
                </div>
            )}
            <h3 className={clsx('m-0 font-bold text-[var(--text-main)]', s.title)}>{title}</h3>
            {description && (
                <p className={clsx('mt-1.5 mb-0 text-[var(--text-muted)] max-w-xs', s.desc)}>{description}</p>
            )}
            {action && <div className="mt-4">{action}</div>}
        </div>
    )
}
