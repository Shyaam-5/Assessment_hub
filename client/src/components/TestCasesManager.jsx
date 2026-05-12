import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Plus, Trash2, Eye, EyeOff, CheckCircle, Save, X, AlertTriangle, Play, Code } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

function TestCasesManager({ problemId, problemTitle, isReadOnly = false, onClose }) {
    const [testCases, setTestCases] = useState([])
    const [loading, setLoading] = useState(true)
    const [newTestCase, setNewTestCase] = useState({
        input: '',
        expectedOutput: '',
        isHidden: false,
        points: 10,
        description: ''
    })
    const [showAddForm, setShowAddForm] = useState(false)
    const [editingId, setEditingId] = useState(null)
    const [editData, setEditData] = useState({})

    useEffect(() => {
        fetchTestCases()
    }, [problemId])

    const fetchTestCases = async () => {
        try {
            const res = await axios.get(`${API_BASE}/problems/${problemId}/test-cases?role=mentor`)
            setTestCases(res.data)
            setLoading(false)
        } catch (error) {
            console.error('Error fetching test cases:', error)
            setLoading(false)
        }
    }

    const handleAddTestCase = async () => {
        try {
            await axios.post(`${API_BASE}/problems/${problemId}/test-cases`, newTestCase)
            setNewTestCase({ input: '', expectedOutput: '', isHidden: false, points: 10, description: '' })
            setShowAddForm(false)
            fetchTestCases()
        } catch (error) {
            alert('Error adding test case')
        }
    }

    const handleUpdateTestCase = async (id) => {
        try {
            await axios.put(`${API_BASE}/test-cases/${id}`, editData)
            setEditingId(null)
            fetchTestCases()
        } catch (error) {
            alert('Error updating test case')
        }
    }

    const handleDeleteTestCase = async (id) => {
        if (window.confirm('Delete this test case?')) {
            try {
                await axios.delete(`${API_BASE}/test-cases/${id}`)
                fetchTestCases()
            } catch (error) {
                alert('Error deleting test case')
            }
        }
    }

    const startEdit = (tc) => {
        setEditingId(tc.id)
        setEditData({
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            isHidden: tc.isHidden,
            points: tc.points,
            description: tc.description
        })
    }

    if (loading) return <div className="loading-spinner"></div>

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <div className="modal-title-with-icon">
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle size={20} color="white" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0 }}>Test Cases Manager</h2>
                            {problemTitle && <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{problemTitle}</p>}
                        </div>
                    </div>
                    <button onClick={onClose} className="modal-close"><X size={20} /></button>
                </div>

                <div className="modal-body" style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
                    {/* Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>{testCases.length}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Test Cases</div>
                        </div>
                        <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>{testCases.filter(tc => !tc.isHidden).length}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Visible</div>
                        </div>
                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>{testCases.filter(tc => tc.isHidden).length}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hidden</div>
                        </div>
                    </div>

                    {/* Add New Button */}
                    {!isReadOnly && !showAddForm && (
                        <button
                            onClick={() => setShowAddForm(true)}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                background: 'rgba(59, 130, 246, 0.1)',
                                border: '2px dashed rgba(59, 130, 246, 0.3)',
                                borderRadius: '10px',
                                color: '#3b82f6',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                marginBottom: '1.5rem'
                            }}
                        >
                            <Plus size={18} /> Add Test Case
                        </button>
                    )}

                    {/* Add Form */}
                    {showAddForm && (
                        <div style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '12px',
                            padding: '1.5rem',
                            marginBottom: '1.5rem'
                        }}>
                            <h4 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Plus size={16} /> New Test Case
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Input</label>
                                    <textarea
                                        rows="3"
                                        placeholder="Enter test input..."
                                        value={newTestCase.input}
                                        onChange={(e) => setNewTestCase({ ...newTestCase, input: e.target.value })}
                                        style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Expected Output</label>
                                    <textarea
                                        rows="3"
                                        placeholder="Enter expected output..."
                                        value={newTestCase.expectedOutput}
                                        onChange={(e) => setNewTestCase({ ...newTestCase, expectedOutput: e.target.value })}
                                        style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Description (optional)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g., Edge case with empty array"
                                        value={newTestCase.description}
                                        onChange={(e) => setNewTestCase({ ...newTestCase, description: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Points</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={newTestCase.points}
                                        onChange={(e) => setNewTestCase({ ...newTestCase, points: parseInt(e.target.value) || 10 })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Visibility</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                                        <input
                                            type="checkbox"
                                            id="isHidden"
                                            checked={newTestCase.isHidden}
                                            onChange={(e) => setNewTestCase({ ...newTestCase, isHidden: e.target.checked })}
                                            style={{ width: '18px', height: '18px', accentColor: '#ef4444' }}
                                        />
                                        <label htmlFor="isHidden" style={{ cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {newTestCase.isHidden ? <EyeOff size={16} color="#ef4444" /> : <Eye size={16} color="#10b981" />}
                                            {newTestCase.isHidden ? 'Hidden' : 'Visible'}
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => setShowAddForm(false)}
                                    style={{ padding: '0.5rem 1rem', background: 'var(--bg-dark)', border: 'none', borderRadius: '6px', color: 'var(--text-muted)', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddTestCase}
                                    style={{ padding: '0.5rem 1rem', background: 'var(--primary)', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <Plus size={16} /> Add Test Case
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Test Cases List */}
                    {testCases.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            <AlertTriangle size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                            <h3>No Test Cases</h3>
                            <p>Add test cases to enable automated grading</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {testCases.map((tc, index) => (
                                <div
                                    key={tc.id}
                                    style={{
                                        background: 'var(--bg-card)',
                                        border: `1px solid ${tc.isHidden ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-color)'}`,
                                        borderRadius: '10px',
                                        padding: '1rem',
                                        position: 'relative'
                                    }}
                                >
                                    {editingId === tc.id ? (
                                        // Edit Mode
                                        <div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                                <div className="form-group">
                                                    <label className="form-label">Input</label>
                                                    <textarea
                                                        rows="3"
                                                        value={editData.input}
                                                        onChange={(e) => setEditData({ ...editData, input: e.target.value })}
                                                        style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Expected Output</label>
                                                    <textarea
                                                        rows="3"
                                                        value={editData.expectedOutput}
                                                        onChange={(e) => setEditData({ ...editData, expectedOutput: e.target.value })}
                                                        style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                                                <button onClick={() => setEditingId(null)} style={{ padding: '0.4rem 0.75rem', background: 'var(--bg-dark)', border: 'none', borderRadius: '6px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                                    Cancel
                                                </button>
                                                <button onClick={() => handleUpdateTestCase(tc.id)} style={{ padding: '0.4rem 0.75rem', background: 'var(--primary)', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <Save size={14} /> Save
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        // View Mode
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <span style={{
                                                        width: '24px', height: '24px',
                                                        background: 'var(--primary)',
                                                        borderRadius: '50%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700
                                                    }}>
                                                        {index + 1}
                                                    </span>
                                                    <span style={{ fontWeight: 600 }}>{tc.description || `Test Case ${index + 1}`}</span>
                                                    <span style={{
                                                        padding: '2px 8px',
                                                        borderRadius: '12px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 600,
                                                        background: tc.isHidden ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                                        color: tc.isHidden ? '#ef4444' : '#10b981',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        {tc.isHidden ? <EyeOff size={10} /> : <Eye size={10} />}
                                                        {tc.isHidden ? 'Hidden' : 'Visible'}
                                                    </span>
                                                    <span style={{
                                                        padding: '2px 8px',
                                                        borderRadius: '12px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 600,
                                                        background: 'rgba(251, 191, 36, 0.15)',
                                                        color: '#fbbf24'
                                                    }}>
                                                        {tc.points} pts
                                                    </span>
                                                </div>
                                                {!isReadOnly && (
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button
                                                            onClick={() => startEdit(tc)}
                                                            style={{ padding: '0.4rem', background: 'rgba(59, 130, 246, 0.1)', border: 'none', borderRadius: '6px', color: '#3b82f6', cursor: 'pointer' }}
                                                        >
                                                            <Code size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteTestCase(tc.id)}
                                                            style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', border: 'none', borderRadius: '6px', color: '#ef4444', cursor: 'pointer' }}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Input:</div>
                                                    <code style={{
                                                        display: 'block',
                                                        padding: '0.5rem',
                                                        background: 'var(--bg-dark)',
                                                        borderRadius: '6px',
                                                        fontSize: '0.8rem',
                                                        whiteSpace: 'pre-wrap',
                                                        maxHeight: '80px',
                                                        overflow: 'auto'
                                                    }}>
                                                        {tc.input || '(empty)'}
                                                    </code>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Expected Output:</div>
                                                    <code style={{
                                                        display: 'block',
                                                        padding: '0.5rem',
                                                        background: 'var(--bg-dark)',
                                                        borderRadius: '6px',
                                                        fontSize: '0.8rem',
                                                        color: '#4ade80',
                                                        whiteSpace: 'pre-wrap',
                                                        maxHeight: '80px',
                                                        overflow: 'auto'
                                                    }}>
                                                        {tc.expectedOutput}
                                                    </code>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default TestCasesManager
