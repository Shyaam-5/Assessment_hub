import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { MessageCircle, Send, Edit, Trash2, X, Save, Code, AlertCircle, CheckCircle, Info, ChevronDown, ChevronUp, User, Clock, Filter } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '1.5rem', transition: 'all 0.3s ease' }
const inputStyle = { width: '100%', padding: '0.7rem 1rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }
const buttonPrimary = { padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }
const buttonSecondary = { ...buttonPrimary, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }

const feedbackTypeConfig = {
    suggestion: { color: '#3b82f6', icon: Info, label: 'Suggestion' },
    issue: { color: '#ef4444', icon: AlertCircle, label: 'Issue' },
    praise: { color: '#10b981', icon: CheckCircle, label: 'Praise' },
    question: { color: '#f59e0b', icon: MessageCircle, label: 'Question' }
}

export default function InlineCodeFeedback({ submissionId, code, mentorId, studentId, readOnly = false }) {
    const [feedbacks, setFeedbacks] = useState([])
    const [showAddForm, setShowAddForm] = useState(null) // line number
    const [formData, setFormData] = useState({ comment: '', feedbackType: 'suggestion' })
    const [editingId, setEditingId] = useState(null)
    const [expandedLines, setExpandedLines] = useState(new Set())
    const [filterType, setFilterType] = useState('')
    const [loading, setLoading] = useState(false)

    const fetchFeedback = useCallback(async () => {
        if (!submissionId) return
        setLoading(true)
        try {
            const res = await axios.get(`${API_BASE}/feedback/submission/${submissionId}`)
            setFeedbacks(res.data.data || [])
            const lines = new Set()
                ; (res.data.data || []).forEach(f => lines.add(f.line_number))
            setExpandedLines(lines)
        } catch (err) { console.error(err) }
        setLoading(false)
    }, [submissionId])

    useEffect(() => { fetchFeedback() }, [fetchFeedback])

    const addFeedback = async (lineNumber) => {
        if (!formData.comment.trim()) return
        try {
            await axios.post(`${API_BASE}/feedback`, {
                submissionId, mentorId, studentId,
                lineNumber, comment: formData.comment,
                feedbackType: formData.feedbackType
            })
            setShowAddForm(null)
            setFormData({ comment: '', feedbackType: 'suggestion' })
            fetchFeedback()
        } catch (err) { console.error(err) }
    }

    const updateFeedback = async (id) => {
        try {
            await axios.put(`${API_BASE}/feedback/${id}`, { comment: formData.comment, feedbackType: formData.feedbackType })
            setEditingId(null)
            setFormData({ comment: '', feedbackType: 'suggestion' })
            fetchFeedback()
        } catch (err) { console.error(err) }
    }

    const deleteFeedback = async (id) => {
        try { await axios.delete(`${API_BASE}/feedback/${id}`); fetchFeedback() } catch (err) { console.error(err) }
    }

    const startEdit = (fb) => {
        setEditingId(fb.id)
        setFormData({ comment: fb.comment, feedbackType: fb.feedback_type })
    }

    const codeLines = (code || '').split('\n')
    const feedbackByLine = {}
    feedbacks.filter(f => !filterType || f.feedback_type === filterType).forEach(f => {
        if (!feedbackByLine[f.line_number]) feedbackByLine[f.line_number] = []
        feedbackByLine[f.line_number].push(f)
    })

    const toggleLine = (lineNum) => {
        setExpandedLines(prev => {
            const next = new Set(prev)
            next.has(lineNum) ? next.delete(lineNum) : next.add(lineNum)
            return next
        })
    }

    const totalFeedback = feedbacks.length
    const feedbackStats = feedbacks.reduce((acc, f) => { acc[f.feedback_type] = (acc[f.feedback_type] || 0) + 1; return acc }, {})

    if (loading && feedbacks.length === 0) {
        return <div style={{ textAlign: 'center', padding: '2rem' }}><div className="loading-spinner" /></div>
    }

    return (
        <div className="animate-fadeIn">
            {/* Stats Bar */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {Object.entries(feedbackTypeConfig).map(([type, cfg]) => {
                        const Icon = cfg.icon
                        const count = feedbackStats[type] || 0
                        return (
                            <button key={type} onClick={() => setFilterType(filterType === type ? '' : type)}
                                style={{ padding: '0.3rem 0.7rem', borderRadius: '20px', border: `1px solid ${filterType === type ? cfg.color : 'var(--border-color)'}`, background: filterType === type ? `${cfg.color}15` : 'transparent', color: filterType === type ? cfg.color : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Icon size={12} /> {cfg.label} ({count})
                            </button>
                        )
                    })}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>{totalFeedback} total comments</span>
            </div>

            {/* Code with inline feedback */}
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace", fontSize: '0.8rem' }}>
                {codeLines.map((line, idx) => {
                    const lineNum = idx + 1
                    const lineFeedbacks = feedbackByLine[lineNum] || []
                    const hasFeedback = lineFeedbacks.length > 0
                    const isExpanded = expandedLines.has(lineNum)

                    return (
                        <div key={lineNum}>
                            {/* Code Line */}
                            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.03)', background: hasFeedback ? 'rgba(59,130,246,0.04)' : 'transparent', position: 'relative' }}
                                onMouseEnter={e => { if (!hasFeedback) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                                onMouseLeave={e => { if (!hasFeedback) e.currentTarget.style.background = 'transparent' }}>
                                {/* Line number */}
                                <div style={{ width: '50px', padding: '0.2rem 0.5rem', textAlign: 'right', color: 'var(--text-muted)', userSelect: 'none', borderRight: `2px solid ${hasFeedback ? '#3b82f6' : 'transparent'}`, fontSize: '0.7rem', lineHeight: '1.6', flexShrink: 0 }}>
                                    {lineNum}
                                </div>

                                {/* Code */}
                                <pre style={{ margin: 0, padding: '0.2rem 0.75rem', flex: 1, lineHeight: '1.6', overflow: 'hidden', whiteSpace: 'pre', color: 'var(--text)' }}>{line || ' '}</pre>

                                {/* Actions */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', paddingRight: '0.5rem', flexShrink: 0 }}>
                                    {hasFeedback && (
                                        <button onClick={() => toggleLine(lineNum)} style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.65rem' }}>
                                            <MessageCircle size={12} /> {lineFeedbacks.length}
                                            {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                        </button>
                                    )}
                                    {!readOnly && (
                                        <button onClick={() => { setShowAddForm(showAddForm === lineNum ? null : lineNum); setFormData({ comment: '', feedbackType: 'suggestion' }) }}
                                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.15rem', opacity: 0.5 }}
                                            onMouseEnter={e => e.currentTarget.style.opacity = 1}
                                            onMouseLeave={e => e.currentTarget.style.opacity = 0.5}>
                                            <span style={{ fontSize: '1rem', lineHeight: 1 }}>+</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Feedback List */}
                            {hasFeedback && isExpanded && lineFeedbacks.map(fb => {
                                const cfg = feedbackTypeConfig[fb.feedback_type] || feedbackTypeConfig.suggestion
                                const Icon = cfg.icon
                                const isEditing = editingId === fb.id

                                return (
                                    <div key={fb.id} style={{ marginLeft: '52px', padding: '0.6rem 1rem', borderLeft: `3px solid ${cfg.color}`, background: `${cfg.color}08`, borderBottom: '1px solid var(--border-color)' }}>
                                        {isEditing ? (
                                            <div>
                                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                    {Object.entries(feedbackTypeConfig).map(([type, c]) => (
                                                        <button key={type} onClick={() => setFormData(p => ({ ...p, feedbackType: type }))}
                                                            style={{ padding: '0.2rem 0.5rem', borderRadius: '12px', border: `1px solid ${formData.feedbackType === type ? c.color : 'var(--border-color)'}`, background: formData.feedbackType === type ? `${c.color}20` : 'transparent', color: formData.feedbackType === type ? c.color : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600 }}>
                                                            {c.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <textarea value={formData.comment} onChange={e => setFormData(p => ({ ...p, comment: e.target.value }))} style={{ ...inputStyle, fontSize: '0.8rem', minHeight: '60px', resize: 'vertical' }} />
                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                                                    <button onClick={() => { setEditingId(null); setFormData({ comment: '', feedbackType: 'suggestion' }) }} style={{ ...buttonSecondary, padding: '0.3rem 0.8rem', fontSize: '0.7rem' }}>Cancel</button>
                                                    <button onClick={() => updateFeedback(fb.id)} style={{ ...buttonPrimary, padding: '0.3rem 0.8rem', fontSize: '0.7rem' }}><Save size={12} /> Save</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                                                    <Icon size={12} color={cfg.color} />
                                                    <span style={{ fontSize: '0.65rem', fontWeight: 600, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cfg.label}</span>
                                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                                        {fb.mentor_name || fb.mentor_id} • {new Date(fb.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text)', lineHeight: 1.5, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{fb.comment}</p>
                                                {!readOnly && (
                                                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                                                        <button onClick={() => startEdit(fb)} style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Edit size={10} /> Edit</button>
                                                        <button onClick={() => deleteFeedback(fb.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Trash2 size={10} /> Delete</button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}

                            {/* Add Feedback Form */}
                            {showAddForm === lineNum && (
                                <div style={{ marginLeft: '52px', padding: '0.75rem 1rem', background: 'rgba(59,130,246,0.06)', borderLeft: '3px solid #3b82f6', borderBottom: '1px solid var(--border-color)' }}>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                        {Object.entries(feedbackTypeConfig).map(([type, c]) => (
                                            <button key={type} onClick={() => setFormData(p => ({ ...p, feedbackType: type }))}
                                                style={{ padding: '0.2rem 0.5rem', borderRadius: '12px', border: `1px solid ${formData.feedbackType === type ? c.color : 'var(--border-color)'}`, background: formData.feedbackType === type ? `${c.color}20` : 'transparent', color: formData.feedbackType === type ? c.color : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600 }}>
                                                {c.label}
                                            </button>
                                        ))}
                                    </div>
                                    <textarea value={formData.comment} onChange={e => setFormData(p => ({ ...p, comment: e.target.value }))} placeholder={`Add feedback for line ${lineNum}...`} style={{ ...inputStyle, fontSize: '0.8rem', minHeight: '60px', resize: 'vertical' }} autoFocus />
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                                        <button onClick={() => setShowAddForm(null)} style={{ ...buttonSecondary, padding: '0.3rem 0.8rem', fontSize: '0.7rem' }}>Cancel</button>
                                        <button onClick={() => addFeedback(lineNum)} style={{ ...buttonPrimary, padding: '0.3rem 0.8rem', fontSize: '0.7rem' }}><Send size={12} /> Add</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
