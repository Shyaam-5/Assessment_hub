import { clsx } from './utils'

export function Table({ children, className = '' }) {
    return (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-color)]">
            <table className={clsx('w-full border-collapse text-sm', className)}>
                {children}
            </table>
        </div>
    )
}

export function Thead({ children }) {
    return (
        <thead className="bg-[var(--table-header-bg)]">
            {children}
        </thead>
    )
}

export function Th({ children, className = '', ...props }) {
    return (
        <th
            className={clsx(
                'px-4 py-3 text-left text-[0.72rem] font-bold uppercase tracking-wider',
                'text-[var(--text-muted)] border-b border-[var(--table-border)]',
                'first:pl-5 last:pr-5',
                className
            )}
            {...props}
        >
            {children}
        </th>
    )
}

export function Tbody({ children }) {
    return <tbody className="divide-y divide-[var(--table-border)]">{children}</tbody>
}

export function Tr({ children, className = '', clickable = false, ...props }) {
    return (
        <tr
            className={clsx(
                'transition-colors duration-150',
                clickable && 'cursor-pointer hover:bg-[var(--table-row-hover)]',
                !clickable && 'hover:bg-[var(--table-row-hover)]',
                className
            )}
            {...props}
        >
            {children}
        </tr>
    )
}

export function Td({ children, className = '', ...props }) {
    return (
        <td
            className={clsx(
                'px-4 py-3 text-[var(--text-main)] first:pl-5 last:pr-5',
                className
            )}
            {...props}
        >
            {children}
        </td>
    )
}
