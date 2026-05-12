import React, { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
    Users, RefreshCw, Database, Shield, FileText, Download, BarChart2,
    Activity, Server, HardDrive, Cpu, Clock, AlertTriangle, CheckCircle,
    XCircle, Trash2, Eye, Search, ChevronLeft, ChevronRight,
    Plus, X, Save, Layers, Play, Archive, Zap, TrendingUp, TrendingDown,
    Settings, Globe, Info, Wifi
} from 'lucide-react'
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'
const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6']

// ==================== SHARED STYLES ====================
const cardStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px',
    padding: '1.5rem',
    transition: 'all 0.3s ease'
}

const buttonPrimary = {
    padding: '0.6rem 1.2rem',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    color: 'white',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.85rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease'
}

const buttonSecondary = {
    ...buttonPrimary,
    background: 'rgba(59, 130, 246, 0.1)',
    color: '#3b82f6',
    border: '1px solid rgba(59, 130, 246, 0.3)'
}

const buttonDanger = {
    ...buttonPrimary,
    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
}

const inputStyle = {
    width: '100%',
    padding: '0.7rem 1rem',
    borderRadius: '10px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-card)',
    color: 'var(--text)',
    fontSize: '0.85rem',
    outline: 'none'
}

const selectStyle = {
    ...inputStyle,
    cursor: 'pointer'
}

const tabStyle = (active) => ({
    padding: '0.7rem 1.5rem',
    borderRadius: '10px',
    border: active ? 'none' : '1px solid var(--border-color)',
    background: active ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'transparent',
    color: active ? 'white' : 'var(--text-muted)',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.85rem',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
})

const badgeStyle = (color) => ({
    padding: '0.25rem 0.75rem',
    borderRadius: '20px',
    fontSize: '0.7rem',
    fontWeight: 600,
    background: `${color}20`,
    color: color,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem'
})

const sectionHeader = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1.5rem'
}

const modalOverlay = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
}

const modalContent = {
    background: 'var(--bg-card)',
    borderRadius: '20px',
    padding: '2rem',
    maxWidth: '700px',
    width: '95%',
    maxHeight: '85vh',
    overflowY: 'auto',
    border: '1px solid var(--border-color)',
    boxShadow: '0 25px 50px rgba(0,0,0,0.3)'
}

// ==================== STATUS BADGE COMPONENT ====================
function StatusBadge({ status }) {
    const colors = {
        healthy: '#10b981',
        warning: '#f59e0b',
        degraded: '#f59e0b',
        error: '#ef4444',
        down: '#ef4444',
        completed: '#10b981',
        running: '#3b82f6',
        failed: '#ef4444',
        pending: '#f59e0b',
        passed: '#10b981'
    }
    const color = colors[status] || '#6b7280'
    const icons = {
        healthy: <CheckCircle size={12} />,
        completed: <CheckCircle size={12} />,
        passed: <CheckCircle size={12} />,
        warning: <AlertTriangle size={12} />,
        degraded: <AlertTriangle size={12} />,
        error: <XCircle size={12} />,
        down: <XCircle size={12} />,
        failed: <XCircle size={12} />,
        running: <Activity size={12} />,
        pending: <Clock size={12} />
    }
    return <span style={badgeStyle(color)}>{icons[status]}{status}</span>
}

// ==================== MAIN ADMIN OPERATIONS COMPONENT ====================
export default function AdminOperations() {
    const [activeTab, setActiveTab] = useState('health')

    const tabs = [
        { id: 'health', label: 'System Health', icon: <Activity size={16} /> },
        { id: 'bulk', label: 'Bulk Operations', icon: <Users size={16} /> },
        { id: 'audit', label: 'Audit Logs', icon: <Shield size={16} /> },
        { id: 'templates', label: 'Templates', icon: <Layers size={16} /> },
        { id: 'backups', label: 'Backups', icon: <Database size={16} /> },
        { id: 'export', label: 'Data Export', icon: <Download size={16} /> },
        { id: 'analytics', label: 'Analytics', icon: <BarChart2 size={16} /> },
    ]

    return (
        <div className="animate-fadeIn">
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 50%, rgba(6, 182, 212, 0.05) 100%)',
                borderRadius: '20px',
                padding: '2rem 2.5rem',
                marginBottom: '1.5rem',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{
                    position: 'absolute', top: '-50%', right: '-10%', width: '400px', height: '400px',
                    background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
                    pointerEvents: 'none'
                }} />
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: '52px', height: '52px', borderRadius: '14px',
                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 8px 24px rgba(59, 130, 246, 0.3)'
                    }}>
                        <Settings size={26} color="white" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, background: 'linear-gradient(135deg, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            Admin Operations Center
                        </h1>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            System health, bulk operations, audit logs, backups & analytics
                        </p>
                    </div>
                </div>
            </div>

            {/* Tab Bar */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '1.5rem',
                flexWrap: 'wrap',
                padding: '0.5rem',
                background: 'var(--bg-card)',
                borderRadius: '14px',
                border: '1px solid var(--border-color)'
            }}>
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={tabStyle(activeTab === tab.id)}>
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'health' && <SystemHealthDashboard />}
            {activeTab === 'bulk' && <BulkOperations />}
            {activeTab === 'audit' && <AuditLogs />}
            {activeTab === 'templates' && <ProblemSetTemplates />}
            {activeTab === 'backups' && <AutomatedBackups />}
            {activeTab === 'export' && <DataExportTools />}
            {activeTab === 'analytics' && <AdminAnalytics />}
        </div>
    )
}

