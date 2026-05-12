import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import { Play, Send, CheckCircle, XCircle, ChevronLeft, ChevronRight, Code2, Loader2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const LANGUAGE_OPTIONS = [
    { value: 'python', label: 'Python', monacoId: 'python' },
    { value: 'javascript', label: 'JavaScript', monacoId: 'javascript' },
    { value: 'java', label: 'Java', monacoId: 'java' },
    { value: 'c', label: 'C', monacoId: 'c' },
    { value: 'cpp', label: 'C++', monacoId: 'cpp' }
];

export default function SkillCodingTest({ attemptId, attemptData, onComplete, onFailed }) {
    const [problems, setProblems] = useState([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [code, setCode] = useState({});
    const [language, setLanguage] = useState({});
    const [output, setOutput] = useState('');
    const [customInput, setCustomInput] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [testResults, setTestResults] = useState(null);
    const [running, setRunning] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [finishing, setFinishing] = useState(false);
    const [showFinishConfirm, setShowFinishConfirm] = useState(false);
    const [submissions, setSubmissions] = useState({});
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);

    const [error, setError] = useState('');
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
        finishCoding(true);
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    useEffect(() => { startCoding(); }, []);

    const startCoding = async () => {
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/coding/start/${attemptId}`);
            setProblems(data.problems || []);
            setSubmissions(data.existing_submissions || {});
            // Initialize code and language for each problem
            const initCode = {};
            const initLang = {};
            (data.problems || []).forEach(p => {
                const defaultLang = 'python';
                let starter = '';

                if (p.starter_code && typeof p.starter_code === 'object') {
                    starter = p.starter_code[defaultLang] || getDefaultStarter(p, defaultLang);
                } else if (typeof p.starter_code === 'string') {
                    starter = p.starter_code;
                } else {
                    starter = getDefaultStarter(p, defaultLang);
                }

                initCode[p.id] = starter;
                initLang[p.id] = defaultLang;
            });
            setCode(initCode);
            setLanguage(initLang);
            if (data.duration_minutes) setTimeLeft(data.duration_minutes * 60);
            setLoading(false);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setLoading(false);
        }
    };

    const getDefaultStarter = (problem, lang) => {
        const title = problem.title || 'Solution';
        // Fallback templates if backend doesn't provide them
        if (lang === 'python') return `import sys\n\n# ${title}\ndef solution():\n    # Write your code here\n    pass\n\n# !!! DO NOT EDIT BELOW THIS LINE !!!\nif __name__ == '__main__':\n    # Default driver code (fallback)\n    lines = sys.stdin.read().split('\\n')\n    # ... print(solution(...))\n`;
        if (lang === 'javascript') return `const fs = require('fs');\n\n// ${title}\nfunction solution() {\n    // Write your code here\n}\n\n// !!! DO NOT EDIT BELOW THIS LINE !!!\ntry {\n    const input = fs.readFileSync(0, 'utf-8');\n    // ... console.log(solution(...))\n} catch (e) {}\n`;
        if (lang === 'java') return `import java.util.*;\n\npublic class Main {\n    public static void solution() {\n        // Write your code here\n    }\n\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // ...\n    }\n}\n`;
        if (lang === 'c') return `#include <stdio.h>\n#include <stdlib.h>\n\nvoid solution() {\n    // Write your code here\n}\n\nint main() {\n    // Driver code\n    return 0;\n}\n`;
        if (lang === 'cpp') return `#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nvoid solution() {\n    // Write your code here\n}\n\nint main() {\n    // Driver code\n    return 0;\n}\n`;
        return `// ${title}\n`;
    };

    const runCode = async () => {
        const p = problems[currentIdx];
        if (!p) return;
        setRunning(true);
        setOutput('');
        setTestResults(null);
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/coding/run`, {
                code: code[p.id] || '',
                language: language[p.id] || 'python',
                input_data: customInput || ' ' // Send a space if empty to ensure file is created
            });
            setOutput(data.success ? (data.output || 'No output') : (`Error:\n${data.error || data.output || 'Unknown error'}`));
        } catch (err) {
            setOutput('Error: ' + (err.response?.data?.error || err.message));
        } finally {
            setRunning(false);
        }
    };

    const submitCode = async () => {
        const p = problems[currentIdx];
        if (!p) return;
        setSubmitting(true);
        setTestResults(null);
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/coding/submit`, {
                attemptId,
                problemId: p.id,
                code: code[p.id] || '',
                language: language[p.id] || 'python'
            });
            setTestResults(data.test_results || []);
            if (data.all_passed) {
                setSubmissions(prev => ({ ...prev, [String(p.id)]: true }));
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const finishCoding = async () => {
        setShowFinishConfirm(false);
        setFinishing(true);
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/coding/finish/${attemptId}`);
            setResult(data);
            if (data.passed) {
                setTimeout(() => onComplete(data), 2000);
            } else {
                setTimeout(() => onFailed(), 3000);
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setFinishing(false);
        }
    };

    const [regenerating, setRegenerating] = useState(false);

    const retryLoadProblems = async () => {
        setRegenerating(true);
        setError('');
        try {
            // First try to force regenerate
            await axios.post(`${API}/api/skill-tests/coding/regenerate/${attemptId}`);
            // Then reload
            await startCoding();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to regenerate. Please try again.');
            setRegenerating(false);
        }
    };

    if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} /> Loading coding problems...</div>;

    if (!loading && problems.length === 0 && !result) {
        return (
            <div style={{ textAlign: 'center', padding: '60px' }}>
                <Code2 size={48} color="#64748b" style={{ marginBottom: '16px' }} />
                <h3 style={{ color: '#f1f5f9', margin: '0 0 8px' }}>No Coding Problems Available</h3>
                <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '20px' }}>
                    Problems couldn't be generated. Click below to regenerate them.
                </p>
                {error && <p style={{ color: '#fca5a5', fontSize: '13px', marginBottom: '16px' }}>{error}</p>}
                <button onClick={retryLoadProblems} disabled={regenerating} style={{
                    padding: '10px 24px', background: regenerating ? '#6d28d9' : '#8b5cf6', color: 'white', border: 'none',
                    borderRadius: '8px', cursor: regenerating ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '14px',
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    opacity: regenerating ? 0.7 : 1
                }}>
                    {regenerating ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Generating Problems...</> : '🔄 Regenerate Problems'}
                </button>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

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
                    {result.passed ? 'Coding Passed!' : 'Coding Failed'}
                </h2>
                <p style={{ fontSize: '18px', color: '#94a3b8' }}>
                    Solved: {result.solved}/{result.total} ({Math.round(result.score)}%)
                </p>
                <p style={{ fontSize: '14px', color: result.passed ? '#22c55e' : '#ef4444', marginTop: '12px' }}>
                    {result.passed ? 'Proceeding to SQL section...' : 'Assessment ended. Generating report...'}
                </p>
            </div>
        );
    }

    const p = problems[currentIdx];
    const solvedCount = Object.keys(submissions).length;

    return (
        <div>
            {/* Header */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 20px', background: '#1e293b', borderRadius: '10px', marginBottom: '16px',
                border: '1px solid #334155'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Code2 size={20} color="#8b5cf6" />
                    <span style={{ fontWeight: 700, fontSize: '15px', color: '#f1f5f9' }}>Coding Test</span>
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                        {solvedCount}/{problems.length} solved
                    </span>
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
                <button onClick={() => setShowFinishConfirm(true)} disabled={finishing} style={{
                    padding: '8px 20px', background: '#8b5cf6', color: 'white', border: 'none',
                    borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                    opacity: finishing ? 0.6 : 1
                }}>
                    {finishing ? 'Submitting...' : 'Finish Coding →'}
                </button>
            </div>

            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px', marginBottom: '12px', color: '#fca5a5', fontSize: '13px' }}>{error}</div>
            )}

            {/* Problem Navigator */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                {problems.map((pr, idx) => {
                    const isSolved = submissions[String(pr.id)];
                    return (
                        <button key={idx} onClick={() => { setCurrentIdx(idx); setOutput(''); setTestResults(null); }} style={{
                            padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            fontWeight: 600, fontSize: '12px',
                            background: idx === currentIdx ? '#8b5cf6' : isSolved ? '#22c55e' : '#334155',
                            color: (idx === currentIdx || isSolved) ? 'white' : '#94a3b8'
                        }}>
                            P{idx + 1} {isSolved ? '✓' : ''}
                        </button>
                    );
                })}
            </div>

            {p && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {/* Problem Description */}
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '16px', overflowY: 'auto', maxHeight: '600px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>{p.title}</h3>
                            {p.difficulty && (
                                <span style={{
                                    padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                    background: p.difficulty === 'hard' ? 'rgba(239,68,68,0.15)' : p.difficulty === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
                                    color: p.difficulty === 'hard' ? '#f87171' : p.difficulty === 'medium' ? '#fbbf24' : '#34d399'
                                }}>{p.difficulty}</span>
                            )}
                        </div>
                        <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#cbd5e1' }}>{p.description}</p>

                        {p.examples && p.examples.length > 0 && (
                            <div style={{ marginTop: '16px', background: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #334155' }}>
                                <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    📋 Sample Input/Output
                                </h4>
                                {p.examples.map((ex, i) => (
                                    <div key={i} style={{ background: '#1e293b', padding: '10px', borderRadius: '6px', marginBottom: '8px', fontSize: '12px', color: '#cbd5e1', fontFamily: 'monospace' }}>
                                        <div style={{ marginBottom: '6px' }}>
                                            <strong style={{ color: '#10b981' }}>Input:</strong>
                                            <pre style={{ margin: '4px 0 0', background: '#0f172a', padding: '6px', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>{ex.input}</pre>
                                        </div>
                                        <div>
                                            <strong style={{ color: '#10b981' }}>Expected Output:</strong>
                                            <pre style={{ margin: '4px 0 0', background: '#0f172a', padding: '6px', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>{ex.output}</pre>
                                        </div>
                                        {ex.explanation && <div style={{ color: '#94a3b8', marginTop: '6px', fontSize: '11px' }}><em>💡 {ex.explanation}</em></div>}
                                    </div>
                                ))}
                            </div>
                        )}

                        {p.constraints && (
                            <div style={{ marginTop: '16px' }}>
                                <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#94a3b8' }}>Constraints:</h4>
                                <p style={{ fontSize: '13px', color: '#64748b' }}>{p.constraints}</p>
                            </div>
                        )}

                        {/* Test Results */}
                        {testResults && (
                            <div style={{ marginTop: '16px', background: '#0f172a', border: '2px solid #334155', borderRadius: '8px', padding: '12px' }}>
                                <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    ✓ Test Results
                                </h4>
                                <div style={{ display: 'grid', gap: '8px' }}>
                                    {testResults.map((tr, i) => (
                                        <div key={i} style={{
                                            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px',
                                            background: tr.passed ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                            border: `1px solid ${tr.passed ? '#22c55e' : '#ef4444'}`,
                                            borderRadius: '6px', fontSize: '12px', color: '#cbd5e1'
                                        }}>
                                            {tr.passed ? <CheckCircle size={16} color="#22c55e" /> : <XCircle size={16} color="#ef4444" />}
                                            <span style={{ flex: 1 }}>
                                                <strong>Test Case {i + 1}:</strong> {tr.passed ? '✓ Passed' : '✗ Failed'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Editor + Output */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* Language Selector & Action Buttons */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <select value={language[p.id] || 'python'}
                                onChange={e => {
                                    const newLang = e.target.value;
                                    setLanguage(prev => ({ ...prev, [p.id]: newLang }));

                                    // Use backend starter code if available for this specific language
                                    const codeInStore = code[p.id];
                                    let newCode = '';
                                    if (p.starter_code && typeof p.starter_code === 'object' && p.starter_code[newLang]) {
                                        newCode = p.starter_code[newLang];
                                    } else {
                                        newCode = getDefaultStarter(p, newLang);
                                    }

                                    // Only reset if empty or default-ish? No, safer to just switch to starter code 
                                    // unless we want to persist user code when switching langs (hard)
                                    // For now, let's reset to starter code for the new language
                                    setCode(prev => ({ ...prev, [p.id]: newCode }));
                                }}
                                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #475569', fontSize: '13px', background: '#0f172a', color: '#f1f5f9', fontWeight: 600 }}>
                                {LANGUAGE_OPTIONS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                            </select>
                            <button onClick={runCode} disabled={running} style={{
                                padding: '8px 16px', background: '#10b981', color: 'white', border: 'none',
                                borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                                display: 'flex', alignItems: 'center', gap: '6px', opacity: running ? 0.6 : 1,
                                transition: 'all 0.2s'
                            }}>
                                {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                                <strong>▶ Check Your Code</strong>
                            </button>
                            <button onClick={submitCode} disabled={submitting} style={{
                                padding: '8px 16px', background: '#8b5cf6', color: 'white', border: 'none',
                                borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
                                display: 'flex', alignItems: 'center', gap: '6px', opacity: submitting ? 0.6 : 1,
                                transition: 'all 0.2s'
                            }}>
                                {submitting ? <Loader2 size={16} /> : <Send size={16} />}
                                <strong>Submit Solution</strong>
                            </button>
                        </div>

                        {/* Monaco Editor */}
                        <div style={{ border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', flex: 1, minHeight: '400px' }}>
                            <Editor
                                height="400px"
                                language={(LANGUAGE_OPTIONS.find(l => l.value === (language[p.id] || 'python'))?.monacoId) || 'python'}
                                value={code[p.id] || ''}
                                onChange={val => setCode(prev => ({ ...prev, [p.id]: val || '' }))}
                                theme="vs-dark"
                                options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, padding: { top: 10 } }}
                            />
                        </div>

                        {/* Custom Input Section */}
                        <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden' }}>
                            <button onClick={() => setShowCustomInput(!showCustomInput)} style={{
                                width: '100%', padding: '8px 12px', background: 'transparent', border: 'none',
                                color: '#94a3b8', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                borderBottom: showCustomInput ? '1px solid #334155' : 'none'
                            }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    ⌨️ Custom Input {customInput ? '(has input)' : ''}
                                </span>
                                <span>{showCustomInput ? '▲' : '▼'}</span>
                            </button>
                            {showCustomInput && (
                                <textarea
                                    value={customInput}
                                    onChange={e => setCustomInput(e.target.value)}
                                    placeholder="Enter custom input here (stdin)..."
                                    style={{
                                        width: '100%', minHeight: '70px', padding: '8px 12px', background: '#0f172a',
                                        color: '#f1f5f9', border: 'none', fontSize: '13px', fontFamily: 'monospace',
                                        resize: 'vertical', boxSizing: 'border-box', outline: 'none'
                                    }}
                                />
                            )}
                        </div>

                        {/* Output Terminal */}
                        <div style={{
                            background: '#0f172a', color: '#d4d4d4', padding: '12px', borderRadius: '8px',
                            fontSize: '13px', fontFamily: 'monospace', minHeight: '100px', maxHeight: '180px', overflowY: 'auto',
                            border: '2px solid #334155'
                        }}>
                            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: output ? '#10b981' : '#475569' }}></span>
                                OUTPUT TERMINAL
                            </div>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordWrap: 'break-word', color: output ? '#10b981' : '#64748b' }}>
                                {output || '(Run your code to see output here...)'}
                            </pre>
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
                        <Send size={36} color="#8b5cf6" style={{ marginBottom: '12px' }} />
                        <h3 style={{ margin: '0 0 8px', color: '#f1f5f9', fontSize: '18px' }}>Submit Coding?</h3>
                        <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 20px' }}>
                            Submit your coding solutions? This will move to the SQL section.
                        </p>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setShowFinishConfirm(false)} style={{
                                flex: 1, padding: '10px', background: '#334155', color: '#94a3b8',
                                border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600
                            }}>Cancel</button>
                            <button onClick={finishCoding} style={{
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
