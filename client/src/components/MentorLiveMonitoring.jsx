import { useState, useEffect } from 'react'
import { AlertTriangle, Activity, CheckCircle, Clock, X } from 'lucide-react'
import socketService from '../services/socketService'

function MentorLiveMonitoring({ user }) {
    const [liveUpdates, setLiveUpdates] = useState([])
    const [liveAlerts, setLiveAlerts] = useState([])
    const [isMonitoring, setIsMonitoring] = useState(false)
    const [activeSubmissions, setActiveSubmissions] = useState(new Set()) // Track students currently submitting
    const [alertCount, setAlertCount] = useState(0)

    useEffect(() => {
        // Join monitoring room as mentor
        socketService.joinMonitoring(user.id, 'mentor')
        setIsMonitoring(true)

        // Listen for monitoring connected
        socketService.onMonitoringConnected((data) => {
            console.log('✅ Joined live monitoring:', data)
        })

        // Listen for live updates
        socketService.onLiveUpdate((update) => {
            setLiveUpdates(prev => [update, ...prev.slice(0, 49)]) // Keep last 50 updates
            
            // Track active submissions
            setActiveSubmissions(prev => {
                const updated = new Set(prev)
                if (update.type === 'submission_started') {
                    updated.add(update.studentId)
                    console.log(`📊 Student ${update.studentName} started - Total working: ${updated.size}`)
                } else if (update.type === 'submission_completed') {
                    updated.delete(update.studentId)
                    console.log(`✅ Student ${update.studentName} completed - Total working: ${updated.size}`)
                }
                return updated
            })
        })

        // Listen for live alerts
        socketService.onLiveAlert((alert) => {
            setLiveAlerts(prev => [alert, ...prev.slice(0, 29)]) // Keep last 30 alerts
            setAlertCount(prev => prev + 1)
        })

        return () => {
            socketService.disconnect()
            setIsMonitoring(false)
        }
    }, [user.id])

    const dismissAlert = (index) => {
        setLiveAlerts(prev => prev.filter((_, i) => i !== index))
    }

    const getUpdateIcon = (type) => {
        switch (type) {
            case 'submission_started':
                return <Activity className="w-4 h-4 text-blue-500" />
            case 'submission_completed':
                return <CheckCircle className="w-4 h-4 text-green-500" />
            case 'progress_update':
                return <Clock className="w-4 h-4 text-yellow-500" />
            case 'test_failed':
                return <AlertTriangle className="w-4 h-4 text-orange-500" />
            default:
                return <Activity className="w-4 h-4 text-gray-500" />
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
            <h2 className="text-2xl font-bold mb-6">📊 Live Student Monitoring</h2>

            {/* Status Bar */}
            <div className="status-bar">
                <div className={`status-item ${isMonitoring ? 'active' : 'inactive'}`}>
                    <div className="status-dot"></div>
                    <span>{isMonitoring ? 'Live Monitoring Active' : 'Not Monitoring'}</span>
                </div>
                <div className="status-item">
                    <span className="font-semibold text-blue-600">{activeSubmissions.size}</span>
                    <span className="ml-2">Students Working</span>
                </div>
                <div className="status-item">
                    <span className="font-semibold text-red-600">{alertCount}</span>
                    <span className="ml-2">Alerts</span>
                </div>
            </div>

            <div className="flex gap-6 mt-6">
                {/* Live Alerts Section */}
                <div className="flex-1 max-w-md">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <AlertTriangle size={20} className="text-red-500" />
                        Proctoring Alerts
                    </h3>
                    
                    <div className="alerts-list">
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
                                            {alert.studentName || `Student ${alert.studentId}`}
                                        </span>
                                        <button 
                                            className="dismiss-btn"
                                            onClick={() => dismissAlert(idx)}
                                            title="Dismiss"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                    <div className="alert-body">
                                        <div className="violation-type">
                                            {alert.violationType.replace(/_/g, ' ').toUpperCase()}
                                        </div>
                                        <div className="severity-badge">
                                            {alert.severity.toUpperCase()}
                                        </div>
                                    </div>
                                    <div className="alert-time">
                                        {formatTime(alert.timestamp)}
                                    </div>
                                    {alert.requiresAction && (
                                        <div className="requires-action">
                                            ⚠️ Requires immediate action
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Live Updates Section */}
                <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Activity size={20} className="text-blue-500" />
                        Live Activity Feed
                    </h3>
                    
                    <div className="updates-list">
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
                                                    <strong>{update.studentName || `Student ${update.studentId}`}</strong> started {update.problemTitle}
                                                    {update.isProctored && <span className="badge-proctored">Proctored</span>}
                                                </span>
                                            )}
                                            {update.type === 'submission_completed' && (
                                                <span>
                                                    <strong>{update.studentName || `Student ${update.studentId}`}</strong> completed {update.problemTitle}
                                                    <span className={`badge-status status-${update.status}`}>
                                                        {update.status.toUpperCase()}
                                                    </span>
                                                    {update.score !== undefined && (
                                                        <span className="badge-score">
                                                            Score: {update.score}%
                                                        </span>
                                                    )}
                                                </span>
                                            )}
                                            {update.type === 'progress_update' && (
                                                <span>
                                                    <strong>{update.studentName || `Student ${update.studentId}`}</strong> - {update.problemId}
                                                    <span className="badge-progress">
                                                        {update.progress}% complete
                                                    </span>
                                                </span>
                                            )}
                                            {update.type === 'test_failed' && (
                                                <span>
                                                    <strong>{update.studentName || `Student ${update.studentId}`}</strong> - Test failed: {update.testname}
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
            </div>
        </div>
    )
}

export default MentorLiveMonitoring
