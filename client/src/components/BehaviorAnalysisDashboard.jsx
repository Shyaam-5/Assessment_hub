/**
 * BehaviorAnalysisDashboard — Admin UI for the Behavior Analysis Agent.
 *
 * Features:
 *  - Dashboard overview: total analyses, trust level distribution, avg trust score
 *  - Trust score gauge with color gradient
 *  - Recent flagged sessions with trust scores
 *  - Single session analysis trigger
 *  - Behavior report generation
 *  - Typing pattern, code progression, engagement, anomaly detail views
 *
 * Styled consistently with ProctorAgentDashboard (dark theme, slate palette).
 */

import { useState, useEffect } from 'react'
import {
    Shield, Brain, Activity, AlertTriangle, CheckCircle,
    Eye, Search, FileText, BarChart3, TrendingUp,
    Clock, Keyboard, Code2, MousePointer, AlertCircle, XCircle,
    ChevronRight, RefreshCw, Zap, Target, Trash2
} from 'lucide-react'
import axios from 'axios'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

// Format session ID as: user@email.com (last4) for admin readability
const formatSessionId = (session_id, user_id) => {
    const last4 = (session_id || '').slice(-4)
    return user_id ? `${user_id} (${last4})` : (session_id || '').slice(-12)
}


// ═══════════════════════════════════════════════════════════════
//  Colour & style helpers
// ═══════════════════════════════════════════════════════════════

const trustColors = {
    trusted: '#10b981',
    moderate: '#f59e0b',
    suspicious: '#f97316',
    untrusted: '#ef4444',
    no_data: '#64748b',
}

const trustLabels = {
    trusted: 'Trusted',
    moderate: 'Moderate',
    suspicious: 'Suspicious',
    untrusted: 'Untrusted',
    no_data: 'No Data',
}

const trustIcons = {
    trusted: <CheckCircle size={16} />,
    moderate: <AlertTriangle size={16} />,
    suspicious: <Eye size={16} />,
    untrusted: <AlertCircle size={16} />,
    no_data: <XCircle size={16} />,
}

function TrustBadge({ level }) {
    const color = trustColors[level] || '#64748b'
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 20,
            background: `${color}18`, color, fontWeight: 600, fontSize: '0.8rem',
            border: `1px solid ${color}44`,
        }}>
            {trustIcons[level]} {trustLabels[level] || level}
        </span>
    )
}

function TrustScoreGauge({ score, size = 140 }) {
    const radius = (size - 20) / 2
    const circumference = 2 * Math.PI * radius
    const progress = (score / 100) * circumference
    const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444'

    return (
        <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e293b" strokeWidth={8} />
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={8}
                    strokeDasharray={circumference} strokeDashoffset={circumference - progress}
                    strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
            </svg>
            <div style={{ position: 'absolute', textAlign: 'center' }}>
                <div style={{ fontSize: size * 0.25, fontWeight: 700, color }}>{score}</div>
                <div style={{ fontSize: size * 0.09, color: '#94a3b8', marginTop: 2 }}>Trust Score</div>
            </div>
        </div>
    )
}

function ScoreBar({ label, score, icon }) {
    const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444'
    return (
        <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ color: '#cbd5e1', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {icon} {label}
                </span>
                <span style={{ color, fontWeight: 600, fontSize: '0.85rem' }}>{score}/100</span>
            </div>
            <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
            </div>
        </div>
    )
}

// Card wrapper
const cardStyle = {
    background: '#0f172a',
    borderRadius: 12,
    border: '1px solid #1e293b',
    padding: '1.25rem',
    marginBottom: '1rem',
}

const btnStyle = {
    padding: '8px 16px', borderRadius: 8, border: 'none',
    fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6,
}

const inputStyle = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid #334155',
    background: '#1e293b', color: '#e2e8f0', fontSize: '0.85rem', flex: 1
}


// ═══════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════

