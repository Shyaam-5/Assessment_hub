import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Eye, EyeOff, CheckCircle, Save, X, AlertTriangle, Code } from 'lucide-react'

function LocalTestCasesManager({ initialTestCases = [], onUpdate, onClose, title = 'Coding Problem', inputLabel = 'Sample Input', outputLabel = 'Sample Output' }) {
    const [testCases, setTestCases] = useState([])
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
        // Ensure every test case has a temporary ID for keying
        const withIds = initialTestCases.map((tc, idx) => ({
            ...tc,
            _id: tc._id || tc.id || `temp-${Date.now()}-${idx}`
        }))
        setTestCases(withIds)
    }, [initialTestCases])

    const updateParent = (newCases) => {
        setTestCases(newCases)
        // Strip temp IDs if needed, or keep them. Parent might not care.
        // But for cleaner data, we might want to return clean objects.
        // Ideally parent expects the same structure.
        onUpdate(newCases)
    }

    const handleAddTestCase = () => {
        if (!newTestCase.input && !newTestCase.expectedOutput) return

        const newCase = {
            ...newTestCase,
            _id: `temp-${Date.now()}`
        }

        const updated = [...testCases, newCase]
        updateParent(updated)

        setNewTestCase({ input: '', expectedOutput: '', isHidden: false, points: 10, description: '' })
        setShowAddForm(false)
    }

    const handleUpdateTestCase = (id) => {
        const updated = testCases.map(tc => {
            if (tc._id === id) {
                return { ...tc, ...editData }
            }
            return tc
        })
        updateParent(updated)
        setEditingId(null)
    }

    const handleDeleteTestCase = (id) => {
        if (window.confirm('Delete this test case?')) {
            const updated = testCases.filter(tc => tc._id !== id)
            updateParent(updated)
        }
    }

    const startEdit = (tc) => {
        setEditingId(tc._id)
        setEditData({
            input: tc.input || '',
            expectedOutput: tc.expectedOutput || '',
            isHidden: tc.isHidden || false,
            points: tc.points || 10,
            description: tc.description || ''
        })
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
        }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{
                width: '900px', maxWidth: '95vw', maxHeight: '85vh',
                background: '#1e293b', borderRadius: '16px', border: '1px solid rgba(139,92,246,0.2)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
            }}>
                <div className="modal-header" style={{
                    padding: '1.5rem', background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle size={20} color="white" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>Test Cases Manager</h2>
                            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>{title}</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}><X size={24} /></button>
                </div>

                <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', color: 'white' }}>
                    {/* Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>{testCases.length}</div>
                            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Total Test Cases</div>
                        </div>
                        <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>{testCases.filter(tc => !tc.isHidden).length}</div>
                            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Visible</div>
                        </div>
                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>{testCases.filter(tc => tc.isHidden).length}</div>
                            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Hidden</div>
                        </div>
                    </div>

                    {/* Add New Button */}
                    {!showAddForm && (
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
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '12px',
                            padding: '1.5rem',
                            marginBottom: '1.5rem'
                        }}>
                            <h4 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
                                <Plus size={16} /> New Test Case
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>{inputLabel}</label>
                                    <textarea
                                        rows="3"
                                        placeholder="Enter test input..."
                                        value={newTestCase.input}
                                        onChange={(e) => setNewTestCase({ ...newTestCase, input: e.target.value })}
                                        style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontFamily: 'monospace', fontSize: '0.85rem' }}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>{outputLabel}</label>
                                    <textarea
                                        rows="3"
                                        placeholder="Enter expected output..."
                                        value={newTestCase.expectedOutput}
                                        onChange={(e) => setNewTestCase({ ...newTestCase, expectedOutput: e.target.value })}
                                        style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontFamily: 'monospace', fontSize: '0.85rem' }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>Description (optional)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g., Edge case with empty array"
                                        value={newTestCase.description}
                                        onChange={(e) => setNewTestCase({ ...newTestCase, description: e.target.value })}
                                        style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white' }}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>Points</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={newTestCase.points}
                                        onChange={(e) => setNewTestCase({ ...newTestCase, points: parseInt(e.target.value) || 10 })}
                                        style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white' }}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>Visibility</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                                        <input
                                            type="checkbox"
                                            id="isHidden"
                                            checked={newTestCase.isHidden}
                                            onChange={(e) => setNewTestCase({ ...newTestCase, isHidden: e.target.checked })}
                                            style={{ width: '18px', height: '18px', accentColor: '#ef4444' }}
                                        />
                                        <label htmlFor="isHidden" style={{ cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
                                            {newTestCase.isHidden ? <EyeOff size={16} color="#ef4444" /> : <Eye size={16} color="#10b981" />}
                                            {newTestCase.isHidden ? 'Hidden' : 'Visible'}
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => setShowAddForm(false)}
                                    style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddTestCase}
                                    style={{ padding: '0.5rem 1rem', background: '#8b5cf6', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <Plus size={16} /> Add Test Case
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Test Cases List */}
                    {testCases.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)' }}>
                            <AlertTriangle size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                            <h3>No Test Cases</h3>
                            <p>Add test cases to enable automated grading</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {testCases.map((tc, index) => (
                                <div
                                    key={tc._id}
                                    style={{
                                        background: 'rgba(0,0,0,0.2)',
                                        border: `1px solid ${tc.isHidden ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.1)'}`,
                                        borderRadius: '10px',
                                        padding: '1rem',
                                        position: 'relative'
                                    }}
                                >
                                    {editingId === tc._id ? (
                                        // Edit Mode
                                        <div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                                <div className="form-group">
                                                    <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>{inputLabel}</label>
                                                    <textarea
                                                        rows="3"
                                                        value={editData.input}
                                                        onChange={(e) => setEditData({ ...editData, input: e.target.value })}
                                                        style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontFamily: 'monospace', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>{outputLabel}</label>
                                                    <textarea
                                                        rows="3"
                                                        value={editData.expectedOutput}
                                                        onChange={(e) => setEditData({ ...editData, expectedOutput: e.target.value })}
                                                        style={{ width: '100%', padding: '0.5rem', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', fontFamily: 'monospace', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                                                <button onClick={() => setEditingId(null)} style={{ padding: '0.4rem 0.75rem', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                                                    Cancel
                                                </button>
                                                <button onClick={() => handleUpdateTestCase(tc._id)} style={{ padding: '0.4rem 0.75rem', background: '#10b981', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                                                        background: 'rgba(139,92,246,0.2)',
                                                        color: '#a78bfa',
                                                        borderRadius: '50%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700
                                                    }}>
                                                        {index + 1}
                                                    </span>
                                                    <span style={{ fontWeight: 600, color: 'white' }}>{tc.description || `Test Case ${index + 1}`}</span>
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
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        onClick={() => startEdit(tc)}
                                                        style={{ padding: '0.4rem', background: 'rgba(59, 130, 246, 0.1)', border: 'none', borderRadius: '6px', color: '#3b82f6', cursor: 'pointer' }}
                                                    >
                                                        <Code size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteTestCase(tc._id)}
                                                        style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', border: 'none', borderRadius: '6px', color: '#ef4444', cursor: 'pointer' }}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem' }}>{inputLabel}:</div>
                                                    <code style={{
                                                        display: 'block',
                                                        padding: '0.5rem',
                                                        background: '#0f172a',
                                                        borderRadius: '6px',
                                                        fontSize: '0.8rem',
                                                        whiteSpace: 'pre-wrap',
                                                        maxHeight: '80px',
                                                        overflow: 'auto',
                                                        color: 'rgba(255,255,255,0.9)'
                                                    }}>
                                                        {tc.input || '(empty)'}
                                                    </code>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem' }}>{outputLabel}:</div>
                                                    <code style={{
                                                        display: 'block',
                                                        padding: '0.5rem',
                                                        background: '#0f172a',
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

export default LocalTestCasesManager
