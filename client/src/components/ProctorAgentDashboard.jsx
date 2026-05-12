/**
 * ProctorAgentDashboard — Admin UI for the Proctoring Intelligence Agent.
 *
 * Features:
 *  - Dashboard overview: total analyses, risk distribution, average fraud score
 *  - Recent flagged sessions list with fraud scores and risk badges
 *  - Single session analysis trigger
 *  - Batch analysis for multiple sessions
 *  - Integrity report generation and viewer
 *  - Collusion detection between sessions
 *  - Detailed analysis viewer with AI reasoning traces
 */

import { useState, useEffect, useCallback } from 'react'
import {
    Shield, AlertTriangle, Eye, FileText, Users, Activity,
    Search, RefreshCw, Brain, Zap, Target, BarChart2,
    ChevronRight, X, Check, Clock, Download, Play,
    AlertCircle, CheckCircle, XCircle, TrendingUp, Ban
} from 'lucide-react'
import axios from 'axios'
import socketService from '../services/socketService'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

// ═══════════════════════════════════════════════════════════════
//  Colour & style helpers
// ═══════════════════════════════════════════════════════════════

const riskColors = {
    clean: '#10b981',
    warn: '#f59e0b',
    flag_for_review: '#f97316',
    critical: '#ef4444',
    terminate: '#dc2626',
}

const riskLabels = {
    clean: 'Clean',
    warn: 'Warning',
    flag_for_review: 'Needs Review',
    critical: 'Critical',
    terminate: 'Terminate',
}

const riskIcons = {
    clean: <CheckCircle size={16} />,
    warn: <AlertTriangle size={16} />,
    flag_for_review: <Eye size={16} />,
    critical: <AlertCircle size={16} />,
    terminate: <XCircle size={16} />,
}

// Format session ID as: user@email.com (last4) for admin readability
const formatSessionId = (session_id, user_id) => {
    const last4 = (session_id || '').slice(-4)
    return user_id ? `${user_id} (${last4})` : (session_id || '').slice(-12)
}

function RiskBadge({ level }) {
    const color = riskColors[level] || '#6b7280'
    const label = riskLabels[level] || level
    const icon = riskIcons[level] || null
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600,
            background: color + '22', color, border: `1px solid ${color}44`
        }}>
            {icon} {label}
        </span>
    )
}