export default function BehaviorAnalysisDashboard() {
    const [tab, setTab] = useState('dashboard')
    const [dashboard, setDashboard] = useState(null)
    const [analyses, setAnalyses] = useState([])
    const [loading, setLoading] = useState(false)

    // Analyze form
    const [analyzeForm, setAnalyzeForm] = useState({ session_id: '', user_id: '', exam_title: '', problem_difficulty: 'medium' })
    const [analyzeResult, setAnalyzeResult] = useState(null)
    const [autoRunProgress, setAutoRunProgress] = useState(null)

    // Report form
    const [reportForm, setReportForm] = useState({ session_id: '', user_id: '', exam_title: '', candidate_name: '' })
    const [reportResult, setReportResult] = useState(null)

    // Detail view
    const [detailId, setDetailId] = useState(null)
    const [detailData, setDetailData] = useState(null)

    // Available sessions (from behavior_events) for admin to select
    const [sessions, setSessions] = useState([])
    const [sessionsLoading, setSessionsLoading] = useState(false)

    useEffect(() => {
        fetchDashboard()
        fetchAnalyses()
    }, [])

    const fetchSessions = async () => {
        setSessionsLoading(true)
        try {
            const res = await axios.get(`${API_BASE}/behavior/sessions?limit=50`)
            setSessions(res.data.sessions || [])
        } catch (err) {
            console.error('Sessions fetch error:', err)
        } finally {
            setSessionsLoading(false)
        }
    }

    const selectSession = (s, formKey) => {
        const setForm = formKey === 'analyze' ? setAnalyzeForm : setReportForm
        setForm(prev => ({ ...prev, session_id: s.session_id, user_id: s.user_id || prev.user_id }))
    }

    // Auto-fetch sessions when switching to Analyze or Report tab
    useEffect(() => {
        if (tab === 'analyze' || tab === 'report') fetchSessions()
    }, [tab])

    const fetchDashboard = async () => {
        try {
            const res = await axios.get(`${API_BASE}/behavior/dashboard`)
            setDashboard(res.data)
        } catch (err) {
            console.error('Dashboard fetch error:', err)
        }
    }

    const fetchAnalyses = async () => {
        try {
            const res = await axios.get(`${API_BASE}/behavior/analyses?limit=50`)
            setAnalyses(res.data.analyses || [])
        } catch (err) {
            console.error('Analyses fetch error:', err)
        }
    }

    // ── Analyze session ──
    const runAnalysis = async () => {
        if (!analyzeForm.session_id) return
        setLoading(true)
        try {
            const res = await axios.post(`${API_BASE}/behavior/analyze`, analyzeForm)
            setAnalyzeResult(res.data)
            fetchDashboard()
            fetchAnalyses()
        } catch (err) {
            alert('Analysis failed: ' + (err.response?.data?.detail || err.message))
        } finally {
            setLoading(false)
        }
    }

    const runAllAnalyses = async () => {
        if (sessions.length === 0) return
        setLoading(true)
        setAutoRunProgress({ current: 0, total: sessions.length })
        let successCount = 0
        let failCount = 0

        try {
            for (let i = 0; i < sessions.length; i++) {
                const s = sessions[i]
                setAutoRunProgress({ current: i + 1, total: sessions.length, session_id: s.session_id })
                try {
                    const payload = {
                        session_id: s.session_id,
                        user_id: s.user_id || '',
                        exam_title: '',
                        problem_difficulty: 'medium'
                    }
                    const res = await axios.post(`${API_BASE}/behavior/analyze`, payload)
                    if (res.data) {
                        setAnalyzeResult(res.data)
                        successCount++
                    }
                } catch (e) {
                    console.error("Failed to analyze session:", s.session_id, e)
                    failCount++
                }
            }
            alert(`Auto-run complete. Analyzed ${successCount} successfully, ${failCount} failed.`)
            fetchDashboard()
            fetchAnalyses()
        } finally {
            setLoading(false)
            setAutoRunProgress(null)
        }
    }

    // ── Clear all data ──
    const clearAllData = async () => {
        if (!window.confirm("Are you sure you want to clear ALL behavior events and analyses? This cannot be undone.")) return;
        setLoading(true)
        try {
            await axios.delete(`${API_BASE}/behavior/clear`)
            alert('All behavior data cleared successfully.')
            fetchDashboard()
            fetchAnalyses()
            fetchSessions()
            setAnalyzeResult(null)
            setReportResult(null)
        } catch (err) {
            alert('Failed to clear data: ' + (err.response?.data?.detail || err.message))
        } finally {
            setLoading(false)
        }
    }

    // ── Generate report ──
    const generateReport = async () => {
        if (!reportForm.session_id) return
        setLoading(true)
        try {
            const res = await axios.post(`${API_BASE}/behavior/report`, reportForm)
            setReportResult(res.data)
        } catch (err) {
            alert('Report generation failed: ' + (err.response?.data?.detail || err.message))
        } finally {
            setLoading(false)
        }
    }

    // ── View detail ──
    const viewDetail = async (id) => {
        try {
            const res = await axios.get(`${API_BASE}/behavior/analysis/${id}`)
            setDetailData(res.data)
            setDetailId(id)
        } catch (err) {
            alert('Failed to load analysis detail')
        }
    }

    const tabs = [
        { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={16} /> },
        { id: 'analyze', label: 'Analyze Session', icon: <Brain size={16} /> },
        { id: 'report', label: 'Behavior Report', icon: <FileText size={16} /> },
    ]

    return (
        <div style={{ padding: '1.5rem', color: '#e2e8f0', maxWidth: 1200, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem' }}>
                <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Brain size={24} color="white" />
                </div>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Behavior Analysis Agent
                    </h2>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                        AI-powered behavioral profiling & trust scoring
                    </p>
                </div>
            </div>

            {/* Tab Bar */}
            <div style={{ display: 'flex', gap: 6, marginBottom: '1.5rem', background: '#0f172a', padding: 4, borderRadius: 10, border: '1px solid #1e293b' }}>
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={{
                        ...btnStyle,
                        background: tab === t.id ? 'linear-gradient(135deg, #06b6d4, #8b5cf6)' : 'transparent',
                        color: tab === t.id ? 'white' : '#94a3b8',
                        flex: 1, justifyContent: 'center',
                    }}>
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {tab === 'dashboard' && <DashboardTab dashboard={dashboard} analyses={analyses} onViewDetail={viewDetail} onRefresh={() => { fetchDashboard(); fetchAnalyses() }} />}
            {tab === 'analyze' && (
                <AnalyzeTab
                    form={analyzeForm}
                    setForm={setAnalyzeForm}
                    onRun={runAnalysis}
                    onRunAll={runAllAnalyses}
                    result={analyzeResult}
                    loading={loading}
                    autoRunProgress={autoRunProgress}
                    sessions={sessions}
                    sessionsLoading={sessionsLoading}
                    onFetchSessions={fetchSessions}
                    onSelectSession={(s) => selectSession(s, 'analyze')}
                    onClearData={clearAllData}
                />
            )}
            {tab === 'report' && (
                <ReportTab
                    form={reportForm}
                    setForm={setReportForm}
                    onGenerate={generateReport}
                    result={reportResult}
                    loading={loading}
                    sessions={sessions}
                    sessionsLoading={sessionsLoading}
                    onFetchSessions={fetchSessions}
                    onSelectSession={(s) => selectSession(s, 'report')}
                />
            )}

            {/* Detail modal */}
            {detailId && detailData && (
                <DetailModal data={detailData} onClose={() => { setDetailId(null); setDetailData(null) }} />
            )}
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
//  Dashboard Tab
// ═══════════════════════════════════════════════════════════════

function DashboardTab({ dashboard, analyses, onViewDetail, onRefresh }) {
    if (!dashboard) return <div style={{ textAlign: 'center', color: '#64748b', padding: '3rem' }}>Loading dashboard...</div>

    const dist = dashboard.trust_distribution || {}

    return (
        <div>
            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <BarChart3 size={18} color="#06b6d4" />
                        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Total Analyses</span>
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#06b6d4' }}>{dashboard.total_analyses || 0}</div>
                </div>
                <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <Target size={18} color="#10b981" />
                        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Avg Trust Score</span>
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: dashboard.average_trust_score >= 60 ? '#10b981' : '#f59e0b' }}>
                        {dashboard.average_trust_score || 0}
                    </div>
                </div>
                <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <CheckCircle size={18} color="#10b981" />
                        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Trusted</span>
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#10b981' }}>{dist.trusted || 0}</div>
                </div>
                <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <AlertTriangle size={18} color="#ef4444" />
                        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Flagged</span>
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ef4444' }}>
                        {(dist.suspicious || 0) + (dist.untrusted || 0)}
                    </div>
                </div>
            </div>

            {/* Trust Level Distribution */}
            <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc' }}>Trust Level Distribution</h3>
                    <button onClick={onRefresh} style={{ ...btnStyle, background: '#1e293b', color: '#94a3b8', padding: '6px 12px' }}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    {['trusted', 'moderate', 'suspicious', 'untrusted'].map(level => (
                        <div key={level} style={{ flex: 1, textAlign: 'center', padding: '1rem', background: '#1e293b', borderRadius: 8 }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: trustColors[level] }}>{dist[level] || 0}</div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>{trustLabels[level]}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recent Flagged Sessions */}
            {dashboard.recent_flagged && dashboard.recent_flagged.length > 0 && (
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={18} color="#f97316" /> Recently Flagged Sessions
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {dashboard.recent_flagged.map((s, i) => (
                            <div key={i} onClick={() => s.id && onViewDetail(s.id)} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '10px 14px', background: '#1e293b', borderRadius: 8,
                                cursor: 'pointer', transition: 'background 0.2s',
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = '#334155'}
                                onMouseLeave={e => e.currentTarget.style.background = '#1e293b'}
                            >
                                <div>
                                    <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 500 }}>{formatSessionId(s.session_id, s.user_id)}</span>
                                    {s.exam_title && <span style={{ color: '#64748b', fontSize: '0.75rem', marginLeft: 8 }}>{s.exam_title}</span>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontWeight: 700, color: s.trust_score < 40 ? '#ef4444' : '#f97316' }}>{s.trust_score}</span>
                                    <TrustBadge level={s.trust_level} />
                                    <ChevronRight size={14} color="#64748b" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent Analyses */}
            <div style={cardStyle}>
                <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#f8fafc' }}>Recent Analyses</h3>
                {analyses.length === 0 ? (
                    <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>No analyses yet. Use the "Analyze Session" tab to get started.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {analyses.slice(0, 15).map((a, i) => (
                            <div key={i} onClick={() => a.id && onViewDetail(a.id)} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '8px 12px', background: i % 2 === 0 ? '#0f172a' : '#1e293b',
                                borderRadius: 6, cursor: 'pointer',
                            }}>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontFamily: 'monospace' }}>{formatSessionId(a.session_id, a.user_id)}</span>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{a.user_id}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontWeight: 600, color: (trustColors[a.trust_level] || '#94a3b8'), fontSize: '0.9rem' }}>{a.trust_score}</span>
                                    <TrustBadge level={a.trust_level} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
//  Analyze Session Tab
// ═══════════════════════════════════════════════════════════════

function AnalyzeTab({ form, setForm, onRun, onRunAll, result, loading, autoRunProgress, sessions, sessionsLoading, onFetchSessions, onSelectSession, onClearData }) {
    return (
        <div>
            {/* Available sessions - admin can pick one */}
            <div style={cardStyle}>
                <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Search size={18} color="#64748b" /> Available Sessions
                </h3>
                <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#64748b' }}>
                    Sessions with behavior events. Click one to use its Session ID.
                </p>
                <div style={{ display: 'flex', gap: '10px', marginBottom: 12 }}>
                    <button
                        onClick={() => { onFetchSessions() }}
                        disabled={sessionsLoading}
                        style={{ ...btnStyle, background: '#1e293b', color: '#94a3b8' }}
                    >
                        {sessionsLoading ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />} Load Sessions
                    </button>
                    <button
                        onClick={onClearData}
                        disabled={loading}
                        style={{ ...btnStyle, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                    >
                        <Trash2 size={14} /> Clear All Data
                    </button>
                </div>
                {sessions.length === 0 && !sessionsLoading && (
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>No sessions yet. Students must complete a proctored coding session first.</p>
                )}
                {sessions.length > 0 && (
                    <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {sessions.map((s, i) => (
                            <div
                                key={s.session_id || i}
                                onClick={() => onSelectSession(s)}
                                style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '10px 12px', background: form.session_id === s.session_id ? '#334155' : '#1e293b',
                                    borderRadius: 8, cursor: 'pointer', border: form.session_id === s.session_id ? '1px solid #06b6d4' : '1px solid transparent',
                                }}
                            >
                                <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#e2e8f0', wordBreak: 'break-all' }}>
                                    {s.session_id}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', flexShrink: 0, marginLeft: 8, whiteSpace: 'nowrap' }}>
                                    {s.user_id} • {s.event_count} events • {new Date(s.last_event).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={cardStyle}>
                <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Brain size={18} color="#06b6d4" /> Analyze Session Behavior
                </h3>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <input placeholder="Session ID" value={form.session_id} onChange={e => setForm({ ...form, session_id: e.target.value })} style={inputStyle} title="Or select from Available Sessions above" />
                    <input placeholder="User ID (optional)" value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} style={{ ...inputStyle, flex: 0.7 }} />
                    <input placeholder="Exam Title (optional)" value={form.exam_title} onChange={e => setForm({ ...form, exam_title: e.target.value })} style={{ ...inputStyle, flex: 0.7 }} />
                    <select value={form.problem_difficulty} onChange={e => setForm({ ...form, problem_difficulty: e.target.value })} style={{ ...inputStyle, flex: 0.4 }}>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                    </select>
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <button onClick={onRun} disabled={loading || !form.session_id} style={{
                        ...btnStyle, background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)', color: 'white',
                        opacity: (loading || !form.session_id) ? 0.5 : 1, flex: 1, justifyContent: 'center'
                    }}>
                        {loading && !autoRunProgress ? <><RefreshCw size={16} className="spin" /> Analyzing...</> : <><Zap size={16} /> Run for Selected Session</>}
                    </button>

                    <button onClick={onRunAll} disabled={loading || sessions.length === 0} style={{
                        ...btnStyle, background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white',
                        opacity: (loading || sessions.length === 0) ? 0.5 : 1, flex: 1, justifyContent: 'center'
                    }}>
                        {loading && autoRunProgress ? <><RefreshCw size={16} className="spin" /> Analyzing ({autoRunProgress.current}/{autoRunProgress.total})...</> : <><Target size={16} /> Auto-Run All Available Sessions</>}
                    </button>
                </div>
            </div>

            {/* Results */}
            {result && (
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 16px', color: '#f8fafc' }}>Analysis Result</h3>

                    {/* Trust Score */}
                    <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', marginBottom: 20 }}>
                        <TrustScoreGauge score={result.trust_score || 0} size={160} />
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                <TrustBadge level={result.trust_level} />
                                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
                                    {result.total_events || 0} events analyzed • {Math.round((result.session_duration_sec || 0) / 60)}min session
                                </span>
                            </div>

                            <ScoreBar label="Typing Naturalness" score={result.score_components?.typing_naturalness || 0} icon={<Keyboard size={14} />} />
                            <ScoreBar label="Code Progression" score={result.score_components?.code_progression || 0} icon={<Code2 size={14} />} />
                            <ScoreBar label="Engagement" score={result.score_components?.engagement || 0} icon={<MousePointer size={14} />} />
                            <ScoreBar label="Anomaly Score" score={result.score_components?.anomaly_score || 0} icon={<AlertTriangle size={14} />} />
                        </div>
                    </div>

                    {/* AI Insights */}
                    {result.ai_insights && (
                        <div style={{ background: '#1e293b', borderRadius: 8, padding: '1rem', marginBottom: 16, border: '1px solid #334155' }}>
                            <h4 style={{ margin: '0 0 8px', color: '#06b6d4', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Brain size={15} /> AI Behavioral Insights
                            </h4>
                            {result.ai_insights.behavioral_summary && (
                                <p style={{ color: '#cbd5e1', fontSize: '0.85rem', margin: '0 0 8px', lineHeight: 1.6 }}>{result.ai_insights.behavioral_summary}</p>
                            )}
                            {result.ai_insights.risk_factors && result.ai_insights.risk_factors.length > 0 && (
                                <div style={{ marginTop: 8 }}>
                                    <span style={{ color: '#ef4444', fontSize: '0.8rem', fontWeight: 600 }}>Risk Factors:</span>
                                    <ul style={{ margin: '4px 0 0', paddingLeft: 16, color: '#f87171', fontSize: '0.8rem' }}>
                                        {result.ai_insights.risk_factors.map((f, i) => <li key={i}>{f}</li>)}
                                    </ul>
                                </div>
                            )}
                            {result.ai_insights.mitigating_factors && result.ai_insights.mitigating_factors.length > 0 && (
                                <div style={{ marginTop: 8 }}>
                                    <span style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 600 }}>Mitigating Factors:</span>
                                    <ul style={{ margin: '4px 0 0', paddingLeft: 16, color: '#4ade80', fontSize: '0.8rem' }}>
                                        {result.ai_insights.mitigating_factors.map((f, i) => <li key={i}>{f}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Anomalies */}
                    {result.anomalies && result.anomalies.anomalies && result.anomalies.anomalies.length > 0 && (
                        <div style={{ background: 'rgba(239,68,68,0.05)', borderRadius: 8, padding: '1rem', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <h4 style={{ margin: '0 0 8px', color: '#ef4444', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <AlertCircle size={15} /> Detected Anomalies ({result.anomalies.anomaly_count})
                            </h4>
                            {result.anomalies.anomalies.map((a, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                    padding: '8px 0', borderBottom: i < result.anomalies.anomalies.length - 1 ? '1px solid rgba(239,68,68,0.1)' : 'none',
                                }}>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600,
                                        background: a.severity === 'critical' ? '#ef444433' : a.severity === 'high' ? '#f9731633' : '#f59e0b33',
                                        color: a.severity === 'critical' ? '#ef4444' : a.severity === 'high' ? '#f97316' : '#f59e0b',
                                    }}>{a.severity}</span>
                                    <span style={{ color: '#e2e8f0', fontSize: '0.82rem' }}>{a.description}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Detail sections */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: 16 }}>
                        {/* Typing */}
                        {result.typing_analysis && (
                            <div style={{ background: '#1e293b', borderRadius: 8, padding: '1rem', border: '1px solid #334155' }}>
                                <h4 style={{ margin: '0 0 8px', color: '#8b5cf6', fontSize: '0.85rem' }}><Keyboard size={14} /> Typing Analysis</h4>
                                <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.8 }}>
                                    <div>WPM: <strong>{result.typing_analysis.avg_wpm}</strong></div>
                                    <div>Keystrokes: <strong>{result.typing_analysis.total_keystrokes}</strong></div>
                                    <div>Rhythm CV: <strong>{result.typing_analysis.rhythm_consistency}</strong></div>
                                    <div>Bursts: <strong>{result.typing_analysis.burst_count}</strong></div>
                                    <div>Idle Gaps: <strong>{result.typing_analysis.idle_gaps}</strong></div>
                                    <div>Assessment: <strong style={{ color: trustColors[result.typing_analysis.assessment === 'natural' ? 'trusted' : 'suspicious'] }}>{result.typing_analysis.assessment}</strong></div>
                                </div>
                            </div>
                        )}
                        {/* Code Progression */}
                        {result.code_progression && (
                            <div style={{ background: '#1e293b', borderRadius: 8, padding: '1rem', border: '1px solid #334155' }}>
                                <h4 style={{ margin: '0 0 8px', color: '#06b6d4', fontSize: '0.85rem' }}><Code2 size={14} /> Code Progression</h4>
                                <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.8 }}>
                                    <div>Lines/min: <strong>{result.code_progression.growth_rate_lpm}</strong></div>
                                    <div>Final Lines: <strong>{result.code_progression.final_line_count}</strong></div>
                                    <div>Max Jump: <strong>{result.code_progression.max_jump}</strong> lines</div>
                                    <div>Suspicious Jumps: <strong>{result.code_progression.suspicious_jumps}</strong></div>
                                    <div>Backtrack Ratio: <strong>{result.code_progression.backtrack_ratio}</strong></div>
                                    <div>Assessment: <strong style={{ color: trustColors[result.code_progression.assessment === 'organic' ? 'trusted' : 'suspicious'] }}>{result.code_progression.assessment}</strong></div>
                                </div>
                            </div>
                        )}
                        {/* Engagement */}
                        {result.engagement_metrics && (
                            <div style={{ background: '#1e293b', borderRadius: 8, padding: '1rem', border: '1px solid #334155' }}>
                                <h4 style={{ margin: '0 0 8px', color: '#10b981', fontSize: '0.85rem' }}><MousePointer size={14} /> Engagement</h4>
                                <div style={{ fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.8 }}>
                                    <div>Active Ratio: <strong>{(result.engagement_metrics.active_ratio * 100).toFixed(1)}%</strong></div>
                                    <div>Events/min: <strong>{result.engagement_metrics.interaction_density}</strong></div>
                                    <div>Focus Switches: <strong>{result.engagement_metrics.focus_switches}</strong></div>
                                    <div>Idle Periods: <strong>{result.engagement_metrics.idle_periods}</strong></div>
                                    <div>Assessment: <strong style={{ color: trustColors[result.engagement_metrics.assessment === 'engaged' ? 'trusted' : 'suspicious'] }}>{result.engagement_metrics.assessment}</strong></div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
//  Report Tab
// ═══════════════════════════════════════════════════════════════

function ReportTab({ form, setForm, onGenerate, result, loading, sessions, sessionsLoading, onFetchSessions, onSelectSession }) {
    return (
        <div>
            {/* Available sessions */}
            <div style={cardStyle}>
                <h3 style={{ margin: '0 0 12px', fontSize: '0.95rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Search size={18} color="#64748b" /> Available Sessions
                </h3>
                <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#64748b' }}>
                    Click a session to use its Session ID for the report.
                </p>
                <button
                    onClick={() => onFetchSessions()}
                    disabled={sessionsLoading}
                    style={{ ...btnStyle, background: '#1e293b', color: '#94a3b8', marginBottom: 12 }}
                >
                    {sessionsLoading ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />} Load Sessions
                </button>
                {sessions.length === 0 && !sessionsLoading && (
                    <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>No sessions yet. Students must complete a proctored coding session first.</p>
                )}
                {sessions.length > 0 && (
                    <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {sessions.map((s, i) => (
                            <div
                                key={s.session_id || i}
                                onClick={() => onSelectSession(s)}
                                style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '10px 12px', background: form.session_id === s.session_id ? '#334155' : '#1e293b',
                                    borderRadius: 8, cursor: 'pointer', border: form.session_id === s.session_id ? '1px solid #8b5cf6' : '1px solid transparent',
                                }}
                            >
                                <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#e2e8f0', wordBreak: 'break-all' }}>
                                    {s.session_id}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', flexShrink: 0, marginLeft: 8 }}>
                                    {s.user_id} • {s.event_count} events
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={cardStyle}>
                <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={18} color="#8b5cf6" /> Generate Behavior Report
                </h3>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <input placeholder="Session ID" value={form.session_id} onChange={e => setForm({ ...form, session_id: e.target.value })} style={inputStyle} title="Or select from Available Sessions above" />
                    <input placeholder="User ID" value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} style={{ ...inputStyle, flex: 0.7 }} />
                    <input placeholder="Candidate Name" value={form.candidate_name} onChange={e => setForm({ ...form, candidate_name: e.target.value })} style={{ ...inputStyle, flex: 0.7 }} />
                    <input placeholder="Exam Title" value={form.exam_title} onChange={e => setForm({ ...form, exam_title: e.target.value })} style={{ ...inputStyle, flex: 0.7 }} />
                </div>
                <button onClick={onGenerate} disabled={loading || !form.session_id} style={{
                    ...btnStyle, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: 'white',
                    opacity: (loading || !form.session_id) ? 0.5 : 1,
                }}>
                    {loading ? <><RefreshCw size={16} /> Generating...</> : <><FileText size={16} /> Generate Report</>}
                </button>
            </div>

            {result && result.report && (
                <div style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                        <TrustScoreGauge score={result.trust_score || 0} size={90} />
                        <div>
                            <TrustBadge level={result.trust_level} />
                            <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: 4 }}>
                                {result.candidate_name || result.user_id} • {result.exam_title || 'Assessment'}
                            </div>
                        </div>
                    </div>

                    {Object.entries(result.report).map(([key, value]) => {
                        if (key === 'confidence' || typeof value !== 'string') return null
                        return (
                            <div key={key} style={{ marginBottom: 16 }}>
                                <h4 style={{ margin: '0 0 6px', color: '#06b6d4', fontSize: '0.85rem', textTransform: 'capitalize' }}>
                                    {key.replace(/_/g, ' ')}
                                </h4>
                                <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.7 }}>{value}</p>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
//  Detail Modal
// ═══════════════════════════════════════════════════════════════

function DetailModal({ data, onClose }) {
    // Parse stored JSON fields
    const typing = typeof data.typing_json === 'string' ? JSON.parse(data.typing_json || '{}') : (data.typing_json || {})
    const progression = typeof data.progression_json === 'string' ? JSON.parse(data.progression_json || '{}') : (data.progression_json || {})
    const engagement = typeof data.engagement_json === 'string' ? JSON.parse(data.engagement_json || '{}') : (data.engagement_json || {})
    const anomalies = typeof data.anomalies_json === 'string' ? JSON.parse(data.anomalies_json || '{}') : (data.anomalies_json || {})
    const aiInsights = typeof data.ai_insights_json === 'string' ? JSON.parse(data.ai_insights_json || '{}') : (data.ai_insights_json || {})

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={onClose}>
            <div style={{
                background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16,
                maxWidth: 700, width: '90%', maxHeight: '85vh', overflowY: 'auto',
                padding: '2rem', position: 'relative',
            }} onClick={e => e.stopPropagation()}>
                <button onClick={onClose} style={{
                    position: 'absolute', top: 16, right: 16,
                    background: '#334155', border: 'none', color: '#94a3b8',
                    padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                }}>✕</button>

                <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Brain size={20} color="#06b6d4" /> Behavior Analysis Detail
                </h3>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                    <TrustScoreGauge score={data.trust_score || 0} size={100} />
                    <div>
                        <TrustBadge level={data.trust_level} />
                        <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: 6 }}>
                            Session: {data.session_id}
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                            {data.user_id} • {data.exam_title || 'N/A'} • {data.created_at}
                        </div>
                    </div>
                </div>

                {/* Component Scores */}
                <ScoreBar label="Typing Naturalness" score={typing.score || 0} icon={<Keyboard size={14} />} />
                <ScoreBar label="Code Progression" score={progression.score || 0} icon={<Code2 size={14} />} />
                <ScoreBar label="Engagement" score={engagement.score || 0} icon={<MousePointer size={14} />} />
                <ScoreBar label="Anomaly Score" score={anomalies.score || 0} icon={<AlertTriangle size={14} />} />

                {/* AI Summary */}
                {aiInsights.behavioral_summary && (
                    <div style={{ background: '#1e293b', borderRadius: 8, padding: '1rem', marginTop: 16, border: '1px solid #334155' }}>
                        <h4 style={{ margin: '0 0 6px', color: '#06b6d4', fontSize: '0.85rem' }}>AI Summary</h4>
                        <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.82rem', lineHeight: 1.6 }}>{aiInsights.behavioral_summary}</p>
                    </div>
                )}

                {/* Anomalies List */}
                {anomalies.anomalies && anomalies.anomalies.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                        <h4 style={{ margin: '0 0 8px', color: '#ef4444', fontSize: '0.85rem' }}>Anomalies</h4>
                        {anomalies.anomalies.map((a, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', fontSize: '0.8rem', color: '#e2e8f0' }}>
                                <span style={{
                                    padding: '1px 6px', borderRadius: 3, fontSize: '0.7rem', fontWeight: 600,
                                    background: a.severity === 'critical' ? '#ef444433' : '#f9731633',
                                    color: a.severity === 'critical' ? '#ef4444' : '#f97316',
                                }}>{a.severity}</span>
                                {a.description}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
