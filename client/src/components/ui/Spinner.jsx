import { clsx } from './utils'

const sizes = {
    xs:  'w-4 h-4 border-2',
    sm:  'w-6 h-6 border-2',
    md:  'w-9 h-9 border-[3px]',
    lg:  'w-12 h-12 border-4',
    xl:  'w-16 h-16 border-4',
}

export function Spinner({ size = 'md', className = '' }) {
    return (
        <div
            className={clsx(
                'rounded-full border-[var(--bg-tertiary)] border-t-[var(--primary)] animate-spin',
                sizes[size],
                className
            )}
            role="status"
            aria-label="Loading"
        />
    )
}

export function FullPageSpinner({ label = 'Loading…' }) {
    return (
        <div className="flex flex-col items-center justify-center gap-4 min-h-[320px] w-full">
            <Spinner size="lg" />
            <p className="text-sm text-[var(--text-muted)] font-medium">{label}</p>
        </div>
    )
}
