const TOKEN_KEY = 'authToken'

let inMemoryToken = ''

function hasWebStorage(name) {
    try {
        return typeof window !== 'undefined' && typeof window[name] !== 'undefined'
    } catch {
        return false
    }
}

function readSessionToken() {
    if (!hasWebStorage('sessionStorage')) return ''
    return window.sessionStorage.getItem(TOKEN_KEY) || ''
}

function readLegacyLocalToken() {
    if (!hasWebStorage('localStorage')) return ''
    return window.localStorage.getItem(TOKEN_KEY) || ''
}

function persistSessionToken(token) {
    if (!hasWebStorage('sessionStorage')) return
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token)
    else window.sessionStorage.removeItem(TOKEN_KEY)
}

function clearLegacyLocalToken() {
    if (!hasWebStorage('localStorage')) return
    window.localStorage.removeItem(TOKEN_KEY)
}

export function getAuthToken() {
    const sessionToken = readSessionToken()
    if (sessionToken) {
        inMemoryToken = sessionToken
        return sessionToken
    }

    const legacyLocalToken = readLegacyLocalToken()
    if (legacyLocalToken) {
        inMemoryToken = legacyLocalToken
        persistSessionToken(legacyLocalToken)
        clearLegacyLocalToken()
        return legacyLocalToken
    }

    return inMemoryToken
}

export function setAuthToken(token) {
    inMemoryToken = token || ''
    persistSessionToken(inMemoryToken)
    clearLegacyLocalToken()
}

export function clearAuthToken() {
    inMemoryToken = ''
    persistSessionToken('')
    clearLegacyLocalToken()
}
