import { useState, useEffect } from 'react'
import { AlertTriangle, Activity, BarChart3, Zap } from 'lucide-react'
import socketService from '../services/socketService'

function AdminLiveMonitoring({ user }) {
    const [liveUpdates, setLiveUpdates] = useState([])
    const [liveAlerts, setLiveAlerts] = useState([])
    const [stats, setStats] = useState({
        totalStudentsActive: [],
        totalMentorsActive: [],
        activeSubmissions: [], // Track students currently submitting
        totalAlerts: 0,
        criticalAlerts: 0
    })
    const [isMonitoring, setIsMonitoring] = useState(false)

    useEffect(() => {
        // Join monitoring room as admin
        socketService.joinMonitoring(user.id, 'admin')
        setIsMonitoring(true)

        // Listen for monitoring connected
        socketService.onMonitoringConnected((data) => {
            console.log('✅ Admin joined global monitoring:', data)
        })

        // Listen for live updates (all mentors/students)
        socketService.onLiveUpdate((update) => {
            setLiveUpdates(prev => [update, ...prev.slice(0, 99)]) // Keep last 100 updates

            // Update stats
            setStats(prev => {
                const newStudents = prev.totalStudentsActive.includes(update.studentId)
                    ? prev.totalStudentsActive
                    : [...prev.totalStudentsActive, update.studentId]
                const newMentors = (update.mentorId && !prev.totalMentorsActive.includes(update.mentorId))
                    ? [...prev.totalMentorsActive, update.mentorId]
                    : prev.totalMentorsActive
                let newSubmissions = prev.activeSubmissions
                if (update.type === 'submission_started' && !prev.activeSubmissions.includes(update.studentId)) {
                    newSubmissions = [...prev.activeSubmissions, update.studentId]
                } else if (update.type === 'submission_completed') {
                    newSubmissions = prev.activeSubmissions.filter(id => id !== update.studentId)
                }
                return {
                    ...prev,
                    totalStudentsActive: newStudents,
                    totalMentorsActive: newMentors,
                    activeSubmissions: newSubmissions
                }
            })
        })

        // Listen for live alerts
        socketService.onLiveAlert((alert) => {
            setLiveAlerts(prev => [alert, ...prev.slice(0, 49)]) // Keep last 50 alerts

            // Update alert stats
            setStats(prev => ({
                ...prev,
                totalAlerts: prev.totalAlerts + 1,
                criticalAlerts: prev.criticalAlerts + (alert.severity === 'critical' ? 1 : 0)
            }))
        })

        return () => {
            socketService.disconnect()
            setIsMonitoring(false)
        }
    }, [user.id])

    const getUpdateIcon = (type) => {
        switch (type) {
            case 'submission_started':
                return <Activity className="w-4 h-4 text-blue-500" />
            case 'submission_completed':
                return '✅'
            case 'progress_update':
                return '⏱️'
            case 'test_failed':
                return '❌'
            default:
                return '📊'
        }
    }

    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
    }

    return (
        <div className="live-monitoring-container">
            <h2 className="text-2xl font-bold mb-6">🛡️ Global Live Monitoring Dashboard</h2>

            {/* Admin Status Bar */}
            <div className="status-bar">
                <div className={`status-item ${isMonitoring ? 'active' : 'inactive'}`}>
                    <div className="status-dot"></div>
                    <span>{isMonitoring ? 'Global Monitoring Active' : 'Not Monitoring'}</span>
                </div>
                <div className="status-item">
                    <Zap size={16} className="text-blue-500" />
                    <span className="font-semibold text-blue-600">{stats.activeSubmissions.length}</span>
                    <span className="ml-1">Students Working</span>
                </div>
                <div className="status-item">
                    <BarChart3 size={16} className="text-cyan-500" />
                    <span className="font-semibold text-cyan-600">{stats.totalStudentsActive.length}</span>
                    <span className="ml-1">Total Visited</span>
                </div>
                <div className="status-item">
                    <BarChart3 size={16} className="text-purple-500" />
                    <span className="font-semibold text-purple-600">{stats.totalMentorsActive.length}</span>
                    <span className="ml-1">Active Mentors</span>
                </div>
                <div className="status-item">
                    <AlertTriangle size={16} className="text-red-500" />
                    <span className="font-semibold text-red-600">{stats.totalAlerts}</span>
                    <span className="ml-1">Total Alerts</span>
                </div>
                <div className="status-item">
                    <AlertTriangle size={16} className="text-orange-600" />
                    <span className="font-semibold text-orange-600">{stats.criticalAlerts}</span>
                    <span className="ml-1">Critical</span>
                </div>
            </div>

            <div className="flex gap-6 mt-6">
                {/* Critical Alerts Section */}
                <div className="flex-1 max-w-lg">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <AlertTriangle size={20} className="text-red-500" />
                        Critical Alerts ({stats.criticalAlerts})
                    </h3>

                    <div className="alerts-list admin-alerts">
                        {liveAlerts.filter(a => a.severity === 'critical').length === 0 ? (
                            <div className="empty-state">No critical alerts</div>
                        ) : (
                            liveAlerts
                                .filter(a => a.severity === 'critical')
                                .map((alert, idx) => (
                                    <div
                                        key={idx}
                                        className="alert-item severity-critical"
                                    >
                                        <div className="alert-header">
                                            <span className="font-semibold text-red-900">
                                                🚨 {alert.studentName || `Student ${alert.studentId}`} - {(alert.violationType || 'unknown').replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <div className="alert-time">
                                            {formatTime(alert.timestamp)}
                                        </div>
                                    </div>
                                ))
                        )}
                    </div>
                </div>

                {/* All Alerts Section */}
                <div className="flex-1 max-w-lg">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <AlertTriangle size={20} className="text-orange-500" />
                        All Alerts ({liveAlerts.length})
                    </h3>

                    <div className="alerts-list admin-alerts">
                        {liveAlerts.length === 0 ? (
                            <div className="empty-state">No alerts</div>
                        ) : (
                            liveAlerts.map((alert, idx) => (
                                <div
                                    key={idx}
                                    className={`alert-item severity-${alert.severity}`}
                                >
                                    <div className="alert-header">
                                        <span className="font-semibold">
                                            {alert.studentName || `Student ${alert.studentId}`} - {(alert.violationType || 'unknown').replace(/_/g, ' ')}
                                        </span>
                                        <span className={`severity-badge severity-${alert.severity}`}>
                                            {alert.severity}
                                        </span>
                                    </div>
                                    <div className="alert-time">
                                        {formatTime(alert.timestamp)}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Activity Feed */}
            <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Activity size={20} className="text-blue-500" />
                    Global Activity Feed ({liveUpdates.length})
                </h3>

                <div className="updates-list admin-updates">
                    {liveUpdates.length === 0 ? (
                        <div className="empty-state">Waiting for activity...</div>
                    ) : (
                        liveUpdates.map((update, idx) => (
                            <div key={idx} className={`update-item type-${update.type}`}>
                                <div className="update-icon">
                                    {getUpdateIcon(update.type)}
                                </div>
                                <div className="update-content">
                                    <div className="update-title">
                                        {update.type === 'submission_started' && (
                                            <span>
                                                <strong>{update.studentName || `Student ${update.studentId}`}</strong> started
                                                <strong> {update.problemTitle}</strong>
                                                {update.isProctored && <span className="badge-proctored">Proctored</span>}
                                            </span>
                                        )}
                                        {update.type === 'submission_completed' && (
                                            <span>
                                                <strong>{update.studentName || `Student ${update.studentId}`}</strong> completed
                                                <strong> {update.problemTitle}</strong>
                                                <span className={`badge-status status-${update.status}`}>
                                                    {update.status}
                                                </span>
                                            </span>
                                        )}
                                        {update.type === 'progress_update' && (
                                            <span>
                                                <strong>{update.studentName || `Student ${update.studentId}`}</strong> -
                                                <strong> {update.problemId}</strong>
                                                <span className="badge-progress">
                                                    {update.progress}%
                                                </span>
                                            </span>
                                        )}
                                        {update.type === 'test_failed' && (
                                            <span>
                                                <strong>{update.studentName || `Student ${update.studentId}`}</strong> - Test failed:
                                                <strong> {update.testname}</strong>
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="update-time">
                                    {formatTime(update.timestamp)}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <style>{`
                .admin-alerts {
                    max-height: 400px;
                }
                
                .admin-updates {
                    max-height: 500px;
                }

                .severity-badge.severity-critical {
                    background: #dc2626;
                    color: white;
                    font-size: 0.75rem;
                    padding: 0.25rem 0.75rem;
                    border-radius: 9999px;
                }

                .severity-badge.severity-warning {
                    background: #f59e0b;
                    color: white;
                    font-size: 0.75rem;
                    padding: 0.25rem 0.75rem;
                    border-radius: 9999px;
                }
            `}</style>
        </div>
    )
}

export default AdminLiveMonitoring