function FraudScoreBar({ score }) {
    const color = score >= 80 ? '#dc2626' : score >= 60 ? '#ef4444' : score >= 35 ? '#f97316' : score >= 15 ? '#f59e0b' : '#10b981'
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
            <div style={{ flex: 1, height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(score, 100)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
            </div>
            <span style={{ fontWeight: 700, fontSize: '0.8rem', color, minWidth: 35, textAlign: 'right' }}>{score}</span>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════
//  Card wrappers
// ═══════════════════════════════════════════════════════════════

const cardStyle = {
    background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12,
    padding: 20, marginBottom: 16
}

const statCardStyle = {
    ...cardStyle,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minWidth: 160, textAlign: 'center'
}

const btnPrimary = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 8, border: 'none',
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff',
    fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
    transition: 'opacity 0.2s', opacity: 1,
}

const btnOutline = {
    ...btnPrimary,
    background: 'transparent', border: '1px solid #334155', color: '#94a3b8'
}

const inputStyle = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid #334155',
    background: '#1e293b', color: '#e2e8f0', fontSize: '0.85rem', flex: 1
}

// ═══════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════

export default function ProctorAgentDashboard() {
    const [tab, setTab] = useState('dashboard')
    const [dashboard, setDashboard] = useState(null)
    const [analyses, setAnalyses] = useState([])
    const [loading, setLoading] = useState(false)
    const [selectedAnalysis, setSelectedAnalysis] = useState(null)
    const [selectedReport, setSelectedReport] = useState(null)

    // Single analysis form
    const [analyzeForm, setAnalyzeForm] = useState({ session_id: '', source: 'comm', user_id: '', exam_title: '' })
    const [analyzeResult, setAnalyzeResult] = useState(null)

    // Batch form
    const [batchIds, setBatchIds] = useState('')
    const [batchSource, setBatchSource] = useState('comm')
    const [batchResults, setBatchResults] = useState(null)

    // Report form
    const [reportForm, setReportForm] = useState({ session_id: '', source: 'comm', user_id: '', exam_title: '', candidate_name: '' })
    const [reportResult, setReportResult] = useState(null)

    // Collusion form
    const [collusionIds, setCollusionIds] = useState('')
    const [collusionSource, setCollusionSource] = useState('comm')
    const [collusionResult, setCollusionResult] = useState(null)

    // ── Fetch dashboard data ──
    const fetchDashboard = useCallback(async () => {
        try {
            setLoading(true)
            const [dashRes, listRes] = await Promise.all([
                axios.get(`${API_BASE}/proctor-agent/dashboard`),
                axios.get(`${API_BASE}/proctor-agent/analyses?limit=50`),
            ])
            setDashboard(dashRes.data)
            setAnalyses(listRes.data.analyses || [])
        } catch (err) {
            console.error('Failed to load agent dashboard:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchDashboard() }, [fetchDashboard])

    // ── Real-time agent alerts via Socket.io ──
    const [liveAlerts, setLiveAlerts] = useState([])
    useEffect(() => {
        socketService.connect()
        socketService.joinMonitoring('admin-agent', 'admin')
        socketService.on('agent_alert', (data) => {
            setLiveAlerts(prev => [{ ...data, receivedAt: new Date().toISOString() }, ...prev.slice(0, 19)])
            // Auto-refresh dashboard data
            fetchDashboard()
        })
        return () => {
            socketService.removeListener('agent_alert')
        }
    }, [fetchDashboard])

    // ── Analyze single session ──
    const runAnalysis = async () => {
        if (!analyzeForm.session_id.trim()) return
        try {
            setLoading(true)
            const res = await axios.post(`${API_BASE}/proctor-agent/analyze`, analyzeForm)
            setAnalyzeResult(res.data)
            fetchDashboard()
        } catch (err) {
            alert('Analysis failed: ' + (err.response?.data?.detail || err.message))
        } finally {
            setLoading(false)
        }
    }

    // ── Batch analyze ──
    const runBatch = async () => {
        const ids = batchIds.split(/[,\n]+/).map(s => s.trim()).filter(Boolean)
        if (!ids.length) return
        try {
            setLoading(true)
            const res = await axios.post(`${API_BASE}/proctor-agent/analyze/batch`, { session_ids: ids, source: batchSource })
            setBatchResults(res.data)
            fetchDashboard()
        } catch (err) {
            alert('Batch analysis failed: ' + (err.response?.data?.detail || err.message))
        } finally {
            setLoading(false)
        }
    }

    // ── Generate report ──
    const generateReport = async () => {
        if (!reportForm.session_id.trim()) return
        try {
            setLoading(true)
            const res = await axios.post(`${API_BASE}/proctor-agent/report`, reportForm)
            setReportResult(res.data)
        } catch (err) {
            alert('Report generation failed: ' + (err.response?.data?.detail || err.message))
        } finally {
            setLoading(false)
        }
    }

    // ── Collusion detection ──
    const runCollusion = async () => {
        const ids = collusionIds.split(/[,\n]+/).map(s => s.trim()).filter(Boolean)
        if (ids.length < 2) { alert('Enter at least 2 session IDs'); return }
        try {
            setLoading(true)
            const res = await axios.post(`${API_BASE}/proctor-agent/collusion`, { session_ids: ids, source: collusionSource })
            setCollusionResult(res.data)
        } catch (err) {
            alert('Collusion detection failed: ' + (err.response?.data?.detail || err.message))
        } finally {
            setLoading(false)
        }
    }

    // ── Terminate a student session ──
    const terminateSession = async (sessionId, userId, reason) => {
        if (!confirm(`Terminate session ${sessionId?.slice(0, 16)}?\nThis will immediately end the student's test.`)) return
        try {
            await axios.post(`${API_BASE}/proctor-agent/terminate`, {
                session_id: sessionId,
                user_id: userId || null,
                reason: reason || 'Manually terminated by admin via Proctor Agent Dashboard'
            })
            alert('Session terminated successfully.')
        } catch (err) {
            alert('Terminate failed: ' + (err.response?.data?.detail || err.message))
        }
    }

    // ── Fetch full analysis detail ──
    const viewAnalysis = async (id) => {
        try {
            const res = await axios.get(`${API_BASE}/proctor-agent/analysis/${id}`)
            setSelectedAnalysis(res.data)
        } catch (err) {
            alert('Failed to load analysis: ' + (err.response?.data?.detail || err.message))
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  Tabs
    // ═══════════════════════════════════════════════════════════

    const tabs = [
        { key: 'dashboard', label: 'Dashboard', icon: <BarChart2 size={16} /> },
        { key: 'analyze', label: 'Analyze Session', icon: <Search size={16} /> },
        { key: 'batch', label: 'Batch Analysis', icon: <Users size={16} /> },
        { key: 'report', label: 'Integrity Report', icon: <FileText size={16} /> },
        { key: 'collusion', label: 'Collusion Detect', icon: <Shield size={16} /> },
    ]

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <Brain size={22} color="#fff" />
                </div>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#f1f5f9' }}>Proctoring Intelligence Agent</h2>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>AI-powered fraud detection & exam integrity analysis</p>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <button onClick={fetchDashboard} style={btnOutline} disabled={loading}>
                        <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
                    </button>
                </div>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap', borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
                {tabs.map(t => (
                    <button key={t.key}
                        onClick={() => setTab(t.key)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '8px 14px', borderRadius: 8, border: 'none',
                            background: tab === t.key ? '#1e293b' : 'transparent',
                            color: tab === t.key ? '#f1f5f9' : '#64748b',
                            fontWeight: tab === t.key ? 600 : 400, fontSize: '0.85rem',
                            cursor: 'pointer', transition: 'all 0.2s'
                        }}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* Live agent alerts */}
            {liveAlerts.length > 0 && (
                <div style={{
                    background: '#1e293b', border: '1px solid #7c2d12', borderRadius: 10,
                    padding: '10px 14px', marginBottom: 16
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f97316', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Zap size={14} /> Live Agent Alerts ({liveAlerts.length})
                        </span>
                        <button onClick={() => setLiveAlerts([])} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.7rem' }}>Clear</button>
                    </div>
                    {liveAlerts.slice(0, 5).map((a, i) => (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0',
                            borderTop: i > 0 ? '1px solid #334155' : 'none', fontSize: '0.78rem'
                        }}>
                            <RiskBadge level={a.risk_level} />
                            <span style={{ color: '#e2e8f0', fontFamily: 'monospace', fontSize: '0.72rem' }}>{formatSessionId(a.session_id, a.user_id)}</span>
                            <span style={{ color: '#94a3b8' }}>Score: <b style={{ color: a.fraud_score >= 60 ? '#ef4444' : '#f59e0b' }}>{a.fraud_score}</b></span>
                            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>{a.recommended_action}</span>
                            {(a.risk_level === 'terminate' || a.risk_level === 'critical' || a.recommended_action?.toLowerCase().includes('terminate')) && (
                                <button onClick={() => terminateSession(a.session_id, a.user_id, `Agent alert: ${a.risk_level} risk, score ${a.fraud_score}`)}
                                    style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '2px 8px', fontSize: '0.68rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                                    <Ban size={10} /> Terminate
                                </button>
                            )}
                            <span style={{ color: '#475569', fontSize: '0.68rem', marginLeft: 'auto' }}>
                                {a.receivedAt ? new Date(a.receivedAt).toLocaleTimeString() : ''}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Tab content */}
            {tab === 'dashboard' && <DashboardTab dashboard={dashboard} analyses={analyses} onViewAnalysis={viewAnalysis} onTerminate={terminateSession} />}
            {tab === 'analyze' && (
                <AnalyzeTab form={analyzeForm} setForm={setAnalyzeForm} onRun={runAnalysis} result={analyzeResult} loading={loading} />
            )}
            {tab === 'batch' && (
                <BatchTab ids={batchIds} setIds={setBatchIds} source={batchSource} setSource={setBatchSource}
                    onRun={runBatch} results={batchResults} loading={loading} onViewAnalysis={viewAnalysis} />
            )}
            {tab === 'report' && (
                <ReportTab form={reportForm} setForm={setReportForm} onGenerate={generateReport} result={reportResult} loading={loading} />
            )}
            {tab === 'collusion' && (
                <CollusionTab ids={collusionIds} setIds={setCollusionIds} source={collusionSource}
                    setSource={setCollusionSource} onRun={runCollusion} result={collusionResult} loading={loading} />
            )}

            {/* Analysis detail modal */}
            {selectedAnalysis && (
                <AnalysisDetailModal data={selectedAnalysis} onClose={() => setSelectedAnalysis(null)} onTerminate={terminateSession} />
            )}

            {/* Report detail modal */}
            {selectedReport && (
                <ReportDetailModal data={selectedReport} onClose={() => setSelectedReport(null)} />
            )}
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
//  Dashboard Tab
// ═══════════════════════════════════════════════════════════════

function DashboardTab({ dashboard, analyses, onViewAnalysis, onTerminate }) {
    if (!dashboard) return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div className="loading-spinner" />
        </div>
    )

    const { total_analyses, average_fraud_score, risk_distribution, recent_flagged } = dashboard

    if (total_analyses === 0) {
        return (
            <div style={{ ...cardStyle, textAlign: 'center', padding: '50px 30px' }}>
                <Shield size={48} color="#3b82f6" style={{ marginBottom: 16, opacity: 0.6 }} />
                <h3 style={{ color: '#f1f5f9', margin: '0 0 8px' }}>No Analyses Yet</h3>
                <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 20px', maxWidth: 480, marginInline: 'auto' }}>
                    The Proctoring Intelligence Agent hasn't analyzed any sessions yet.
                    Go to the <strong style={{ color: '#94a3b8' }}>Analyze Session</strong> tab to run your first analysis
                    on an exam session, or use <strong style={{ color: '#94a3b8' }}>Batch Analysis</strong> to review multiple sessions at once.
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <div style={{ padding: '10px 16px', borderRadius: 8, background: '#1e293b', fontSize: '0.8rem', color: '#94a3b8' }}>
                        <Search size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Analyze individual sessions
                    </div>
                    <div style={{ padding: '10px 16px', borderRadius: 8, background: '#1e293b', fontSize: '0.8rem', color: '#94a3b8' }}>
                        <Users size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Batch analyze multiple exams
                    </div>
                    <div style={{ padding: '10px 16px', borderRadius: 8, background: '#1e293b', fontSize: '0.8rem', color: '#94a3b8' }}>
                        <FileText size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Generate integrity reports
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div>
            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                <div style={statCardStyle}>
                    <Activity size={24} color="#3b82f6" />
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#f1f5f9', marginTop: 8 }}>{total_analyses}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Analyses</div>
                </div>
                <div style={statCardStyle}>
                    <Target size={24} color={average_fraud_score > 35 ? '#ef4444' : '#10b981'} />
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#f1f5f9', marginTop: 8 }}>{average_fraud_score}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Avg Fraud Score</div>
                </div>
                {Object.entries(risk_distribution).map(([level, count]) => (
                    <div key={level} style={statCardStyle}>
                        <div style={{ color: riskColors[level] || '#6b7280' }}>{riskIcons[level] || <Shield size={24} />}</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#f1f5f9', marginTop: 8 }}>{count}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{riskLabels[level] || level}</div>
                    </div>
                ))}
            </div>

            {/* Recent flagged sessions */}
            {recent_flagged && recent_flagged.length > 0 && (
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={18} color="#f97316" /> Flagged Sessions
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                                    {['Session', 'User', 'Exam', 'Fraud Score', 'Risk', 'Action', 'Time', ''].map(h => (
                                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 500 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {recent_flagged.map(r => (
                                    <tr key={r.id} style={{ borderBottom: '1px solid #1e293b22' }}>
                                        <td style={{ padding: '8px 10px', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                            {formatSessionId(r.session_id, r.user_id)}
                                        </td>
                                        <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{r.user_id || '—'}</td>
                                        <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{r.exam_title || '—'}</td>
                                        <td style={{ padding: '8px 10px' }}><FraudScoreBar score={r.fraud_score} /></td>
                                        <td style={{ padding: '8px 10px' }}><RiskBadge level={r.risk_level} /></td>
                                        <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{r.recommended_action || '—'}</td>
                                        <td style={{ padding: '8px 10px', color: '#64748b', fontSize: '0.7rem' }}>
                                            {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                                        </td>
                                        <td style={{ padding: '8px 10px', display: 'flex', gap: 4 }}>
                                            <button onClick={() => onViewAnalysis(r.id)} style={{ ...btnOutline, padding: '4px 10px', fontSize: '0.7rem' }}>
                                                <Eye size={12} /> View
                                            </button>
                                            <button onClick={() => onTerminate(r.session_id, r.user_id, `Flagged session: ${r.risk_level}, score ${r.fraud_score}`)}
                                                style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                                                <Ban size={12} /> End
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* All recent analyses */}
            <div style={cardStyle}>
                <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={18} color="#3b82f6" /> Recent Analyses
                </h3>
                {analyses.length === 0 ? (
                    <p style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>
                        No analyses yet. Use the "Analyze Session" tab to run your first analysis.
                    </p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                                    {['#', 'Session', 'Source', 'User', 'Score', 'Risk', 'Action', 'Time', ''].map(h => (
                                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 500 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {analyses.map(a => (
                                    <tr key={a.id} style={{ borderBottom: '1px solid #1e293b22' }}>
                                        <td style={{ padding: '8px 10px', color: '#64748b' }}>{a.id}</td>
                                        <td style={{ padding: '8px 10px', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                            {formatSessionId(a.session_id, a.user_id)}
                                        </td>
                                        <td style={{ padding: '8px 10px', color: '#94a3b8', textTransform: 'capitalize' }}>{a.source}</td>
                                        <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{a.user_id || '—'}</td>
                                        <td style={{ padding: '8px 10px' }}><FraudScoreBar score={a.fraud_score} /></td>
                                        <td style={{ padding: '8px 10px' }}><RiskBadge level={a.risk_level} /></td>
                                        <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{a.recommended_action || '—'}</td>
                                        <td style={{ padding: '8px 10px', color: '#64748b', fontSize: '0.7rem' }}>
                                            {a.created_at ? new Date(a.created_at).toLocaleString() : '—'}
                                        </td>
                                        <td style={{ padding: '8px 10px', display: 'flex', gap: 4 }}>
                                            <button onClick={() => onViewAnalysis(a.id)} style={{ ...btnOutline, padding: '4px 10px', fontSize: '0.7rem' }}>
                                                <Eye size={12} /> View
                                            </button>
                                            {(a.risk_level === 'terminate' || a.risk_level === 'critical') && (
                                                <button onClick={() => onTerminate(a.session_id, a.user_id, `Analysis #${a.id}: ${a.risk_level}, score ${a.fraud_score}`)}
                                                    style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                                                    <Ban size={12} /> End
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
//  Analyze Single Session Tab
// ═══════════════════════════════════════════════════════════════

function AnalyzeTab({ form, setForm, onRun, result, loading }) {
    return (
        <div>
            <div style={cardStyle}>
                <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Search size={18} color="#3b82f6" /> Analyze a Session
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: 16 }}>
                    Enter a session/attempt ID to run the Proctoring Intelligence Agent. The agent will analyze all
                    proctoring events, detect compound fraud patterns, compute a fraud score, and use AI to reason about intent.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Session / Attempt ID *</label>
                        <input value={form.session_id} onChange={e => setForm(f => ({ ...f, session_id: e.target.value }))} style={inputStyle} placeholder="e.g. abc123-def456" />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Source</label>
                        <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} style={inputStyle}>
                            <option value="comm">Communication Tests</option>
                            <option value="skill">Skill Tests</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>User ID (optional)</label>
                        <input value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} style={inputStyle} placeholder="student-001" />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Exam Title (optional)</label>
                        <input value={form.exam_title} onChange={e => setForm(f => ({ ...f, exam_title: e.target.value }))} style={inputStyle} placeholder="Final Exam 2025" />
                    </div>
                </div>
                <button onClick={onRun} style={btnPrimary} disabled={loading || !form.session_id.trim()}>
                    {loading ? <RefreshCw size={14} className="spin" /> : <Play size={14} />} Run Analysis
                </button>
            </div>

            {result && <AnalysisResultCard result={result} />}
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
//  Batch Analysis Tab
// ═══════════════════════════════════════════════════════════════

function BatchTab({ ids, setIds, source, setSource, onRun, results, loading, onViewAnalysis }) {
    return (
        <div>
            <div style={cardStyle}>
                <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Users size={18} color="#8b5cf6" /> Batch Session Analysis
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: 16 }}>
                    Analyze multiple exam sessions at once. Enter session IDs separated by commas or newlines.
                    Results will be sorted by fraud score (highest first).
                </p>
                <textarea value={ids} onChange={e => setIds(e.target.value)}
                    style={{ ...inputStyle, height: 100, resize: 'vertical', fontFamily: 'monospace' }}
                    placeholder="session-id-1, session-id-2, session-id-3..."
                />
                <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
                    <select value={source} onChange={e => setSource(e.target.value)} style={{ ...inputStyle, flex: 'none', width: 180 }}>
                        <option value="comm">Communication Tests</option>
                        <option value="skill">Skill Tests</option>
                    </select>
                    <button onClick={onRun} style={btnPrimary} disabled={loading || !ids.trim()}>
                        {loading ? <RefreshCw size={14} className="spin" /> : <Zap size={14} />} Analyze All
                    </button>
                </div>
            </div>

            {results && (
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#f1f5f9' }}>
                        Batch Results — {results.count} sessions analyzed
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                                    {['Session', 'Score', 'Risk', 'Action', 'Patterns', ''].map(h => (
                                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 500 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(results.analyses || []).map(a => (
                                    <tr key={a.session_id || a.error} style={{ borderBottom: '1px solid #1e293b22' }}>
                                        <td style={{ padding: '8px 10px', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                            {formatSessionId(a.session_id, a.user_id)}
                                        </td>
                                        <td style={{ padding: '8px 10px' }}>
                                            {a.error ? <span style={{ color: '#ef4444' }}>Error</span> : <FraudScoreBar score={a.fraud_score} />}
                                        </td>
                                        <td style={{ padding: '8px 10px' }}>{a.risk_level ? <RiskBadge level={a.risk_level} /> : '—'}</td>
                                        <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{a.recommended_action || '—'}</td>
                                        <td style={{ padding: '8px 10px', color: '#94a3b8' }}>
                                            {a.patterns_detected?.length || 0}
                                        </td>
                                        <td style={{ padding: '8px 10px' }}>
                                            {a.analysis_id && (
                                                <button onClick={() => onViewAnalysis(a.analysis_id)} style={{ ...btnOutline, padding: '4px 10px', fontSize: '0.7rem' }}>
                                                    <Eye size={12} /> View
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
//  Integrity Report Tab
// ═══════════════════════════════════════════════════════════════

function ReportTab({ form, setForm, onGenerate, result, loading }) {
    return (
        <div>
            <div style={cardStyle}>
                <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={18} color="#10b981" /> Generate Integrity Report
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: 16 }}>
                    Generate a comprehensive, auditable integrity report for a completed exam session.
                    Suitable for university exam boards and HR compliance reviews.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 16 }}>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Session ID *</label>
                        <input value={form.session_id} onChange={e => setForm(f => ({ ...f, session_id: e.target.value }))} style={inputStyle} placeholder="session-id" />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Source</label>
                        <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} style={inputStyle}>
                            <option value="comm">Communication Tests</option>
                            <option value="skill">Skill Tests</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Candidate Name</label>
                        <input value={form.candidate_name} onChange={e => setForm(f => ({ ...f, candidate_name: e.target.value }))} style={inputStyle} placeholder="John Doe" />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>Exam Title</label>
                        <input value={form.exam_title} onChange={e => setForm(f => ({ ...f, exam_title: e.target.value }))} style={inputStyle} placeholder="Final Assessment" />
                    </div>
                </div>
                <button onClick={onGenerate} style={{ ...btnPrimary, background: 'linear-gradient(135deg, #10b981, #059669)' }} disabled={loading || !form.session_id.trim()}>
                    {loading ? <RefreshCw size={14} className="spin" /> : <FileText size={14} />} Generate Report
                </button>
            </div>

            {result && <IntegrityReportCard data={result} />}
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
//  Collusion Detection Tab
// ═══════════════════════════════════════════════════════════════

function CollusionTab({ ids, setIds, source, setSource, onRun, result, loading }) {
    return (
        <div>
            <div style={cardStyle}>
                <h3 style={{ margin: '0 0 16px', fontSize: '1rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Shield size={18} color="#f97316" /> Collusion Detection
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: 16 }}>
                    Detect potential collusion between exam takers by analyzing timing patterns across sessions.
                    Enter at least 2 session IDs (e.g. all sessions from the same exam room).
                </p>
                <textarea value={ids} onChange={e => setIds(e.target.value)}
                    style={{ ...inputStyle, height: 100, resize: 'vertical', fontFamily: 'monospace' }}
                    placeholder="session-id-1, session-id-2, session-id-3, session-id-4..."
                />
                <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
                    <select value={source} onChange={e => setSource(e.target.value)} style={{ ...inputStyle, flex: 'none', width: 180 }}>
                        <option value="comm">Communication Tests</option>
                        <option value="skill">Skill Tests</option>
                    </select>
                    <button onClick={onRun} style={{ ...btnPrimary, background: 'linear-gradient(135deg, #f97316, #ea580c)' }} disabled={loading || !ids.trim()}>
                        {loading ? <RefreshCw size={14} className="spin" /> : <Shield size={14} />} Detect Collusion
                    </button>
                </div>
            </div>

            {result && (
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#f1f5f9' }}>
                        Collusion Results — {result.sessions_analyzed} sessions analyzed
                    </h3>
                    {result.total_suspicious_pairs === 0 ? (
                        <div style={{ textAlign: 'center', padding: 30, color: '#10b981' }}>
                            <CheckCircle size={32} style={{ marginBottom: 8 }} />
                            <p style={{ fontWeight: 600, margin: 0 }}>No collusion patterns detected</p>
                            <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '4px 0 0' }}>All sessions appear independent</p>
                        </div>
                    ) : (
                        <div>
                            <div style={{ padding: '10px 14px', background: '#f9731622', borderRadius: 8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AlertTriangle size={16} color="#f97316" />
                                <span style={{ color: '#f97316', fontWeight: 600, fontSize: '0.85rem' }}>
                                    {result.total_suspicious_pairs} suspicious pair(s) detected
                                </span>
                            </div>
                            {result.collusion_clusters.map((c, i) => (
                                <div key={i} style={{ ...cardStyle, background: '#1e293b', marginBottom: 10 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>Pair #{i + 1}</span>
                                        <RiskBadge level={c.suspicion_level === 'high' ? 'critical' : 'warn'} />
                                    </div>
                                    <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0 0 6px' }}>
                                        Sessions: <code style={{ color: '#3b82f6' }}>{c.sessions.join(', ')}</code>
                                    </p>
                                    <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0 }}>{c.description}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
//  Shared Result Cards
// ═══════════════════════════════════════════════════════════════

function AnalysisResultCard({ result }) {
    const ai = result.ai_analysis || {}
    return (
        <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Brain size={18} color="#8b5cf6" /> Analysis Result
                </h3>
                <RiskBadge level={result.risk_level} />
            </div>

            {/* Score summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: result.fraud_score >= 60 ? '#ef4444' : result.fraud_score >= 35 ? '#f97316' : '#10b981' }}>
                        {result.fraud_score}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Fraud Score /100</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#3b82f6' }}>{result.total_events || 0}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Total Events</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#f97316' }}>{result.patterns_detected?.length || 0}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Patterns Found</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#e2e8f0', marginTop: 8 }}>{result.recommended_action}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Recommended Action</div>
                </div>
            </div>

            {/* Score components */}
            {result.score_components && (
                <div style={{ background: '#1e293b', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#94a3b8' }}>Score Breakdown</h4>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                        {Object.entries(result.score_components).map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'capitalize' }}>{k.replace('_', ' ')}:</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>{v}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Event summary */}
            {result.event_summary && Object.keys(result.event_summary).length > 0 && (
                <div style={{ background: '#1e293b', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#94a3b8' }}>Event Breakdown</h4>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {Object.entries(result.event_summary).map(([type, count]) => (
                            <span key={type} style={{
                                padding: '3px 10px', borderRadius: 12, fontSize: '0.72rem',
                                background: '#334155', color: '#e2e8f0'
                            }}>
                                {type}: <strong>{count}</strong>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Patterns detected */}
            {result.patterns_detected && result.patterns_detected.length > 0 && (
                <div style={{ background: '#1e293b', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#f97316' }}>Fraud Patterns Detected</h4>
                    {result.patterns_detected.map((p, i) => (
                        <div key={i} style={{ padding: '8px 12px', background: '#0f172a', borderRadius: 8, marginBottom: 6, borderLeft: `3px solid ${p.severity === 'critical' ? '#ef4444' : '#f97316'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2e8f0' }}>{p.pattern}</span>
                                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                    Confidence: {Math.round((p.confidence || 0) * 100)}%
                                </span>
                            </div>
                            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>{p.description}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* AI Reasoning */}
            {ai.reasoning && (
                <div style={{ background: '#1e293b', borderRadius: 8, padding: 12 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Brain size={14} /> AI Reasoning
                    </h4>
                    <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#e2e8f0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {ai.reasoning}
                    </p>
                    {ai.key_findings && ai.key_findings.length > 0 && (
                        <>
                            <h5 style={{ margin: '8px 0 4px', fontSize: '0.75rem', color: '#94a3b8' }}>Key Findings:</h5>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                                {ai.key_findings.map((f, i) => (
                                    <li key={i} style={{ fontSize: '0.75rem', color: '#e2e8f0', marginBottom: 3 }}>{f}</li>
                                ))}
                            </ul>
                        </>
                    )}
                    {ai.evidence_summary && (
                        <p style={{ margin: '10px 0 0', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                            {ai.evidence_summary}
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}


function IntegrityReportCard({ data }) {
    const report = data.report || {}
    const sections = [
        { key: 'executive_summary', label: 'Executive Summary', icon: <FileText size={14} />, color: '#3b82f6' },
        { key: 'session_overview', label: 'Session Overview', icon: <Clock size={14} />, color: '#06b6d4' },
        { key: 'violation_analysis', label: 'Violation Analysis', icon: <AlertTriangle size={14} />, color: '#f97316' },
        { key: 'pattern_analysis', label: 'Pattern Analysis', icon: <Target size={14} />, color: '#8b5cf6' },
        { key: 'risk_assessment', label: 'Risk Assessment', icon: <Shield size={14} />, color: '#ef4444' },
        { key: 'recommendation', label: 'Recommendation', icon: <CheckCircle size={14} />, color: '#10b981' },
        { key: 'evidence_log', label: 'Evidence Log', icon: <Eye size={14} />, color: '#64748b' },
    ]

    const downloadReport = () => {
        const lines = [
            `EXAM INTEGRITY REPORT`,
            `${'='.repeat(50)}`,
            `Generated: ${data.generated_at ? new Date(data.generated_at).toLocaleString() : new Date().toLocaleString()}`,
            `Session: ${data.session_id || '—'}`,
            `Candidate: ${data.candidate_name || data.user_id || '—'}`,
            `Exam: ${data.exam_title || '—'}`,
            `Fraud Score: ${data.fraud_score}/100`,
            `Risk Level: ${data.risk_level}`,
            `Verdict: ${report.overall_verdict || '—'}`,
            `Confidence: ${report.confidence ? Math.round(report.confidence * 100) + '%' : '—'}`,
            '',
        ]
        sections.forEach(s => {
            if (report[s.key]) {
                lines.push(`${s.label.toUpperCase()}`, `${'-'.repeat(40)}`, report[s.key], '')
            }
        })
        const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `integrity-report-${data.session_id || 'unknown'}.txt`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={18} color="#10b981" /> Integrity Report
                </h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={downloadReport} style={{ ...btnOutline, padding: '5px 12px', fontSize: '0.75rem' }}>
                        <Download size={12} /> Export
                    </button>
                    <RiskBadge level={data.risk_level} />
                    <FraudScoreBar score={data.fraud_score} />
                </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', fontSize: '0.8rem', color: '#94a3b8' }}>
                {data.candidate_name && <span>Candidate: <strong style={{ color: '#e2e8f0' }}>{data.candidate_name}</strong></span>}
                {data.exam_title && <span>| Exam: <strong style={{ color: '#e2e8f0' }}>{data.exam_title}</strong></span>}
                {report.overall_verdict && <span>| Verdict: <strong style={{ color: riskColors[report.overall_verdict] || '#e2e8f0' }}>{report.overall_verdict}</strong></span>}
            </div>

            {sections.map(s => report[s.key] && (
                <div key={s.key} style={{ background: '#1e293b', borderRadius: 8, padding: 14, marginBottom: 10, borderLeft: `3px solid ${s.color}` }}>
                    <h4 style={{ margin: '0 0 6px', fontSize: '0.82rem', color: s.color, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {s.icon} {s.label}
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#e2e8f0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {report[s.key]}
                    </p>
                </div>
            ))}
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
//  Analysis Detail Modal
// ═══════════════════════════════════════════════════════════════

function AnalysisDetailModal({ data, onClose, onTerminate }) {
    const fullResult = data.full_result_json || {}
    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 20
        }} onClick={onClose}>
            <div style={{
                background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16,
                maxWidth: 800, width: '100%', maxHeight: '85vh', overflowY: 'auto',
                padding: 24
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, color: '#f1f5f9' }}>Analysis #{data.id}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Basic info */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, fontSize: '0.8rem' }}>
                    <div style={{ color: '#64748b' }}>Session: <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{data.session_id}</span></div>
                    <div style={{ color: '#64748b' }}>Source: <span style={{ color: '#e2e8f0' }}>{data.source}</span></div>
                    <div style={{ color: '#64748b' }}>User: <span style={{ color: '#e2e8f0' }}>{data.user_id || '—'}</span></div>
                    <div style={{ color: '#64748b' }}>Exam: <span style={{ color: '#e2e8f0' }}>{data.exam_title || '—'}</span></div>
                </div>

                {/* Score + risk */}
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
                    <FraudScoreBar score={data.fraud_score} />
                    <RiskBadge level={data.risk_level} />
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Action: {data.recommended_action}</span>
                </div>

                {/* Patterns */}
                {data.patterns_json && data.patterns_json.length > 0 && (
                    <div style={{ background: '#1e293b', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#f97316' }}>Detected Patterns</h4>
                        {data.patterns_json.map((p, i) => (
                            <div key={i} style={{ padding: 6, borderBottom: i < data.patterns_json.length - 1 ? '1px solid #334155' : 'none' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.78rem', color: '#e2e8f0' }}>{p.pattern}</span>
                                <span style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: 8 }}>
                                    ({Math.round((p.confidence || 0) * 100)}% confidence)
                                </span>
                                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>{p.description}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* AI Analysis */}
                {data.ai_analysis_json && data.ai_analysis_json.reasoning && (
                    <div style={{ background: '#1e293b', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Brain size={14} /> AI Reasoning
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: '#e2e8f0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                            {data.ai_analysis_json.reasoning}
                        </p>
                        {data.ai_analysis_json.key_findings && (
                            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.75rem', color: '#94a3b8' }}>
                                {data.ai_analysis_json.key_findings.map((f, i) => <li key={i}>{f}</li>)}
                            </ul>
                        )}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                    <div style={{ fontSize: '0.7rem', color: '#475569' }}>
                        Analyzed at: {data.created_at ? new Date(data.created_at).toLocaleString() : '—'}
                    </div>
                    {(data.risk_level === 'terminate' || data.risk_level === 'critical') && onTerminate && (
                        <button onClick={() => { onTerminate(data.session_id, data.user_id, `Analysis #${data.id}: ${data.risk_level}, score ${data.fraud_score}`); onClose() }}
                            style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                            <Ban size={16} /> Terminate Session
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}


function ReportDetailModal({ data, onClose }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 20
        }} onClick={onClose}>
            <div style={{
                background: '#0f172a', border: '1px solid #1e293b', borderRadius: 16,
                maxWidth: 800, width: '100%', maxHeight: '85vh', overflowY: 'auto',
                padding: 24
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, color: '#f1f5f9' }}>Integrity Report</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                </div>
                <IntegrityReportCard data={data} />
            </div>
        </div>
    )
}
