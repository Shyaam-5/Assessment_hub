// Feature 76: Offline Mode - Work offline, sync when online
// IndexedDB-backed offline queue + cached data store

const DB_NAME = 'AssessmentHubOffline'
const DB_VERSION = 1
const QUEUE_STORE = 'offlineQueue'
const DATA_STORE = 'cachedData'

class OfflineService {
    constructor() {
        this.db = null
        this.isOnline = navigator.onLine
        this.listeners = new Set()
        this.syncInProgress = false

        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.isOnline = true
            this._notify('online')
            this.syncQueue()
        })
        window.addEventListener('offline', () => {
            this.isOnline = false
            this._notify('offline')
        })

        this._initDB()
    }

    // Subscribe to online/offline changes
    subscribe(callback) {
        this.listeners.add(callback)
        return () => this.listeners.delete(callback)
    }

    _notify(status) {
        this.listeners.forEach(cb => cb(status, this.isOnline))
    }

    async _initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION)
            request.onupgradeneeded = (e) => {
                const db = e.target.result
                if (!db.objectStoreNames.contains(QUEUE_STORE)) {
                    db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true })
                }
                if (!db.objectStoreNames.contains(DATA_STORE)) {
                    db.createObjectStore(DATA_STORE, { keyPath: 'key' })
                }
            }
            request.onsuccess = () => {
                this.db = request.result
                resolve(this.db)
            }
            request.onerror = () => reject(request.error)
        })
    }

    async _getDB() {
        if (this.db) return this.db
        return this._initDB()
    }

    // ===== OFFLINE QUEUE =====

    // Add a request to the offline queue (for POST/PUT/DELETE when offline)
    async addToQueue(url, method, body, headers = {}) {
        const db = await this._getDB()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(QUEUE_STORE, 'readwrite')
            const store = tx.objectStore(QUEUE_STORE)
            const item = {
                url,
                method,
                body,
                headers: { 'Content-Type': 'application/json', ...headers },
                timestamp: Date.now(),
                retries: 0
            }
            const request = store.add(item)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
    }

    // Get pending queue count
    async getQueueCount() {
        const db = await this._getDB()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(QUEUE_STORE, 'readonly')
            const store = tx.objectStore(QUEUE_STORE)
            const request = store.count()
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
    }

    // Sync all queued requests
    async syncQueue() {
        if (this.syncInProgress || !this.isOnline) return
        this.syncInProgress = true
        this._notify('syncing')

        try {
            const db = await this._getDB()
            const tx = db.transaction(QUEUE_STORE, 'readonly')
            const store = tx.objectStore(QUEUE_STORE)

            const items = await new Promise((resolve, reject) => {
                const request = store.getAll()
                request.onsuccess = () => resolve(request.result)
                request.onerror = () => reject(request.error)
            })

            let synced = 0
            let failed = 0

            for (const item of items) {
                try {
                    const response = await fetch(item.url, {
                        method: item.method,
                        headers: item.headers,
                        body: JSON.stringify(item.body)
                    })

                    if (response.ok) {
                        // Remove from queue
                        const delTx = db.transaction(QUEUE_STORE, 'readwrite')
                        delTx.objectStore(QUEUE_STORE).delete(item.id)
                        synced++
                    } else if (item.retries < 3) {
                        // Increment retry count
                        const updateTx = db.transaction(QUEUE_STORE, 'readwrite')
                        updateTx.objectStore(QUEUE_STORE).put({ ...item, retries: item.retries + 1 })
                        failed++
                    } else {
                        // Max retries reached, remove
                        const delTx = db.transaction(QUEUE_STORE, 'readwrite')
                        delTx.objectStore(QUEUE_STORE).delete(item.id)
                        failed++
                    }
                } catch (err) {
                    failed++
                }
            }

            this._notify('synced')
            console.log(`[Offline] Synced: ${synced}, Failed: ${failed}`)
        } catch (err) {
            console.error('[Offline] Sync error:', err)
        } finally {
            this.syncInProgress = false
        }
    }

    // ===== DATA CACHE =====

    // Cache data locally (for offline reading)
    async cacheData(key, data, ttl = 3600000) {
        const db = await this._getDB()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DATA_STORE, 'readwrite')
            const store = tx.objectStore(DATA_STORE)
            const request = store.put({
                key,
                data,
                timestamp: Date.now(),
                expires: Date.now() + ttl
            })
            request.onsuccess = () => resolve()
            request.onerror = () => reject(request.error)
        })
    }

    // Get cached data
    async getCachedData(key) {
        const db = await this._getDB()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DATA_STORE, 'readonly')
            const store = tx.objectStore(DATA_STORE)
            const request = store.get(key)
            request.onsuccess = () => {
                const result = request.result
                if (!result) {
                    resolve(null)
                    return
                }
                // Check expiry
                if (result.expires < Date.now()) {
                    // Expired - delete and return null
                    const delTx = db.transaction(DATA_STORE, 'readwrite')
                    delTx.objectStore(DATA_STORE).delete(key)
                    resolve(null)
                    return
                }
                resolve(result.data)
            }
            request.onerror = () => reject(request.error)
        })
    }

    // Smart fetch: try network first, fall back to cache, queue writes when offline
    async smartFetch(url, options = {}) {
        const { method = 'GET', body, headers = {}, cacheKey, cacheTTL } = options

        if (method === 'GET') {
            // GET: Network-first, cache fallback
            if (this.isOnline) {
                try {
                    const response = await fetch(url, { method, headers })
                    const data = await response.json()
                    if (cacheKey) {
                        this.cacheData(cacheKey, data, cacheTTL)
                    }
                    return { data, fromCache: false, offline: false }
                } catch (err) {
                    // Network failed, try cache
                    if (cacheKey) {
                        const cached = await this.getCachedData(cacheKey)
                        if (cached) {
                            return { data: cached, fromCache: true, offline: false }
                        }
                    }
                    throw err
                }
            } else {
                // Offline: use cache
                if (cacheKey) {
                    const cached = await this.getCachedData(cacheKey)
                    if (cached) {
                        return { data: cached, fromCache: true, offline: true }
                    }
                }
                throw new Error('Offline and no cached data available')
            }
        } else {
            // POST/PUT/DELETE: queue when offline
            if (this.isOnline) {
                const response = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json', ...headers },
                    body: JSON.stringify(body)
                })
                return { data: await response.json(), fromCache: false, offline: false }
            } else {
                await this.addToQueue(url, method, body, headers)
                return {
                    data: { queued: true, message: 'Saved offline. Will sync when connected.' },
                    fromCache: false,
                    offline: true,
                    queued: true
                }
            }
        }
    }

    // Clear all cached data
    async clearCache() {
        const db = await this._getDB()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DATA_STORE, 'readwrite')
            const store = tx.objectStore(DATA_STORE)
            const request = store.clear()
            request.onsuccess = () => resolve()
            request.onerror = () => reject(request.error)
        })
    }
}

// Singleton instance
const offlineService = new OfflineService()
export default offlineService
