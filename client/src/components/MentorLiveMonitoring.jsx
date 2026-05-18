import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Activity, CheckCircle, Clock, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react'
import socketService from '../services/socketService'

const MAX_UPDATES = 60
const MAX_ALERTS = 40

const formatLabel = (value = '') => String(value).replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())

const formatTime = (date) => {
    if (!date) return 'Unknown time'
    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return 'Unknown time'
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function MentorLiveMonitoring({ user }) {
    const [liveUpdates, setLiveUpdates] = useState([])
    const [liveAlerts, setLiveAlerts] = useState([])
    const [activeSubmissions, setActiveSubmissions] = useState(new Set())
    const [isMonitoring, setIsMonitoring] = useState(false)
    const [lastEventAt, setLastEventAt] = useState(null)
    const [severityFilter, setSeverityFilter] = useState('all')

    useEffect(() => {
        socketService.connect()
        socketService.joinMonitoring(user.id, 'mentor', user.id)
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

            setActiveSubmissions((prev) => {
                const next = new Set(prev)
                if (update.type === 'submission_started' && update.studentId) next.add(update.studentId)
                if (update.type === 'submission_completed' && update.studentId) next.delete(update.studentId)
                return next
            })

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
    }, [user.id])

    const filteredAlerts = useMemo(() => {
        if (severityFilter === 'all') return liveAlerts
        return liveAlerts.filter((a) => (a.severity || '').toLowerCase() === severityFilter)
    }, [liveAlerts, severityFilter])

    const clearFeed = () => {
        const ok = window.confirm('Clear monitoring feed items? This only clears your local view.')
        if (!ok) return
        setLiveAlerts([])
        setLiveUpdates([])
    }

    const getUpdateIcon = (type) => {
        if (type === 'submission_started') return <Activity size={15} />
        if (type === 'submission_completed') return <CheckCircle size={15} />
        if (type === 'progress_update') return <Clock size={15} />
        return <Activity size={15} />
    }

    return (
        <div className="live-monitoring-container dashboard-panel">
            <div className="monitoring-topbar">
                <div>
                    <h2 className="panel-title" style={{ marginBottom: '0.4rem' }}>
                        <Activity size={20} color="#3b82f6" />
                        Live Student Monitoring
                    </h2>
                    <p className="monitoring-subtitle">
                        Follow student exam activity in real time and triage proctoring alerts quickly.
                    </p>
                </div>
                <div className="monitoring-actions">
                    <button className="view-all-btn" onClick={clearFeed}>
                        <Trash2 size={14} />
                        Clear Feed
                    </button>
                </div>
            </div>

            <div className="status-bar">
                <div className={`status-item ${isMonitoring ? 'active' : 'inactive'}`}>
                    <div className="status-dot"></div>
                    {isMonitoring ? <Wifi size={14} /> : <WifiOff size={14} />}
                    <span>{isMonitoring ? 'Monitoring Connected' : 'Connection Lost'}</span>
                </div>
                <div className="status-item">
                    <RefreshCw size={14} />
                    <span>Last Event: {lastEventAt ? formatTime(lastEventAt) : 'Waiting'}</span>
                </div>
                <div className="status-item"><span>{activeSubmissions.size}</span><span>Students Working</span></div>
                <div className="status-item"><span>{liveAlerts.length}</span><span>Total Alerts</span></div>
            </div>

            <div className="monitoring-grid">
                <section className="monitoring-card">
                    <div className="monitoring-card-header">
                        <h3><AlertTriangle size={18} color="#ef4444" /> Proctoring Alerts</h3>
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
                    <div className="alerts-list">
                        {filteredAlerts.length === 0 ? (
                            <div className="empty-state-small">No alerts for selected filter</div>
                        ) : filteredAlerts.map((alert, idx) => (
                            <div key={`${alert.timestamp}-${idx}`} className={`alert-item severity-${alert.severity}`}>
                                <div className="alert-header">
                                    <span className="font-semibold">{alert.studentName}</span>
                                    <span className={`severity-badge severity-${alert.severity}`}>{alert.severity}</span>
                                </div>
                                <div className="alert-body">
                                    <div className="violation-type">{formatLabel(alert.violationType)}</div>
                                </div>
                                <div className="alert-time">{formatTime(alert.timestamp)}</div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="monitoring-card">
                    <div className="monitoring-card-header">
                        <h3><Activity size={18} color="#3b82f6" /> Activity Feed</h3>
                        <span className="monitoring-count">{liveUpdates.length} events</span>
                    </div>
                    <div className="updates-list">
                        {liveUpdates.length === 0 ? (
                            <div className="empty-state-small">Waiting for activity events...</div>
                        ) : liveUpdates.map((update, idx) => (
                            <div key={`${update.timestamp}-${idx}`} className={`update-item type-${update.type}`}>
                                <div className="update-icon">{getUpdateIcon(update.type)}</div>
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

export default MentorLiveMonitoring
