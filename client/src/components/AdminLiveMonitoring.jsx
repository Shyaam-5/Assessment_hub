import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Activity, BarChart3, Wifi, WifiOff, RefreshCw, Pause, Play, Trash2, Bell, Flag, X } from 'lucide-react'
import socketService from '../services/socketService'
import axios from 'axios'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

const MAX_UPDATES = 100
const MAX_ALERTS = 50

const formatLabel = (value = '') => String(value).replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())

const formatTime = (date) => {
    if (!date) return 'Unknown time'
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return 'Unknown time'
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function AdminLiveMonitoring({ user }) {
    const [liveUpdates, setLiveUpdates] = useState([])
    const [liveAlerts, setLiveAlerts] = useState([])
    const [activeStudents, setActiveStudents] = useState(new Set())
    const [activeMentors, setActiveMentors] = useState(new Set())
    const [activeSubmissions, setActiveSubmissions] = useState(new Set())
    const [isMonitoring, setIsMonitoring] = useState(false)
    const [feedPaused, setFeedPaused] = useState(false)
    const feedPausedRef = useRef(false)
    const [lastEventAt, setLastEventAt] = useState(null)
    const [severityFilter, setSeverityFilter] = useState('all')

    useEffect(() => {
        feedPausedRef.current = feedPaused
    }, [feedPaused])

    useEffect(() => {
        socketService.connect()
        socketService.joinMonitoring(user.id, user?.role || 'admin')
        setIsMonitoring(true)

        const handleConnected = () => setIsMonitoring(true)
        const handleDisconnected = () => setIsMonitoring(false)
        const handleUpdate = (rawUpdate = {}) => {
            const update = {
                ...rawUpdate,
                type: rawUpdate.type || 'activity',
                studentName: rawUpdate.studentName || (rawUpdate.studentId ? `Student ${rawUpdate.studentId}` : 'Student'),
                timestamp: rawUpdate.timestamp || new Date().toISOString(),
            }
            setLastEventAt(update.timestamp)

            setActiveStudents((prev) => {
                const next = new Set(prev)
                if (update.studentId) next.add(update.studentId)
                return next
            })

            setActiveMentors((prev) => {
                const next = new Set(prev)
                if (update.mentorId) next.add(update.mentorId)
                return next
            })

            setActiveSubmissions((prev) => {
                const next = new Set(prev)
                if (update.type === 'submission_started' && update.studentId) next.add(update.studentId)
                if (update.type === 'submission_completed' && update.studentId) next.delete(update.studentId)
                return next
            })

            if (feedPausedRef.current) return
            setLiveUpdates((prev) => [update, ...prev.slice(0, MAX_UPDATES - 1)])
        }

        const handleAlert = (rawAlert = {}) => {
            const alert = {
                ...rawAlert,
                severity: rawAlert.severity || 'warning',
                studentName: rawAlert.studentName || (rawAlert.studentId ? `Student ${rawAlert.studentId}` : 'Student'),
                violationType: rawAlert.violationType || 'unknown',
                timestamp: rawAlert.timestamp || new Date().toISOString(),
            }
            setLastEventAt(alert.timestamp)
            if (feedPausedRef.current) return
            setLiveAlerts((prev) => [alert, ...prev.slice(0, MAX_ALERTS - 1)])
        }

        socketService.onMonitoringConnected(handleConnected)
        socketService.on('disconnect', handleDisconnected)
        socketService.onLiveUpdate(handleUpdate)
        socketService.onLiveAlert(handleAlert)

        return () => {
            socketService.removeListener('monitoring_connected')
            socketService.removeListener('disconnect')
            socketService.removeListener('live_update')
            socketService.removeListener('live_alert')
            setIsMonitoring(false)
        }
    }, [user.id, user?.role])

    const filteredAlerts = useMemo(() => {
        if (severityFilter === 'all') return liveAlerts
        return liveAlerts.filter((a) => (a.severity || '').toLowerCase() === severityFilter)
    }, [liveAlerts, severityFilter])

    const criticalAlerts = useMemo(
        () => liveAlerts.filter((a) => (a.severity || '').toLowerCase() === 'critical'),
        [liveAlerts]
    )

    const clearFeed = () => {
        const ok = window.confirm('Clear monitoring feed items? This only clears your local view.')
        if (!ok) return
        setLiveUpdates([])
        setLiveAlerts([])
    }

    const [actionStatus, setActionStatus] = useState({}) // sessionId -> 'warn' | 'flagged' | 'cleared'

    const handleWarn = async (alertItem) => {
        const sessionId = alertItem.sessionId || alertItem.session_id || ''
        const userId = alertItem.studentId || alertItem.user_id || ''
        if (!sessionId) return
        try {
            await axios.post(`${API_BASE}/proctor-agent/warn`, {
                session_id: sessionId,
                user_id: userId,
                message: 'Warning: Suspicious behavior detected. Please follow exam integrity rules.',
            }, { headers: { 'X-User-Id': user.id } })
            setActionStatus(prev => ({ ...prev, [sessionId]: 'warned' }))
        } catch (e) {
            window.alert('Failed to send warning: ' + (e.response?.data?.detail || e.message))
        }
    }

    const handleFlag = async (alertItem) => {
        const sessionId = alertItem.sessionId || alertItem.session_id || ''
        if (!sessionId) return
        setActionStatus(prev => ({ ...prev, [sessionId]: 'flagged' }))
    }

    const handleClearFlag = async (alertItem) => {
        const sessionId = alertItem.sessionId || alertItem.session_id || ''
        const userId = alertItem.studentId || alertItem.user_id || ''
        if (!sessionId) return
        try {
            await axios.post(`${API_BASE}/proctor-agent/clear-flag`, {
                session_id: sessionId,
                user_id: userId,
            }, { headers: { 'X-User-Id': user.id } })
            setActionStatus(prev => ({ ...prev, [sessionId]: 'cleared' }))
        } catch (e) {
            window.alert('Failed to clear flag: ' + (e.response?.data?.detail || e.message))
        }
    }

    return (
        <div className="live-monitoring-container dashboard-panel">
            <div className="monitoring-topbar">
                <div>
                    <h2 className="panel-title" style={{ marginBottom: '0.4rem' }}>
                        <Activity size={20} color="#3b82f6" />
                        Global Live Monitoring
                    </h2>
                    <p className="monitoring-subtitle">
                        Track activity, triage incidents quickly, and keep exam integrity stable.
                    </p>
                </div>
                <div className="monitoring-actions">
                    <button className="view-all-btn" onClick={() => setFeedPaused((p) => !p)}>
                        {feedPaused ? <Play size={14} /> : <Pause size={14} />}
                        {feedPaused ? 'Resume Feed' : 'Pause Feed'}
                    </button>
                    <button className="view-all-btn" onClick={clearFeed}>
                        <Trash2 size={14} />
                        Clear Feed
                    </button>
                </div>
            </div>

            <div className="status-bar">
                {feedPaused && <div className="status-item inactive"><span>Feed Paused</span></div>}
                <div className={`status-item ${isMonitoring ? 'active' : 'inactive'}`}>
                    <div className="status-dot"></div>
                    {isMonitoring ? <Wifi size={14} /> : <WifiOff size={14} />}
                    <span>{isMonitoring ? 'Monitoring Connected' : 'Connection Lost'}</span>
                </div>
                <div className="status-item">
                    <RefreshCw size={14} />
                    <span>Last Event: {lastEventAt ? formatTime(lastEventAt) : 'Waiting'}</span>
                </div>
                <div className="status-item"><span>{activeSubmissions.size}</span><span>Active Submissions</span></div>
                <div className="status-item"><span>{activeStudents.size}</span><span>Unique Students</span></div>
                <div className="status-item"><span>{activeMentors.size}</span><span>Active Mentors</span></div>
                <div className="status-item"><span>{criticalAlerts.length}</span><span>Critical Alerts</span></div>
            </div>

            <div className="monitoring-grid">
                <section className="monitoring-card">
                    <div className="monitoring-card-header">
                        <h3><AlertTriangle size={18} color="#ef4444" /> Alerts</h3>
                        <select
                            value={severityFilter}
                            onChange={(e) => setSeverityFilter(e.target.value)}
                            className="monitoring-select"
                        >
                            <option value="all">All Severity</option>
                            <option value="critical">Critical</option>
                            <option value="warning">Warning</option>
                            <option value="high">High</option>
                        </select>
                    </div>
                    <div className="alerts-list admin-alerts">
                        {filteredAlerts.length === 0 ? (
                            <div className="empty-state-small">No alerts for selected filter</div>
                        ) : filteredAlerts.map((alert, idx) => {
                            const sessionId = alert.sessionId || alert.session_id || `${alert.timestamp}-${idx}`
                            const status = actionStatus[sessionId]
                            return (
                            <div key={`${alert.timestamp}-${idx}`} className={`alert-item severity-${alert.severity}`}>
                                <div className="alert-header">
                                    <span className="font-semibold">{alert.studentName}</span>
                                    <span className={`severity-badge severity-${alert.severity}`}>{alert.severity}</span>
                                </div>
                                <div className="alert-body">
                                    <span className="violation-type">{formatLabel(alert.violationType)}</span>
                                    {status && (
                                        <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: 4, background: status === 'warned' ? 'rgba(245,158,11,0.2)' : status === 'flagged' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)', color: status === 'warned' ? '#f59e0b' : status === 'flagged' ? '#ef4444' : '#10b981', marginLeft: 6, fontWeight: 600 }}>
                                            {status === 'warned' ? 'Warned' : status === 'flagged' ? 'Flagged' : 'Cleared'}
                                        </span>
                                    )}
                                </div>
                                <div className="alert-time">{formatTime(alert.timestamp)}</div>
                                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={() => handleWarn(alert)}
                                        disabled={status === 'warned'}
                                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, borderRadius: 5, border: 'none', cursor: status === 'warned' ? 'not-allowed' : 'pointer', background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
                                    >
                                        <Bell size={11} /> Warn
                                    </button>
                                    <button
                                        onClick={() => handleFlag(alert)}
                                        disabled={status === 'flagged'}
                                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, borderRadius: 5, border: 'none', cursor: status === 'flagged' ? 'not-allowed' : 'pointer', background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                                    >
                                        <Flag size={11} /> Flag
                                    </button>
                                    <button
                                        onClick={() => handleClearFlag(alert)}
                                        disabled={status === 'cleared'}
                                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', fontSize: '0.72rem', fontWeight: 600, borderRadius: 5, border: 'none', cursor: status === 'cleared' ? 'not-allowed' : 'pointer', background: 'rgba(16,185,129,0.15)', color: '#10b981' }}
                                    >
                                        <X size={11} /> Clear
                                    </button>
                                </div>
                            </div>
                        )})}
                    </div>
                </section>

                <section className="monitoring-card">
                    <div className="monitoring-card-header">
                        <h3><BarChart3 size={18} color="#3b82f6" /> Activity Feed</h3>
                        <span className="monitoring-count">{liveUpdates.length} events</span>
                    </div>
                    <div className="updates-list admin-updates">
                        {liveUpdates.length === 0 ? (
                            <div className="empty-state-small">Waiting for activity events...</div>
                        ) : liveUpdates.map((update, idx) => (
                            <div key={`${update.timestamp}-${idx}`} className={`update-item type-${update.type}`}>
                                <div className="update-content">
                                    <div className="update-title">
                                        <strong>{update.studentName}</strong> {formatLabel(update.type)}
                                        {update.problemTitle ? <span> - {update.problemTitle}</span> : null}
                                        {update.status ? <span className={`badge-status status-${update.status}`}>{update.status}</span> : null}
                                    </div>
                                </div>
                                <div className="update-time">{formatTime(update.timestamp)}</div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    )
}

export default AdminLiveMonitoring
