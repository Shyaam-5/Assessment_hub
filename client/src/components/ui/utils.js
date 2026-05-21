/** Minimal classname utility — joins truthy strings, filters falsy. */
export function clsx(...args) {
    return args
        .flat()
        .filter(Boolean)
        .join(' ')
}
