import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import { Play, Send, CheckCircle, XCircle, Database, Table, Loader2, ArrowRight, Target } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function SkillSQLTest({ attemptId, attemptData, onComplete, onFailed }) {
    const [problems, setProblems] = useState([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [queries, setQueries] = useState({});
    const [runResult, setRunResult] = useState(null);
    const [evalResult, setEvalResult] = useState(null);
    const [submissions, setSubmissions] = useState({});
    const [running, setRunning] = useState(false);
    const [evaluating, setEvaluating] = useState(false);
    const [finishing, setFinishing] = useState(false);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(null); // 'schema', 'expected', null
    const [error, setError] = useState('');
    const [showContinue, setShowContinue] = useState(false);
    const [showFinishConfirm, setShowFinishConfirm] = useState(false);
    const [timeLeft, setTimeLeft] = useState(null);
    const timerRef = useRef(null);

    useEffect(() => {
        if (timeLeft === null) return;
        if (timeLeft <= 0) {
            handleTimeUp();
            return;
        }
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    handleTimeUp();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, [timeLeft]);

    const handleTimeUp = () => {
        alert('Time is up! Submitting your test automatically.');
        finishSQL(true);
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    useEffect(() => { startSQL(); }, []);

    const startSQL = async () => {
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/sql/start/${attemptId}`);
            setProblems(data.problems || []);
            setSubmissions(data.existing_submissions || {});
            const initQueries = {};
            (data.problems || []).forEach(p => { initQueries[p.id] = ''; });
            setQueries(initQueries);
            if (data.duration_minutes) setTimeLeft(data.duration_minutes * 60);
            setLoading(false);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setLoading(false);
        }
    };

    const runQuery = async () => {
        const p = problems[currentIdx];
        if (!p) return;
        setRunning(true);
        setRunResult(null);
        setEvalResult(null);
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/sql/run`, {
                query: queries[p.id] || '',
                attemptId
            });
            setRunResult(data);
        } catch (err) {
            setRunResult({ success: false, error: err.message });
        } finally {
            setRunning(false);
        }
    };

    const evaluateQuery = async () => {
        const p = problems[currentIdx];
        if (!p) return;
        setEvaluating(true);
        setEvalResult(null);
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/sql/evaluate`, {
                attemptId, problemId: p.id, query: queries[p.id] || ''
            });
            setEvalResult(data);
            if (data.passed) {
                setSubmissions(prev => ({ ...prev, [String(p.id)]: { passed: true } }));
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setEvaluating(false);
        }
    };

    const finishSQL = async () => {
        setShowFinishConfirm(false);
        setFinishing(true);
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/sql/finish/${attemptId}`);
            setResult(data);
            setShowContinue(true);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setFinishing(false);
        }
    };

    const handleContinue = () => {
        if (result?.passed) {
            onComplete(result);
        } else {
            onFailed();
        }
    };

    if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading SQL problems...</div>;

    if (result) {
        return (
            <div style={{ textAlign: 'center', padding: '60px' }}>
                <div style={{
                    width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: result.passed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'
                }}>
                    {result.passed ? <CheckCircle size={40} color="#22c55e" /> : <XCircle size={40} color="#ef4444" />}
                </div>
                <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px', color: '#f1f5f9' }}>
                    {result.passed ? 'SQL Passed!' : 'SQL Failed'}
                </h2>
                <p style={{ fontSize: '18px', color: '#94a3b8' }}>
                    Solved: {result.solved}/{result.total} ({Math.round(result.score)}%)
                </p>
                <div style={{ marginTop: '32px' }}>
                    <button onClick={handleContinue} style={{
                        padding: '12px 24px', background: '#8b5cf6', color: 'white', border: 'none',
                        borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '16px',
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        boxShadow: '0 4px 12px rgba(139,92,246,0.3)'
                    }}>
                        {result.passed ? 'Continue to Interview' : 'View Report'} <ArrowRight size={18} />
                    </button>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '12px' }}>
                        Click to proceed to the next stage
                    </p>
                </div>
            </div>
        );
    }

    const p = problems[currentIdx];
    const solvedCount = Object.values(submissions).filter(s => s.passed).length;

    const SCHEMA_INFO = `
📊 Available Tables:
━━━━━━━━━━━━━━━━━━━━━━━
employees (id, name, department, salary, hire_date, manager_id)
departments (id, name, budget, location)
projects (id, name, department_id, start_date, end_date, status)
orders (id, customer_name, product, quantity, price, order_date)
    `.trim();

    // Helper to render table
    const renderTable = (data, title, color) => {
        if (!data || !data.rows || data.rows.length === 0) return null;
        return (
            <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: color, marginBottom: '4px' }}>{title}</div>
                <div style={{ overflowX: 'auto', border: `1px solid ${color}40`, borderRadius: '6px' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '11px' }}>
                        <thead>
                            <tr>
                                {data.columns.map(col => (
                                    <th key={col} style={{ padding: '4px 8px', borderBottom: `1px solid ${color}40`, textAlign: 'left', color: '#cbd5e1', background: `${color}10` }}>{col}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.slice(0, 5).map((row, i) => (
                                <tr key={i}>
                                    {data.columns.map(col => (
                                        <td key={col} style={{ padding: '4px 8px', borderBottom: '1px solid #333', color: '#94a3b8' }}>{row[col] ?? 'NULL'}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 20px', background: '#1e293b', borderRadius: '10px', marginBottom: '16px',
                border: '1px solid #334155'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Database size={20} color="#8b5cf6" />
                    <span style={{ fontWeight: 700, fontSize: '15px', color: '#f1f5f9' }}>SQL Test</span>
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>{solvedCount}/{problems.length} solved</span>
                    {timeLeft !== null && (
                        <span style={{
                            padding: '4px 10px', borderRadius: '12px', fontSize: '13px', fontWeight: 600,
                            background: timeLeft < 300 ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.15)',
                            color: timeLeft < 300 ? '#fca5a5' : '#60a5fa', border: '1px solid ' + (timeLeft < 300 ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.3)')
                        }}>
                            Time Left: {formatTime(timeLeft)}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setActiveTab(activeTab === 'schema' ? null : 'schema')} style={{
                        padding: '8px 14px', background: activeTab === 'schema' ? 'rgba(139,92,246,0.15)' : '#334155',
                        border: '1px solid ' + (activeTab === 'schema' ? '#8b5cf6' : '#475569'),
                        borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '4px', color: '#f1f5f9'
                    }}>
                        <Table size={14} /> Schema
                    </button>
                    <button onClick={() => setActiveTab(activeTab === 'expected' ? null : 'expected')} style={{
                        padding: '8px 14px', background: activeTab === 'expected' ? 'rgba(16, 185, 129, 0.15)' : '#334155',
                        border: '1px solid ' + (activeTab === 'expected' ? '#10b981' : '#475569'),
                        borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '4px', color: '#f1f5f9'
                    }}>
                        <Target size={14} /> Expected Output
                    </button>
                    <button onClick={() => setShowFinishConfirm(true)} disabled={finishing} style={{
                        padding: '8px 20px', background: '#8b5cf6', color: 'white', border: 'none',
                        borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                        opacity: finishing ? 0.6 : 1
                    }}>
                        {finishing ? 'Submitting...' : 'Finish SQL →'}
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px', marginBottom: '12px', color: '#fca5a5', fontSize: '13px' }}>{error}</div>
            )}

            {/* Info Panel (Schema or Expected Output) */}
            {activeTab && (
                <div style={{
                    background: '#1e1e1e', color: '#d4d4d4', padding: '16px', borderRadius: '8px',
                    marginBottom: '16px', fontSize: '13px', fontFamily: 'monospace', whiteSpace: 'pre-line',
                    border: '1px solid #334155', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}>
                    {activeTab === 'schema' ? (
                        SCHEMA_INFO
                    ) : (
                        <div>
                            <div style={{ marginBottom: '8px', color: '#10b981', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Target size={16} /> Expected Result Structure
                            </div>

                            {problems[currentIdx]?.expected_output_description && (
                                <div style={{ marginBottom: '12px' }}>
                                    <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Description:</div>
                                    <div style={{ color: '#e2e8f0' }}>{problems[currentIdx].expected_output_description}</div>
                                </div>
                            )}

                            {problems[currentIdx]?.expected_columns && (
                                <div style={{ marginBottom: '12px' }}>
                                    <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Required Columns:</div>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {problems[currentIdx].expected_columns.map(col => (
                                            <span key={col} style={{
                                                padding: '2px 8px', background: 'rgba(96, 165, 250, 0.1)',
                                                border: '1px solid rgba(96, 165, 250, 0.2)', borderRadius: '4px',
                                                color: '#60a5fa'
                                            }}>{col}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {problems[currentIdx]?.expected_output && (
                                <div>
                                    <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Sample Data:</div>
                                    <pre style={{
                                        background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px',
                                        border: '1px solid rgba(255,255,255,0.05)', color: '#a7f3d0'
                                    }}>
                                        {problems[currentIdx].expected_output}
                                    </pre>
                                </div>
                            )}

                            {!problems[currentIdx]?.expected_output_description && !problems[currentIdx]?.expected_columns && !problems[currentIdx]?.expected_output && (
                                <span style={{ color: '#64748b', fontStyle: 'italic' }}>No expected output details available for this problem.</span>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Problem Navigator */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                {problems.map((pr, idx) => {
                    const isSolved = submissions[String(pr.id)]?.passed;
                    return (
                        <button key={idx} onClick={() => { setCurrentIdx(idx); setRunResult(null); setEvalResult(null); }} style={{
                            padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            fontWeight: 600, fontSize: '12px',
                            background: idx === currentIdx ? '#8b5cf6' : isSolved ? '#22c55e' : '#334155',
                            color: (idx === currentIdx || isSolved) ? 'white' : '#94a3b8'
                        }}>
                            Q{idx + 1} {isSolved ? '✓' : ''}
                        </button>
                    );
                })}
            </div>

            {p && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {/* Problem Description */}
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '16px' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>{p.title}</h3>
                        {p.difficulty && (
                            <span style={{
                                padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, display: 'inline-block', marginBottom: '12px',
                                background: p.difficulty === 'hard' ? 'rgba(239,68,68,0.15)' : p.difficulty === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
                                color: p.difficulty === 'hard' ? '#f87171' : p.difficulty === 'medium' ? '#fbbf24' : '#34d399'
                            }}>{p.difficulty}</span>
                        )}
                        <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#cbd5e1' }}>{p.description}</p>

                        {p.expected_output_description && (
                            <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(34,197,94,0.1)', borderRadius: '6px', fontSize: '13px', color: '#34d399' }}>
                                <strong>Expected:</strong> {p.expected_output_description}
                            </div>
                        )}

                        {p.expected_columns && (
                            <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(59,130,246,0.1)', borderRadius: '6px', fontSize: '13px', color: '#60a5fa' }}>
                                <strong>Expected Columns:</strong> {p.expected_columns.join(', ')}
                            </div>
                        )}

                        {p.hints && (
                            <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(245,158,11,0.1)', borderRadius: '6px', fontSize: '13px', color: '#fbbf24' }}>
                                <strong>Hint:</strong> {p.hints}
                            </div>
                        )}

                        {/* Evaluation Result */}
                        {evalResult && (
                            <div style={{
                                marginTop: '16px', padding: '12px', borderRadius: '8px',
                                background: evalResult.passed ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                border: '1px solid ' + (evalResult.passed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)')
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: evalResult.passed ? '#34d399' : '#f87171' }}>
                                    {evalResult.passed ? <CheckCircle size={16} color="#22c55e" /> : <XCircle size={16} color="#ef4444" />}
                                    {evalResult.passed ? 'Query Correct!' : 'Query Incorrect'}
                                </div>
                                {evalResult.feedback && (
                                    <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5 }}>
                                        {evalResult.feedback}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Editor + Results */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={runQuery} disabled={running} style={{
                                padding: '6px 14px', background: '#10b981', color: 'white', border: 'none',
                                borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: '4px', opacity: running ? 0.6 : 1
                            }}>
                                {running ? <Loader2 size={14} /> : <Play size={14} />} Run
                            </button>
                            <button onClick={evaluateQuery} disabled={evaluating} style={{
                                padding: '6px 14px', background: '#8b5cf6', color: 'white', border: 'none',
                                borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: '4px', opacity: evaluating ? 0.6 : 1
                            }}>
                                {evaluating ? <Loader2 size={14} /> : <Send size={14} />} Submit
                            </button>
                        </div>

                        <div style={{ border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', minHeight: '220px' }}>
                            <Editor
                                height="220px"
                                language="sql"
                                value={queries[p.id] || ''}
                                onChange={val => setQueries(prev => ({ ...prev, [p.id]: val || '' }))}
                                theme="vs-dark"
                                options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, padding: { top: 10 } }}
                            />
                        </div>

                        {/* Query Results */}
                        <div style={{
                            background: '#1e1e1e', color: '#d4d4d4', padding: '12px', borderRadius: '8px',
                            fontSize: '12px', fontFamily: 'monospace', minHeight: '160px', maxHeight: '300px', overflowY: 'auto'
                        }}>
                            {!runResult ? (
                                <span style={{ color: '#6b7280' }}>Run your query to see results...</span>
                            ) : !runResult.success ? (
                                <span style={{ color: '#ef4444' }}>Error: {runResult.error}</span>
                            ) : runResult.rows && runResult.rows.length > 0 ? (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                                        <thead>
                                            <tr>
                                                {runResult.columns.map(col => (
                                                    <th key={col} style={{ padding: '4px 8px', borderBottom: '1px solid #444', textAlign: 'left', color: '#93c5fd' }}>{col}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {runResult.rows.slice(0, 50).map((row, i) => (
                                                <tr key={i}>
                                                    {runResult.columns.map(col => (
                                                        <td key={col} style={{ padding: '4px 8px', borderBottom: '1px solid #333' }}>{row[col] ?? 'NULL'}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div style={{ marginTop: '8px', color: '#6b7280' }}>
                                        {runResult.rows.length} row(s) returned
                                        {runResult.rows.length > 50 && ' (showing first 50)'}
                                    </div>
                                </div>
                            ) : (
                                <span style={{ color: '#22c55e' }}>{runResult.message || 'Query executed (no results)'}</span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Confirm Modal */}
            {showFinishConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: '#1e293b', borderRadius: '16px', padding: '28px', maxWidth: '400px',
                        width: '90%', border: '1px solid #334155', textAlign: 'center'
                    }}>
                        <Database size={36} color="#8b5cf6" style={{ marginBottom: '12px' }} />
                        <h3 style={{ margin: '0 0 8px', color: '#f1f5f9', fontSize: '18px' }}>Submit SQL?</h3>
                        <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 20px' }}>
                            Submit your SQL solutions? This will move to the Interview section.
                        </p>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setShowFinishConfirm(false)} style={{
                                flex: 1, padding: '10px', background: '#334155', color: '#94a3b8',
                                border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600
                            }}>Cancel</button>
                            <button onClick={finishSQL} style={{
                                flex: 1, padding: '10px', background: '#8b5cf6', color: 'white',
                                border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600
                            }}>Submit</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