// ==================== 67. SYSTEM HEALTH DASHBOARD ====================
function SystemHealthDashboard() {
    const [health, setHealth] = useState(null)
    const [loading, setLoading] = useState(true)
    const [autoRefresh, setAutoRefresh] = useState(false)

    const fetchHealth = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE}/admin/system-health`)
            setHealth(res.data)
        } catch (error) {
            console.error('Health check failed:', error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchHealth()
        if (autoRefresh) {
            const interval = setInterval(fetchHealth, 10000)
            return () => clearInterval(interval)
        }
    }, [fetchHealth, autoRefresh])

    if (loading) return <div className="loading-spinner" />
    if (!health) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem' }}>Failed to load system health</div>

    const statusColor = health.status === 'healthy' ? '#10b981' : health.status === 'warning' ? '#f59e0b' : '#ef4444'

    return (
        <div>
            <div style={sectionHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h2 style={{ margin: 0, color: 'var(--text)', fontSize: '1.2rem' }}>System Health Monitor</h2>
                    <StatusBadge status={health.status} />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
                        Auto-refresh (10s)
                    </label>
                    <button onClick={fetchHealth} style={buttonSecondary}><RefreshCw size={14} /> Refresh</button>
                </div>
            </div>

            {/* Health Overview Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                {/* Overall Status */}
                <div style={{ ...cardStyle, borderLeft: `4px solid ${statusColor}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: '42px', height: '42px', borderRadius: '12px',
                            background: `${statusColor}20`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Activity size={20} color={statusColor} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>System Status</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: statusColor, textTransform: 'capitalize' }}>{health.status}</div>
                        </div>
                    </div>
                    <div style={{ marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        API Latency: {health.apiLatency}ms
                    </div>
                </div>

                {/* Database */}
                <div style={{ ...cardStyle, borderLeft: '4px solid #3b82f6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: '42px', height: '42px', borderRadius: '12px',
                            background: 'rgba(59, 130, 246, 0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Database size={20} color="#3b82f6" />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Database</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <StatusBadge status={health.database.status} />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{health.database.latency}ms</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {health.database.tableCount} tables · {health.database.totalSizeMB} MB
                    </div>
                </div>

                {/* Memory */}
                <div style={{ ...cardStyle, borderLeft: '4px solid #8b5cf6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: '42px', height: '42px', borderRadius: '12px',
                            background: 'rgba(139, 92, 246, 0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Cpu size={20} color="#8b5cf6" />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Memory Usage</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>{health.memory.heapUsed} MB</div>
                        </div>
                    </div>
                    <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ height: '6px', background: 'rgba(139, 92, 246, 0.15)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${health.memory.heapPercent}%`, background: health.memory.heapPercent > 80 ? '#ef4444' : '#8b5cf6', borderRadius: '3px', transition: 'width 0.5s' }} />
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            {health.memory.heapPercent}% of {health.memory.heapTotal} MB heap
                        </div>
                    </div>
                </div>

                {/* Uptime & Connections */}
                <div style={{ ...cardStyle, borderLeft: '4px solid #06b6d4' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: '42px', height: '42px', borderRadius: '12px',
                            background: 'rgba(6, 182, 212, 0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Clock size={20} color="#06b6d4" />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Uptime</div>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{health.uptime.formatted}</div>
                        </div>
                    </div>
                    <div style={{ marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        WebSockets: {health.websockets.total} connected · Node {health.nodeVersion}
                    </div>
                </div>
            </div>

            {/* Database Tables & Storage */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Database size={16} color="#3b82f6" /> Database Tables
                    </h3>
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Table</th>
                                    <th style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--text-muted)' }}>Rows</th>
                                    <th style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--text-muted)' }}>Size</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(health.database.tables || []).map((t, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '0.5rem', color: 'var(--text)', fontFamily: 'monospace', fontSize: '0.75rem' }}>{t.tableName}</td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--text)' }}>{(t.rowCount || 0).toLocaleString()}</td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--text-muted)' }}>{t.sizeMB} MB</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Server size={16} color="#8b5cf6" /> System Details
                    </h3>
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {[
                            { label: 'Node.js Version', value: health.nodeVersion, icon: <Globe size={14} /> },
                            { label: 'Platform', value: health.platform, icon: <Server size={14} /> },
                            { label: 'RSS Memory', value: `${health.memory.rss} MB`, icon: <Cpu size={14} /> },
                            { label: 'External Memory', value: `${health.memory.external} MB`, icon: <HardDrive size={14} /> },
                            { label: 'Upload Storage', value: `${health.storage.uploadsSizeMB} MB`, icon: <Archive size={14} /> },
                            { label: 'Cache Items', value: health.cache.totalItems, icon: <Zap size={14} /> },
                            { label: 'WS Mentors Online', value: health.websockets.mentors, icon: <Wifi size={14} /> },
                            { label: 'WS Students Online', value: health.websockets.students, icon: <Users size={14} /> },
                            { label: 'WS Admins Online', value: health.websockets.admins, icon: <Shield size={14} /> },
                            { label: 'Recent Errors (24h)', value: health.recentErrors, icon: <AlertTriangle size={14} /> }
                        ].map((item, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    {item.icon} {item.label}
                                </span>
                                <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.85rem' }}>{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ==================== 66. BULK OPERATIONS ====================
function BulkOperations() {
    const [activeOp, setActiveOp] = useState('reassign')
    const [students, setStudents] = useState([])
    const [mentors, setMentors] = useState([])
    const [submissions, setSubmissions] = useState([])
    const [selectedStudents, setSelectedStudents] = useState([])
    const [selectedSubmissions, setSelectedSubmissions] = useState([])
    const [targetMentor, setTargetMentor] = useState('')
    const [bulkAction, setBulkAction] = useState('mark_passed')
    const [loading, setLoading] = useState(true)
    const [processing, setProcessing] = useState(false)
    const [result, setResult] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        Promise.all([
            axios.get(`${API_BASE}/users`),
            axios.get(`${API_BASE}/submissions`)
        ]).then(([usersRes, subsRes]) => {
            const allUsers = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data.users || [])
            setStudents(allUsers.filter(u => u.role === 'student'))
            setMentors(allUsers.filter(u => u.role === 'mentor'))
            setSubmissions(Array.isArray(subsRes.data) ? subsRes.data : (subsRes.data.submissions || []))
            setLoading(false)
        }).catch(() => setLoading(false))
    }, [])

    const handleReassign = async () => {
        if (selectedStudents.length === 0 || !targetMentor) return
        setProcessing(true)
        try {
            const res = await axios.post(`${API_BASE}/admin/bulk/reassign-students`, {
                studentIds: selectedStudents,
                newMentorId: targetMentor,
                adminId: 'admin-001',
                adminName: 'Admin'
            })
            setResult({ type: 'success', message: res.data.message })
            setSelectedStudents([])
        } catch (err) {
            setResult({ type: 'error', message: err.response?.data?.error || err.message })
        }
        setProcessing(false)
    }

    const handleBulkGrade = async () => {
        if (selectedSubmissions.length === 0) return
        setProcessing(true)
        try {
            const res = await axios.post(`${API_BASE}/admin/bulk/regrade-submissions`, {
                submissionIds: selectedSubmissions,
                action: bulkAction,
                adminId: 'admin-001',
                adminName: 'Admin'
            })
            setResult({ type: 'success', message: res.data.message })
            setSelectedSubmissions([])
        } catch (err) {
            setResult({ type: 'error', message: err.response?.data?.error || err.message })
        }
        setProcessing(false)
    }

    const handleBulkDelete = async () => {
        if (selectedSubmissions.length === 0) return
        if (!window.confirm(`Delete ${selectedSubmissions.length} submissions? This cannot be undone.`)) return
        setProcessing(true)
        try {
            const res = await axios.post(`${API_BASE}/admin/bulk/delete-submissions`, {
                submissionIds: selectedSubmissions,
                adminId: 'admin-001',
                adminName: 'Admin'
            })
            setResult({ type: 'success', message: res.data.message })
            setSelectedSubmissions([])
            setSubmissions(prev => prev.filter(s => !selectedSubmissions.includes(s.id)))
        } catch (err) {
            setResult({ type: 'error', message: err.response?.data?.error || err.message })
        }
        setProcessing(false)
    }

    if (loading) return <div className="loading-spinner" />

    const filteredStudents = students.filter(s =>
        s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div>
            <div style={sectionHeader}>
                <h2 style={{ margin: 0, color: 'var(--text)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Users size={20} color="#3b82f6" /> Bulk Operations
                </h2>
            </div>

            {result && (
                <div style={{
                    padding: '1rem 1.5rem',
                    borderRadius: '12px',
                    marginBottom: '1rem',
                    background: result.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${result.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    color: result.type === 'success' ? '#10b981' : '#ef4444',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {result.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                        {result.message}
                    </span>
                    <button onClick={() => setResult(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}><X size={16} /></button>
                </div>
            )}

            {/* Operation Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <button onClick={() => setActiveOp('reassign')} style={tabStyle(activeOp === 'reassign')}>
                    <Users size={14} /> Reassign Students
                </button>
                <button onClick={() => setActiveOp('regrade')} style={tabStyle(activeOp === 'regrade')}>
                    <RefreshCw size={14} /> Regrade Submissions
                </button>
            </div>

            {activeOp === 'reassign' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '1.5rem' }}>
                    <div style={cardStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    placeholder="Search students..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    style={{ ...inputStyle, paddingLeft: '2.2rem' }}
                                />
                            </div>
                            <button
                                onClick={() => setSelectedStudents(selectedStudents.length === filteredStudents.length ? [] : filteredStudents.map(s => s.id))}
                                style={buttonSecondary}
                            >
                                {selectedStudents.length === filteredStudents.length ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>

                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            {filteredStudents.map(s => (
                                <label key={s.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '0.65rem 0.75rem', borderRadius: '8px', cursor: 'pointer',
                                    background: selectedStudents.includes(s.id) ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                                    border: `1px solid ${selectedStudents.includes(s.id) ? 'rgba(59, 130, 246, 0.3)' : 'transparent'}`,
                                    marginBottom: '0.25rem', transition: 'all 0.15s ease'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedStudents.includes(s.id)}
                                        onChange={e => {
                                            setSelectedStudents(prev =>
                                                e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                                            )
                                        }}
                                        style={{ accentColor: '#3b82f6' }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.85rem' }}>{s.name}</div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{s.email} · {s.batch || 'No batch'}</div>
                                    </div>
                                    <span style={badgeStyle('#6b7280')}>{s.mentor_id || 'Unassigned'}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div style={cardStyle}>
                            <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: 'var(--text)' }}>Reassignment</h3>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#3b82f6', marginBottom: '0.5rem' }}>{selectedStudents.length}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>students selected</div>

                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>
                                Assign to Mentor
                            </label>
                            <select value={targetMentor} onChange={e => setTargetMentor(e.target.value)} style={{ ...selectStyle, marginBottom: '1.5rem' }}>
                                <option value="">Select mentor...</option>
                                {mentors.map(m => (
                                    <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                                ))}
                            </select>

                            <button
                                onClick={handleReassign}
                                disabled={selectedStudents.length === 0 || !targetMentor || processing}
                                style={{ ...buttonPrimary, width: '100%', justifyContent: 'center', opacity: selectedStudents.length === 0 || !targetMentor ? 0.5 : 1 }}
                            >
                                {processing ? <RefreshCw size={16} className="spin" /> : <Users size={16} />}
                                Reassign {selectedStudents.length} Students
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeOp === 'regrade' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '1.5rem' }}>
                    <div style={cardStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{submissions.length} submissions</span>
                            <button
                                onClick={() => setSelectedSubmissions(selectedSubmissions.length === submissions.length ? [] : submissions.map(s => s.id))}
                                style={buttonSecondary}
                            >
                                {selectedSubmissions.length === submissions.length ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>

                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            {submissions.slice(0, 100).map(s => (
                                <label key={s.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    padding: '0.65rem 0.75rem', borderRadius: '8px', cursor: 'pointer',
                                    background: selectedSubmissions.includes(s.id) ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                                    border: `1px solid ${selectedSubmissions.includes(s.id) ? 'rgba(59, 130, 246, 0.3)' : 'transparent'}`,
                                    marginBottom: '0.25rem'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedSubmissions.includes(s.id)}
                                        onChange={e => {
                                            setSelectedSubmissions(prev =>
                                                e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                                            )
                                        }}
                                        style={{ accentColor: '#3b82f6' }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.82rem' }}>{s.studentName || s.student_name || 'Unknown'}</div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{s.problemTitle || s.problem_title || s.problem_id}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: (s.score || 0) >= 60 ? '#10b981' : '#ef4444' }}>{s.score || 0}%</div>
                                        <StatusBadge status={s.status || 'pending'} />
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div style={cardStyle}>
                            <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: 'var(--text)' }}>Bulk Actions</h3>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#8b5cf6', marginBottom: '0.5rem' }}>{selectedSubmissions.length}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>submissions selected</div>

                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>Action</label>
                            <select value={bulkAction} onChange={e => setBulkAction(e.target.value)} style={{ ...selectStyle, marginBottom: '1rem' }}>
                                <option value="mark_passed">Mark as Passed (score &ge; 60)</option>
                                <option value="mark_failed">Mark as Failed (score = 0)</option>
                                <option value="reset_scores">Reset Scores (score = 0, pending)</option>
                            </select>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <button
                                    onClick={handleBulkGrade}
                                    disabled={selectedSubmissions.length === 0 || processing}
                                    style={{ ...buttonPrimary, width: '100%', justifyContent: 'center', opacity: selectedSubmissions.length === 0 ? 0.5 : 1 }}
                                >
                                    {processing ? <RefreshCw size={16} className="spin" /> : <RefreshCw size={16} />}
                                    Apply to {selectedSubmissions.length} Submissions
                                </button>

                                <button
                                    onClick={handleBulkDelete}
                                    disabled={selectedSubmissions.length === 0 || processing}
                                    style={{ ...buttonDanger, width: '100%', justifyContent: 'center', opacity: selectedSubmissions.length === 0 ? 0.5 : 1 }}
                                >
                                    <Trash2 size={16} /> Delete {selectedSubmissions.length} Submissions
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ==================== 68. AUDIT LOGS ====================
function AuditLogs() {
    const [logs, setLogs] = useState([])
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [totalPages, setTotalPages] = useState(0)
    const [filters, setFilters] = useState({ action: '', resourceType: '' })
    const [selectedLog, setSelectedLog] = useState(null)

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)
            try {
                const params = new URLSearchParams({ page, limit: 30 })
                if (filters.action) params.append('action', filters.action)
                if (filters.resourceType) params.append('resourceType', filters.resourceType)

                const [logsRes, statsRes] = await Promise.all([
                    axios.get(`${API_BASE}/admin/audit-logs?${params}`),
                    axios.get(`${API_BASE}/admin/audit-logs/stats`)
                ])
                setLogs(logsRes.data.logs)
                setTotal(logsRes.data.pagination.total)
                setTotalPages(logsRes.data.pagination.totalPages)
                setStats(statsRes.data)
            } catch (error) {
                console.error('Audit logs error:', error)
            }
            setLoading(false)
        }
        fetchData()
    }, [page, filters])

    const actionColors = {
        'bulk_reassign_students': '#3b82f6',
        'bulk_regrade': '#8b5cf6',
        'bulk_delete_submissions': '#ef4444',
        'create_backup': '#10b981',
        'create_template': '#06b6d4',
        'delete_template': '#ef4444',
        'apply_template': '#f59e0b',
        'data_export': '#ec4899'
    }

    return (
        <div>
            <div style={sectionHeader}>
                <h2 style={{ margin: 0, color: 'var(--text)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Shield size={20} color="#8b5cf6" /> Audit Trail
                </h2>
                <span style={badgeStyle('#8b5cf6')}>{total} total logs</span>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={cardStyle}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#8b5cf6' }}>{stats.totalLogs}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Total Logs</div>
                    </div>
                    <div style={cardStyle}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3b82f6' }}>{stats.actionBreakdown?.length || 0}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Unique Actions</div>
                    </div>
                    <div style={cardStyle}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>{stats.userActivity?.length || 0}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Active Users</div>
                    </div>
                    <div style={cardStyle}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#06b6d4' }}>
                            {stats.recentActivity?.reduce((sum, r) => sum + r.count, 0) || 0}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Last 7 Days</div>
                    </div>
                </div>
            )}

            {/* Activity Chart */}
            {stats?.recentActivity?.length > 0 && (
                <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: 'var(--text)' }}>Activity Trend (7 Days)</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={stats.recentActivity}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }} />
                            <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Filters */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                <input
                    placeholder="Filter by action..."
                    value={filters.action}
                    onChange={e => { setFilters(p => ({ ...p, action: e.target.value })); setPage(1) }}
                    style={{ ...inputStyle, maxWidth: '250px' }}
                />
                <select
                    value={filters.resourceType}
                    onChange={e => { setFilters(p => ({ ...p, resourceType: e.target.value })); setPage(1) }}
                    style={{ ...selectStyle, maxWidth: '200px' }}
                >
                    <option value="">All Resources</option>
                    <option value="allocation">Allocation</option>
                    <option value="submission">Submission</option>
                    <option value="template">Template</option>
                    <option value="backup">Backup</option>
                </select>
            </div>

            {/* Log List */}
            {loading ? <div className="loading-spinner" /> : (
                <div style={cardStyle}>
                    {logs.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                            No audit logs found. Actions will be logged as you use admin features.
                        </p>
                    ) : (
                        <>
                            {logs.map(log => (
                                <div
                                    key={log.id}
                                    onClick={() => setSelectedLog(log)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '1rem',
                                        padding: '0.75rem', borderRadius: '10px', cursor: 'pointer',
                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{
                                        width: '8px', height: '8px', borderRadius: '50%',
                                        background: actionColors[log.action] || '#6b7280',
                                        flexShrink: 0
                                    }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.82rem' }}>
                                            {log.action?.replace(/_/g, ' ')}
                                        </div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                            {log.user_name || 'System'} · {log.resource_type || ''}
                                        </div>
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'right' }}>
                                        {new Date(log.timestamp).toLocaleString()}
                                    </div>
                                    <Eye size={14} color="var(--text-muted)" />
                                </div>
                            ))}

                            {/* Pagination */}
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ ...buttonSecondary, opacity: page <= 1 ? 0.4 : 1 }}>
                                    <ChevronLeft size={14} /> Prev
                                </button>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Page {page} of {totalPages}</span>
                                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ ...buttonSecondary, opacity: page >= totalPages ? 0.4 : 1 }}>
                                    Next <ChevronRight size={14} />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Detail Modal */}
            {selectedLog && (
                <div style={modalOverlay} onClick={() => setSelectedLog(null)}>
                    <div style={modalContent} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, color: 'var(--text)' }}>Audit Log Detail</h3>
                            <button onClick={() => setSelectedLog(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            {[
                                { label: 'Action', value: selectedLog.action?.replace(/_/g, ' ') },
                                { label: 'User', value: `${selectedLog.user_name} (${selectedLog.user_role})` },
                                { label: 'Resource', value: `${selectedLog.resource_type || '-'} / ${selectedLog.resource_id || '-'}` },
                                { label: 'IP Address', value: selectedLog.ip_address || '-' },
                                { label: 'Timestamp', value: new Date(selectedLog.timestamp).toLocaleString() },
                            ].map((item, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{item.label}</span>
                                    <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.85rem' }}>{item.value}</span>
                                </div>
                            ))}
                        </div>
                        {selectedLog.details && (
                            <div style={{ marginTop: '1rem' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600 }}>Details (JSON)</div>
                                <pre style={{
                                    background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '10px',
                                    fontSize: '0.75rem', color: '#06b6d4', overflowX: 'auto', maxHeight: '250px'
                                }}>
                                    {JSON.stringify(selectedLog.details, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ==================== 69. PROBLEM SET TEMPLATES ====================
function ProblemSetTemplates() {
    const [templates, setTemplates] = useState([])
    const [problems, setProblems] = useState([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [selectedTemplate, setSelectedTemplate] = useState(null)
    const [form, setForm] = useState({ name: '', description: '', difficulty: 'Mixed', tags: '', problemIds: [] })

    useEffect(() => {
        Promise.all([
            axios.get(`${API_BASE}/admin/templates`),
            axios.get(`${API_BASE}/problems`)
        ]).then(([tRes, pRes]) => {
            setTemplates(tRes.data)
            const allProblems = Array.isArray(pRes.data) ? pRes.data : (pRes.data.problems || [])
            setProblems(allProblems)
            setLoading(false)
        }).catch(() => setLoading(false))
    }, [])

    const handleCreate = async () => {
        try {
            const res = await axios.post(`${API_BASE}/admin/templates`, {
                ...form,
                tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
                createdBy: 'admin-001',
                adminName: 'Admin'
            })
            setTemplates(prev => [{ ...form, id: res.data.id, problemCount: form.problemIds.length, created_at: new Date() }, ...prev])
            setShowCreate(false)
            setForm({ name: '', description: '', difficulty: 'Mixed', tags: '', problemIds: [] })
        } catch (err) {
            alert(err.response?.data?.error || err.message)
        }
    }

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this template?')) return
        try {
            await axios.delete(`${API_BASE}/admin/templates/${id}?adminId=admin-001&adminName=Admin`)
            setTemplates(prev => prev.filter(t => t.id !== id))
        } catch (err) {
            alert(err.response?.data?.error || err.message)
        }
    }

    const handleApply = async (id) => {
        try {
            const res = await axios.post(`${API_BASE}/admin/templates/${id}/apply`, {
                adminId: 'admin-001',
                adminName: 'Admin'
            })
            alert(res.data.message)
        } catch (err) {
            alert(err.response?.data?.error || err.message)
        }
    }

    const viewTemplate = async (id) => {
        try {
            const res = await axios.get(`${API_BASE}/admin/templates/${id}`)
            setSelectedTemplate(res.data)
        } catch (err) {
            alert('Failed to load template details')
        }
    }

    if (loading) return <div className="loading-spinner" />

    return (
        <div>
            <div style={sectionHeader}>
                <h2 style={{ margin: 0, color: 'var(--text)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Layers size={20} color="#06b6d4" /> Problem Set Templates
                </h2>
                <button onClick={() => setShowCreate(true)} style={buttonPrimary}>
                    <Plus size={16} /> New Template
                </button>
            </div>

            {/* Template Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                {templates.map(t => (
                    <div key={t.id} style={{ ...cardStyle, position: 'relative', overflow: 'hidden' }}>
                        <div style={{
                            position: 'absolute', top: 0, right: 0, width: '100px', height: '100px',
                            background: 'radial-gradient(circle at top right, rgba(6, 182, 212, 0.1), transparent 70%)'
                        }} />
                        <div style={{ position: 'relative', zIndex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                <div>
                                    <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '1rem' }}>{t.name}</h3>
                                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t.description || 'No description'}</p>
                                </div>
                                <span style={badgeStyle('#06b6d4')}>{t.difficulty}</span>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                <span style={badgeStyle('#3b82f6')}><FileText size={10} /> {t.problemCount || 0} problems</span>
                                {(Array.isArray(t.tags) ? t.tags : []).map((tag, i) => (
                                    <span key={i} style={badgeStyle('#8b5cf6')}>{tag}</span>
                                ))}
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button onClick={() => viewTemplate(t.id)} style={{ ...buttonSecondary, flex: 1, justifyContent: 'center', padding: '0.5rem' }}>
                                    <Eye size={14} /> View
                                </button>
                                <button onClick={() => handleApply(t.id)} style={{ ...buttonPrimary, flex: 1, justifyContent: 'center', padding: '0.5rem' }}>
                                    <Play size={14} /> Apply
                                </button>
                                <button onClick={() => handleDelete(t.id)} style={{ ...buttonDanger, padding: '0.5rem' }}>
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {templates.length === 0 && (
                    <div style={{ ...cardStyle, gridColumn: '1 / -1', textAlign: 'center', padding: '3rem' }}>
                        <Layers size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.3 }} />
                        <p style={{ color: 'var(--text-muted)' }}>No templates yet. Create your first problem set template!</p>
                    </div>
                )}
            </div>

            {/* Create Modal */}
            {showCreate && (
                <div style={modalOverlay} onClick={() => setShowCreate(false)}>
                    <div style={modalContent} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, color: 'var(--text)' }}>Create Problem Set Template</h3>
                            <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        <div style={{ display: 'grid', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>Template Name</label>
                                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Beginner Python Set" style={inputStyle} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>Description</label>
                                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe this template..." style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>Difficulty</label>
                                    <select value={form.difficulty} onChange={e => setForm(p => ({ ...p, difficulty: e.target.value }))} style={selectStyle}>
                                        <option value="Mixed">Mixed</option>
                                        <option value="Easy">Easy</option>
                                        <option value="Medium">Medium</option>
                                        <option value="Hard">Hard</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>Tags (comma-separated)</label>
                                    <input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} placeholder="python, loops, basics" style={inputStyle} />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>
                                    Select Problems ({form.problemIds.length} selected)
                                </label>
                                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.5rem' }}>
                                    {problems.map(p => (
                                        <label key={p.id} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            padding: '0.4rem 0.5rem', borderRadius: '6px', cursor: 'pointer',
                                            background: form.problemIds.includes(p.id) ? 'rgba(6, 182, 212, 0.08)' : 'transparent'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={form.problemIds.includes(p.id)}
                                                onChange={e => {
                                                    setForm(prev => ({
                                                        ...prev,
                                                        problemIds: e.target.checked
                                                            ? [...prev.problemIds, p.id]
                                                            : prev.problemIds.filter(id => id !== p.id)
                                                    }))
                                                }}
                                                style={{ accentColor: '#06b6d4' }}
                                            />
                                            <span style={{ color: 'var(--text)', fontSize: '0.82rem' }}>{p.title}</span>
                                            <span style={{ marginLeft: 'auto', ...badgeStyle('#6b7280') }}>{p.difficulty}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowCreate(false)} style={buttonSecondary}>Cancel</button>
                            <button onClick={handleCreate} disabled={!form.name} style={{ ...buttonPrimary, opacity: !form.name ? 0.5 : 1 }}>
                                <Save size={16} /> Create Template
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View Template Modal */}
            {selectedTemplate && (
                <div style={modalOverlay} onClick={() => setSelectedTemplate(null)}>
                    <div style={modalContent} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div>
                                <h3 style={{ margin: 0, color: 'var(--text)' }}>{selectedTemplate.name}</h3>
                                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{selectedTemplate.description}</p>
                            </div>
                            <button onClick={() => setSelectedTemplate(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            <span style={badgeStyle('#06b6d4')}>{selectedTemplate.difficulty}</span>
                            {(selectedTemplate.tags || []).map((tag, i) => (
                                <span key={i} style={badgeStyle('#8b5cf6')}>{tag}</span>
                            ))}
                        </div>

                        <h4 style={{ color: 'var(--text)', marginBottom: '0.75rem' }}>Problems ({selectedTemplate.problems?.length || 0})</h4>
                        {(selectedTemplate.problems || []).map((p, i) => (
                            <div key={p.id} style={{
                                display: 'flex', alignItems: 'center', gap: '0.75rem',
                                padding: '0.75rem', borderRadius: '10px', marginBottom: '0.5rem',
                                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)'
                            }}>
                                <span style={{
                                    width: '28px', height: '28px', borderRadius: '8px',
                                    background: 'rgba(6, 182, 212, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 700, fontSize: '0.75rem', color: '#06b6d4'
                                }}>{i + 1}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.85rem' }}>{p.title}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{p.language} · {p.difficulty}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ==================== 70. AUTOMATED BACKUPS ====================
function AutomatedBackups() {
    const [backups, setBackups] = useState([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)

    useEffect(() => {
        axios.get(`${API_BASE}/admin/backups`).then(res => {
            setBackups(res.data)
            setLoading(false)
        }).catch(() => setLoading(false))
    }, [])

    const createBackup = async () => {
        setCreating(true)
        try {
            const res = await axios.post(`${API_BASE}/admin/backups`, {
                adminId: 'admin-001',
                adminName: 'Admin'
            })
            setBackups(prev => [{
                id: res.data.backupId,
                status: 'completed',
                backup_type: 'full',
                fileSizeFormatted: res.data.fileSize,
                tables_backed_up: res.data.tables,
                created_at: new Date()
            }, ...prev])
        } catch (err) {
            alert('Backup failed: ' + (err.response?.data?.error || err.message))
        }
        setCreating(false)
    }

    const deleteBackup = async (id) => {
        if (!window.confirm('Delete this backup?')) return
        try {
            await axios.delete(`${API_BASE}/admin/backups/${id}`)
            setBackups(prev => prev.filter(b => b.id !== id))
        } catch (err) {
            alert('Error: ' + err.message)
        }
    }

    const downloadBackup = (id) => {
        window.open(`${API_BASE}/admin/backups/${id}/download`, '_blank')
    }

    if (loading) return <div className="loading-spinner" />

    return (
        <div>
            <div style={sectionHeader}>
                <h2 style={{ margin: 0, color: 'var(--text)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Database size={20} color="#10b981" /> Database Backups
                </h2>
                <button onClick={createBackup} disabled={creating} style={buttonPrimary}>
                    {creating ? <RefreshCw size={16} className="spin" /> : <Archive size={16} />}
                    {creating ? 'Creating Backup...' : 'Create Backup Now'}
                </button>
            </div>

            <div style={{ ...cardStyle, marginBottom: '1.5rem', background: 'rgba(16, 185, 129, 0.05)', borderLeft: '4px solid #10b981' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Info size={18} color="#10b981" />
                    <div>
                        <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.85rem' }}>Full Database Backup</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Creates a complete JSON export of all database tables. Download to keep a secure copy.
                        </div>
                    </div>
                </div>
            </div>

            {/* Backup List */}
            <div style={cardStyle}>
                {backups.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem' }}>
                        <Database size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.3 }} />
                        <p style={{ color: 'var(--text-muted)' }}>No backups yet. Create your first backup!</p>
                    </div>
                ) : backups.map(b => (
                    <div key={b.id} style={{
                        display: 'flex', alignItems: 'center', gap: '1rem',
                        padding: '1rem', borderRadius: '12px',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        transition: 'background 0.15s'
                    }}>
                        <div style={{
                            width: '42px', height: '42px', borderRadius: '12px',
                            background: b.status === 'completed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            {b.status === 'completed' ? <CheckCircle size={20} color="#10b981" /> : <Clock size={20} color="#f59e0b" />}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.85rem' }}>
                                    {b.backup_type === 'full' ? 'Full Backup' : 'Partial Backup'}
                                </span>
                                <StatusBadge status={b.status} />
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                                {new Date(b.created_at).toLocaleString()} · {b.fileSizeFormatted || 'N/A'}
                                {b.tables_backed_up && ` · ${Array.isArray(b.tables_backed_up) ? b.tables_backed_up.length : 0} tables`}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => downloadBackup(b.id)} style={buttonSecondary} title="Download">
                                <Download size={14} />
                            </button>
                            <button onClick={() => deleteBackup(b.id)} style={{ ...buttonDanger, padding: '0.5rem 0.75rem' }} title="Delete">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ==================== 71. DATA EXPORT TOOLS ====================
function DataExportTools() {
    const [exporting, setExporting] = useState(null)

    const exportTypes = [
        { id: 'students', label: 'Students', description: 'All student profiles with batch and mentor info', icon: <Users size={24} />, color: '#3b82f6' },
        { id: 'submissions', label: 'Code Submissions', description: 'All coding submissions with scores and statuses', icon: <FileText size={24} />, color: '#8b5cf6' },
        { id: 'problems', label: 'Problems', description: 'All coding problems with difficulty and language', icon: <Globe size={24} />, color: '#06b6d4' },
        { id: 'allocations', label: 'Allocations', description: 'Mentor-student allocation mappings', icon: <Users size={24} />, color: '#10b981' },
        { id: 'aptitude-submissions', label: 'Aptitude Submissions', description: 'All aptitude test submissions and scores', icon: <BarChart2 size={24} />, color: '#f59e0b' },
        { id: 'audit-logs', label: 'Audit Logs', description: 'System audit trail (last 5000 entries)', icon: <Shield size={24} />, color: '#ef4444' },
    ]

    const handleExport = async (type, format) => {
        setExporting(type)
        try {
            const url = `${API_BASE}/admin/export/${type}?format=${format}&adminId=admin-001&adminName=Admin`

            if (format === 'json') {
                const res = await axios.get(url)
                const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
                const objectUrl = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = objectUrl
                a.download = `${type}_export.json`
                a.click()
                URL.revokeObjectURL(objectUrl)
            } else {
                const res = await axios.get(url, { responseType: 'blob' })
                const objectUrl = URL.createObjectURL(res.data)
                const a = document.createElement('a')
                a.href = objectUrl
                a.download = `${type}_export.csv`
                a.click()
                URL.revokeObjectURL(objectUrl)
            }
        } catch (err) {
            alert('Export failed: ' + (err.response?.data?.error || err.message))
        }
        setExporting(null)
    }

    return (
        <div>
            <div style={sectionHeader}>
                <h2 style={{ margin: 0, color: 'var(--text)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Download size={20} color="#f59e0b" /> Data Export Tools
                </h2>
            </div>

            <div style={{ ...cardStyle, marginBottom: '1.5rem', background: 'rgba(245, 158, 11, 0.05)', borderLeft: '4px solid #f59e0b' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Info size={18} color="#f59e0b" />
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        Export data in CSV (spreadsheet-compatible) or JSON format. CSV files can be opened in Excel, Google Sheets, etc.
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                {exportTypes.map(et => (
                    <div key={et.id} style={{ ...cardStyle, position: 'relative', overflow: 'hidden' }}>
                        <div style={{
                            position: 'absolute', bottom: '-20px', right: '-20px', width: '100px', height: '100px',
                            background: `radial-gradient(circle, ${et.color}15, transparent 70%)`
                        }} />
                        <div style={{ position: 'relative', zIndex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                <div style={{
                                    width: '48px', height: '48px', borderRadius: '12px',
                                    background: `${et.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {React.cloneElement(et.icon, { color: et.color })}
                                </div>
                                <div>
                                    <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: '0.95rem' }}>{et.label}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{et.description}</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => handleExport(et.id, 'csv')}
                                    disabled={exporting === et.id}
                                    style={{ ...buttonSecondary, flex: 1, justifyContent: 'center', padding: '0.5rem' }}
                                >
                                    {exporting === et.id ? <RefreshCw size={14} className="spin" /> : <Download size={14} />} CSV
                                </button>
                                <button
                                    onClick={() => handleExport(et.id, 'json')}
                                    disabled={exporting === et.id}
                                    style={{ ...buttonPrimary, flex: 1, justifyContent: 'center', padding: '0.5rem' }}
                                >
                                    {exporting === et.id ? <RefreshCw size={14} className="spin" /> : <Download size={14} />} JSON
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ==================== 72. ADMIN ANALYTICS ====================
function AdminAnalytics() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        axios.get(`${API_BASE}/admin/analytics/comprehensive`)
            .then(res => { setData(res.data); setLoading(false) })
            .catch(() => setLoading(false))
    }, [])

    if (loading) return <div className="loading-spinner" />
    if (!data) return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem' }}>Failed to load analytics</div>

    const weeklyIcon = data.weeklyGrowth >= 0
        ? <TrendingUp size={14} color="#10b981" />
        : <TrendingDown size={14} color="#ef4444" />

    return (
        <div>
            <div style={sectionHeader}>
                <h2 style={{ margin: 0, color: 'var(--text)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <BarChart2 size={20} color="#ec4899" /> Comprehensive Analytics
                </h2>
                <span style={badgeStyle(data.weeklyGrowth >= 0 ? '#10b981' : '#ef4444')}>
                    {weeklyIcon} {data.weeklyGrowth >= 0 ? '+' : ''}{data.weeklyGrowth}% weekly
                </span>
            </div>

            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                    { label: 'Students', value: data.userStats?.student || 0, color: '#3b82f6' },
                    { label: 'Mentors', value: data.userStats?.mentor || 0, color: '#8b5cf6' },
                    { label: 'Admins', value: data.userStats?.admin || 0, color: '#06b6d4' },
                    { label: 'This Week', value: data.thisWeekSubmissions, color: '#10b981' },
                    { label: 'Last Week', value: data.lastWeekSubmissions, color: '#f59e0b' },
                ].map((s, i) => (
                    <div key={i} style={{ ...cardStyle, borderTop: `3px solid ${s.color}` }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                {/* Submission Trends */}
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: 'var(--text)' }}>Submissions (30 Days)</h3>
                    {data.dailySubmissions?.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <AreaChart data={data.dailySubmissions}>
                                <defs>
                                    <linearGradient id="colorSubs" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', fontSize: '0.8rem' }} />
                                <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#colorSubs)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No data</p>}
                </div>

                {/* Language Distribution */}
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: 'var(--text)' }}>Language Distribution</h3>
                    {data.languageDistribution?.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie data={data.languageDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="count" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                    {data.languageDistribution.map((_, i) => (
                                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No data</p>}
                </div>

                {/* Hourly Activity */}
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: 'var(--text)' }}>Activity by Hour (7 Days)</h3>
                    {data.hourlyActivity?.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={data.hourlyActivity}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="hour" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }} />
                                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No data</p>}
                </div>

                {/* Difficulty Stats */}
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: 'var(--text)' }}>Difficulty Analysis</h3>
                    {data.difficultyStats?.length > 0 ? (
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            {data.difficultyStats.map((d, i) => (
                                <div key={i} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.85rem' }}>{d.difficulty}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{d.submissions} submissions</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
                                        <span style={{ color: '#3b82f6' }}>Avg: {d.avgScore}%</span>
                                        <span style={{ color: '#10b981' }}>Pass: {d.passRate}%</span>
                                    </div>
                                    <div style={{ height: '4px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '2px', marginTop: '0.5rem' }}>
                                        <div style={{ height: '100%', width: `${d.passRate}%`, background: d.passRate > 60 ? '#10b981' : d.passRate > 30 ? '#f59e0b' : '#ef4444', borderRadius: '2px' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No data</p>}
                </div>
            </div>

            {/* Top Students & Mentor Effectiveness */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                {/* Top Students */}
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: 'var(--text)' }}>Top Performing Students</h3>
                    {(data.topStudents || []).map((s, i) => (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            padding: '0.65rem', borderRadius: '8px',
                            borderBottom: '1px solid rgba(255,255,255,0.04)'
                        }}>
                            <span style={{
                                width: '28px', height: '28px', borderRadius: '8px',
                                background: i < 3 ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'rgba(107, 114, 128, 0.2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 700, fontSize: '0.75rem', color: i < 3 ? 'white' : 'var(--text-muted)'
                            }}>#{i + 1}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.82rem' }}>{s.name}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{s.batch || 'No batch'} · {s.totalSubmissions} submissions</div>
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: s.avgScore >= 70 ? '#10b981' : '#f59e0b' }}>
                                {s.avgScore}%
                            </div>
                        </div>
                    ))}
                    {(!data.topStudents || data.topStudents.length === 0) && (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No data</p>
                    )}
                </div>

                {/* Mentor Effectiveness */}
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: 'var(--text)' }}>Mentor Effectiveness</h3>
                    {(data.mentorStats || []).map((m, i) => (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            padding: '0.65rem', borderRadius: '8px',
                            borderBottom: '1px solid rgba(255,255,255,0.04)'
                        }}>
                            <div style={{
                                width: '28px', height: '28px', borderRadius: '50%',
                                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 700, fontSize: '0.7rem', color: 'white'
                            }}>{m.name?.[0] || '?'}</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: '0.82rem' }}>{m.name}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                    {m.studentCount} students · {m.totalStudentSubmissions} submissions
                                </div>
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: m.avgStudentScore >= 60 ? '#10b981' : '#f59e0b' }}>
                                {m.avgStudentScore}%
                            </div>
                        </div>
                    ))}
                    {(!data.mentorStats || data.mentorStats.length === 0) && (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No data</p>
                    )}
                </div>
            </div>

            {/* Batch Performance */}
            {data.batchPerformance?.length > 0 && (
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: 'var(--text)' }}>Batch Performance</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={data.batchPerformance}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="batch" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px' }} />
                            <Legend />
                            <Bar dataKey="avgScore" name="Avg Score" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="submissions" name="Submissions" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    )
}
