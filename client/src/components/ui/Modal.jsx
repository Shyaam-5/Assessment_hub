import { useEffect } from 'react'
import { X } from 'lucide-react'
import { clsx } from './utils'

const maxWidths = {
    sm:   'max-w-sm',
    md:   'max-w-xl',
    lg:   'max-w-3xl',
    xl:   'max-w-5xl',
    full: 'max-w-[95vw]',
}

export function Modal({ open, onClose, title, icon, children, footer, size = 'md', className = '' }) {
    useEffect(() => {
        if (!open) return
        const handler = (e) => { if (e.key === 'Escape') onClose?.() }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [open, onClose])

    if (!open) return null

    return (
        <div
            className="fixed inset-0 z-[100000] flex items-center justify-center p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-[rgba(8,12,24,0.85)] backdrop-blur-sm"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Panel */}
            <div className={clsx(
                'relative w-full flex flex-col',
                'bg-[var(--bg-card)] border border-[var(--border-color)]',
                'rounded-[var(--radius-xl)] shadow-[var(--modal-shadow)]',
                'max-h-[90vh] overflow-hidden',
                'animate-[modalSlideUp_0.35s_cubic-bezier(0.16,1,0.3,1)]',
                maxWidths[size],
                className
            )}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] flex-shrink-0">
                    <div className="flex items-center gap-3">
                        {icon && (
                            <span className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-alpha)] text-[var(--primary)] flex-shrink-0">
                                {icon}
                            </span>
                        )}
                        <h2 className="m-0 text-lg font-bold text-[var(--text-main)]">{title}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--border-color)] transition-colors border-none cursor-pointer"
                        aria-label="Close"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-color)] flex-shrink-0">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    )
}
