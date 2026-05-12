import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Brain, Target, CheckCircle, XCircle, X, AlertTriangle, Clock, Award } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

function AptitudeReportModal({ submission, onClose, isStudentView = false }) {
    const [loading, setLoading] = useState(true)
    const [fullData, setFullData] = useState(null)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (submission?.id) {
            axios.get(`${API_BASE}/aptitude-submissions/${submission.id}`)
                .then(res => {
                    setFullData(res.data)
                    setLoading(false)
                })
                .catch(err => {
                    console.error('Failed to load submission details:', err)
                    setError('Failed to load submission details')
                    setLoading(false)
                })
        }
    }, [submission?.id])

    if (!submission) return null

    const data = fullData || submission

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content"
                onClick={e => e.stopPropagation()}
                style={{
                    maxWidth: '950px',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
            >
                {/* Header */}
                <div className="modal-header" style={{ borderBottom: '1px solid rgba(139, 92, 246, 0.2)' }}>
                    <div className="modal-title-with-icon">
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: data.status === 'passed'
                                ? 'linear-gradient(135deg, #10b981, #06b6d4)'
                                : 'linear-gradient(135deg, #ef4444, #f97316)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Brain size={24} color="white" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0 }}>Aptitude Test Report</h2>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                {isStudentView ? 'Your Results' : data.studentName}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="modal-close"><X size={20} /></button>
                </div>

                {/* Scrollable Content */}
                <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem' }}>
                            <div className="loading-spinner"></div>
                            <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Loading report details...</p>
                        </div>
                    ) : error ? (
                        <div style={{ textAlign: 'center', padding: '3rem' }}>
                            <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '1rem' }} />
                            <p style={{ color: '#ef4444' }}>{error}</p>
                        </div>
                    ) : (
                        <>
                            {/* Test Info */}
                            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ margin: 0, color: 'var(--primary)' }}>{data.testTitle}</h3>
                                <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0' }}>
                                    Submitted: {new Date(data.submittedAt).toLocaleString()}
                                </p>
                            </div>

                            {/* Score Summary */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '3rem',
                                marginBottom: '2rem',
                                padding: '2rem',
                                background: data.status === 'passed' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                                borderRadius: '16px',
                                border: `1px solid ${data.status === 'passed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                            }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{
                                        fontSize: '4rem',
                                        fontWeight: 800,
                                        color: data.status === 'passed' ? '#10b981' : '#ef4444',
                                        lineHeight: 1
                                    }}>
                                        {data.score}%
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Overall Score</div>
                                </div>
                                <div style={{
                                    padding: '1rem 2rem',
                                    borderRadius: '12px',
                                    background: data.status === 'passed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    border: `1px solid ${data.status === 'passed' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem'
                                }}>
                                    {data.status === 'passed' ? (
                                        <CheckCircle size={28} color="#10b981" />
                                    ) : (
                                        <XCircle size={28} color="#ef4444" />
                                    )}
                                    <span style={{
                                        fontSize: '1.5rem',
                                        fontWeight: 700,
                                        color: data.status === 'passed' ? '#10b981' : '#ef4444'
                                    }}>
                                        {data.status === 'passed' ? 'PASSED' : 'FAILED'}
                                    </span>
                                </div>
                            </div>

                            {/* Stats Grid */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(5, 1fr)',
                                gap: '1rem',
                                marginBottom: '2rem'
                            }}>
                                <div style={{
                                    background: 'rgba(59, 130, 246, 0.1)',
                                    borderRadius: '12px',
                                    padding: '1.25rem',
                                    border: '1px solid rgba(59, 130, 246, 0.2)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#3b82f6' }}>
                                        {data.totalQuestions || 0}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Questions</div>
                                </div>
                                <div style={{
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    borderRadius: '12px',
                                    padding: '1.25rem',
                                    border: '1px solid rgba(16, 185, 129, 0.2)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>
                                        {data.correctCount || 0}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Correct</div>
                                </div>
                                <div style={{
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    borderRadius: '12px',
                                    padding: '1.25rem',
                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ef4444' }}>
                                        {(data.totalQuestions || 0) - (data.correctCount || 0)}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Incorrect</div>
                                </div>
                                <div style={{
                                    background: 'rgba(245, 158, 11, 0.1)',
                                    borderRadius: '12px',
                                    padding: '1.25rem',
                                    border: '1px solid rgba(245, 158, 11, 0.2)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{
                                        fontSize: '1.75rem',
                                        fontWeight: 800,
                                        color: (data.tabSwitches || 0) > 0 ? '#f59e0b' : '#10b981'
                                    }}>
                                        {data.tabSwitches || 0}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        <AlertTriangle size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                                        Violations
                                    </div>
                                </div>
                                <div style={{
                                    background: 'rgba(139, 92, 246, 0.1)',
                                    borderRadius: '12px',
                                    padding: '1.25rem',
                                    border: '1px solid rgba(139, 92, 246, 0.2)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#8b5cf6' }}>
                                        {data.timeSpent ? `${Math.floor(data.timeSpent / 60)}m ${data.timeSpent % 60}s` : 'N/A'}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        <Clock size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                                        Time Spent
                                    </div>
                                </div>
                            </div>

                            {/* Violation Warning */}
                            {(data.tabSwitches || 0) > 0 && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    padding: '1rem 1.5rem',
                                    background: 'rgba(245, 158, 11, 0.1)',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                    marginBottom: '2rem'
                                }}>
                                    <AlertTriangle size={24} color="#f59e0b" />
                                    <div>
                                        <strong style={{ color: '#f59e0b' }}>Tab Switch Violations Detected</strong>
                                        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                            The student switched tabs/windows {data.tabSwitches} time(s) during the test.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Detailed Question Breakdown */}
                            <div>
                                <h4 style={{
                                    margin: '0 0 1rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}>
                                    <Target size={18} color="#8b5cf6" />
                                    Detailed Question Breakdown
                                </h4>

                                {data.questionResults && data.questionResults.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {data.questionResults.map((q, idx) => (
                                            <div key={idx} style={{
                                                padding: '1.25rem',
                                                background: q.isCorrect ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                                                border: `1px solid ${q.isCorrect ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                                                borderRadius: '12px'
                                            }}>
                                                {/* Question Header */}
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'flex-start',
                                                    gap: '0.75rem',
                                                    marginBottom: '1rem'
                                                }}>
                                                    <span style={{
                                                        minWidth: '28px',
                                                        height: '28px',
                                                        borderRadius: '50%',
                                                        background: q.isCorrect
                                                            ? 'linear-gradient(135deg, #10b981, #06b6d4)'
                                                            : 'linear-gradient(135deg, #ef4444, #f97316)',
                                                        color: 'white',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 700,
                                                        flexShrink: 0
                                                    }}>
                                                        {q.isCorrect ? '✓' : '✗'}
                                                    </span>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.75rem',
                                                            marginBottom: '0.5rem'
                                                        }}>
                                                            <span style={{
                                                                fontSize: '0.75rem',
                                                                fontWeight: 600,
                                                                color: '#8b5cf6',
                                                                textTransform: 'uppercase',
                                                                letterSpacing: '0.05em'
                                                            }}>
                                                                Question {idx + 1}
                                                            </span>
                                                            {q.category && (
                                                                <span style={{
                                                                    fontSize: '0.7rem',
                                                                    padding: '0.2rem 0.6rem',
                                                                    background: 'rgba(139, 92, 246, 0.2)',
                                                                    borderRadius: '20px',
                                                                    color: '#a78bfa'
                                                                }}>
                                                                    {q.category}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p style={{
                                                            margin: 0,
                                                            fontSize: '1rem',
                                                            fontWeight: 500,
                                                            lineHeight: 1.5
                                                        }}>
                                                            {q.question}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Answers Section */}
                                                <div style={{
                                                    marginLeft: '2.5rem',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '0.75rem'
                                                }}>
                                                    {/* Student's Answer */}
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'flex-start',
                                                        gap: '0.75rem',
                                                        padding: '0.75rem 1rem',
                                                        background: q.isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                        borderRadius: '8px',
                                                        border: `1px solid ${q.isCorrect ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                                                    }}>
                                                        <span style={{
                                                            fontSize: '0.8rem',
                                                            fontWeight: 600,
                                                            color: 'var(--text-muted)',
                                                            minWidth: '120px'
                                                        }}>
                                                            {isStudentView ? 'Your Answer:' : 'Student Answer:'}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '0.9rem',
                                                            fontWeight: 600,
                                                            color: q.isCorrect ? '#10b981' : '#ef4444'
                                                        }}>
                                                            {q.userAnswer || '(Not answered)'}
                                                        </span>
                                                    </div>

                                                    {/* Correct Answer (only show if incorrect) */}
                                                    {!q.isCorrect && (
                                                        <div style={{
                                                            display: 'flex',
                                                            alignItems: 'flex-start',
                                                            gap: '0.75rem',
                                                            padding: '0.75rem 1rem',
                                                            background: 'rgba(16, 185, 129, 0.1)',
                                                            borderRadius: '8px',
                                                            border: '1px solid rgba(16, 185, 129, 0.2)'
                                                        }}>
                                                            <span style={{
                                                                fontSize: '0.8rem',
                                                                fontWeight: 600,
                                                                color: 'var(--text-muted)',
                                                                minWidth: '120px'
                                                            }}>
                                                                Correct Answer:
                                                            </span>
                                                            <span style={{
                                                                fontSize: '0.9rem',
                                                                fontWeight: 600,
                                                                color: '#10b981'
                                                            }}>
                                                                {q.correctAnswer}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Explanation */}
                                                    {q.explanation && (
                                                        <div style={{
                                                            padding: '0.75rem 1rem',
                                                            background: 'rgba(139, 92, 246, 0.05)',
                                                            borderRadius: '8px',
                                                            border: '1px solid rgba(139, 92, 246, 0.15)'
                                                        }}>
                                                            <span style={{
                                                                fontSize: '0.75rem',
                                                                fontWeight: 600,
                                                                color: '#a78bfa',
                                                                display: 'block',
                                                                marginBottom: '0.25rem'
                                                            }}>
                                                                💡 Explanation
                                                            </span>
                                                            <p style={{
                                                                margin: 0,
                                                                fontSize: '0.85rem',
                                                                color: 'var(--text-muted)',
                                                                lineHeight: 1.5
                                                            }}>
                                                                {q.explanation}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{
                                        textAlign: 'center',
                                        padding: '2rem',
                                        background: 'rgba(71, 85, 105, 0.1)',
                                        borderRadius: '12px',
                                        color: 'var(--text-muted)'
                                    }}>
                                        <Target size={32} style={{ opacity: 0.5, marginBottom: '0.5rem' }} />
                                        <p style={{ margin: 0 }}>No question details available</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default AptitudeReportModal
