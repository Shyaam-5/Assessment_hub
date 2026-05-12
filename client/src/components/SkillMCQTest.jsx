import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Clock, CheckCircle, XCircle, AlertTriangle, ChevronLeft, ChevronRight, Send, Shield } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function SkillMCQTest({ attemptId, attemptData, onComplete, onFailed }) {
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState({});
    const [currentIdx, setCurrentIdx] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [endTime, setEndTime] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [tabSwitchCount, setTabSwitchCount] = useState(0);
    const [showConfirm, setShowConfirm] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        startMCQ();
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    // Tab switch detection
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden) {
                setTabSwitchCount(prev => {
                    const newCount = prev + 1;
                    logProctoring('tab_switch', `Tab switch detected (count: ${newCount})`, newCount > 3 ? 'high' : 'medium');
                    return newCount;
                });
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []);

    const logProctoring = async (eventType, details, severity = 'low') => {
        try {
            await axios.post(`${API}/api/skill-tests/proctoring/log`, {
                attemptId, testStage: 'mcq', eventType, details, severity
            });
        } catch { }
    };

    const startMCQ = async () => {
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/mcq/start/${attemptId}`);
            setQuestions(data.questions || []);
            setAnswers(data.existing_answers || {});

            // Calculate end time — use server-provided end_time, or fallback to 30 min from now
            let end;
            if (data.end_time) {
                end = new Date(data.end_time);
            }
            // Fallback if end_time is missing or invalid
            if (!end || isNaN(end.getTime())) {
                end = new Date(Date.now() + 30 * 60 * 1000);
            }
            setEndTime(end);

            // Start timer
            timerRef.current = setInterval(() => {
                const now = new Date();
                const diff = Math.max(0, Math.floor((end - now) / 1000));
                setTimeLeft(diff);
                if (diff <= 0) {
                    clearInterval(timerRef.current);
                    submitMCQ(true);
                }
            }, 1000);

            setLoading(false);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setLoading(false);
        }
    };

    const selectAnswer = (questionId, option) => {
        setAnswers(prev => ({ ...prev, [String(questionId)]: option }));
    };

    const trySubmitMCQ = () => {
        const unanswered = questions.length - Object.keys(answers).length;
        if (unanswered > 0) {
            setShowConfirm(true);
            return;
        }
        submitMCQ(false);
    };

    const submitMCQ = async (autoSubmit = false) => {
        if (submitting) return;
        setShowConfirm(false);

        setSubmitting(true);
        if (timerRef.current) clearInterval(timerRef.current);

        try {
            const { data } = await axios.post(`${API}/api/skill-tests/mcq/submit`, { attemptId, answers });
            setResult(data);
            if (data.passed) {
                setTimeout(() => onComplete(data), 2000);
            } else {
                setTimeout(() => onFailed(), 3000);
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setSubmitting(false);
        }
    };

    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading MCQ questions...</div>;

    // Result View
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
                    {result.passed ? 'MCQ Passed!' : 'MCQ Failed'}
                </h2>
                <p style={{ fontSize: '18px', color: '#94a3b8' }}>
                    Score: {result.correct}/{result.total} ({Math.round(result.score)}%)
                </p>
                <p style={{ fontSize: '14px', color: result.passed ? '#22c55e' : '#ef4444', marginTop: '12px' }}>
                    {result.passed ? 'Proceeding to Coding section...' : 'Assessment ended. Generating report...'}
                </p>
            </div>
        );
    }

    const q = questions[currentIdx];
    const answeredCount = Object.keys(answers).length;

    return (
        <div style={{ paddingBottom: '80px' }}>
            {/* Top Bar */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 20px', background: '#1e293b', borderRadius: '10px', marginBottom: '20px',
                border: '1px solid #334155'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontWeight: 700, fontSize: '15px', color: '#f1f5f9' }}>MCQ Test</span>
                    <span style={{ fontSize: '13px', color: '#94a3b8' }}>
                        {answeredCount}/{questions.length} answered
                    </span>
                </div>

                <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px',
                    background: timeLeft < 60 ? 'rgba(239,68,68,0.15)' : timeLeft < 300 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                    borderRadius: '20px', fontWeight: 700, fontSize: '16px',
                    color: timeLeft < 60 ? '#f87171' : timeLeft < 300 ? '#fbbf24' : '#34d399'
                }}>
                    <Clock size={16} /> {formatTime(timeLeft)}
                </div>

                <button onClick={trySubmitMCQ} disabled={submitting} style={{
                    padding: '8px 20px', background: '#8b5cf6', color: 'white', border: 'none',
                    borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                    display: 'flex', alignItems: 'center', gap: '6px', opacity: submitting ? 0.6 : 1
                }}>
                    <Send size={14} /> Submit All
                </button>
            </div>

            {/* Tab Switch Warning */}
            {tabSwitchCount > 0 && (
                <div style={{
                    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px',
                    padding: '8px 16px', marginBottom: '16px', fontSize: '12px', color: '#fbbf24',
                    display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                    <Shield size={14} /> Warning: {tabSwitchCount} tab switch(es) detected. This is being monitored.
                </div>
            )}

            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#fca5a5', fontSize: '13px' }}>
                    {error}
                </div>
            )}

            {/* Question Navigator */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
                {questions.map((q, idx) => {
                    const isAnswered = answers[String(q.id)] !== undefined;
                    const isCurrent = idx === currentIdx;
                    return (
                        <button key={idx} onClick={() => setCurrentIdx(idx)} style={{
                            width: '34px', height: '34px', borderRadius: '8px', border: 'none',
                            cursor: 'pointer', fontWeight: 600, fontSize: '12px',
                            background: isCurrent ? '#8b5cf6' : isAnswered ? '#22c55e' : '#334155',
                            color: (isCurrent || isAnswered) ? 'white' : '#94a3b8'
                        }}>
                            {idx + 1}
                        </button>
                    );
                })}
            </div>

            {/* Question */}
            {q && (
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <span style={{ fontSize: '13px', color: '#8b5cf6', fontWeight: 600 }}>
                            Question {currentIdx + 1} of {questions.length}
                        </span>
                        {q.difficulty && (
                            <span style={{
                                padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                background: q.difficulty === 'hard' ? '#fee2e2' : q.difficulty === 'medium' ? '#fef3c7' : '#dcfce7',
                                color: q.difficulty === 'hard' ? '#dc2626' : q.difficulty === 'medium' ? '#d97706' : '#16a34a'
                            }}>
                                {q.difficulty}
                            </span>
                        )}
                    </div>

                    <p style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', lineHeight: 1.5, color: '#f1f5f9' }}>
                        {q.question}
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {(q.options || []).map((opt, optIdx) => {
                            const optionLabel = String.fromCharCode(65 + optIdx); // A, B, C, D
                            const isSelected = answers[String(q.id)] === optionLabel;
                            return (
                                <button key={optIdx} onClick={() => selectAnswer(q.id, optionLabel)} style={{
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    padding: '14px 16px', borderRadius: '10px', cursor: 'pointer',
                                    background: isSelected ? 'rgba(139,92,246,0.15)' : '#0f172a',
                                    border: isSelected ? '2px solid #8b5cf6' : '1px solid #475569',
                                    textAlign: 'left', fontSize: '14px', transition: 'all 0.15s', color: '#e2e8f0'
                                }}>
                                    <span style={{
                                        width: '28px', height: '28px', borderRadius: '50%', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700,
                                        background: isSelected ? '#8b5cf6' : '#1e293b',
                                        color: isSelected ? 'white' : '#94a3b8', flexShrink: 0
                                    }}>
                                        {optionLabel}
                                    </span>
                                    <span>{opt}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Navigation */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                        <button onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0}
                            style={{
                                padding: '8px 16px', background: '#334155', border: '1px solid #475569',
                                borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#94a3b8',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                opacity: currentIdx === 0 ? 0.4 : 1
                            }}>
                            <ChevronLeft size={14} /> Previous
                        </button>
                        <button onClick={() => setCurrentIdx(Math.min(questions.length - 1, currentIdx + 1))}
                            disabled={currentIdx === questions.length - 1}
                            style={{
                                padding: '8px 16px', background: '#8b5cf6', color: 'white', border: 'none',
                                borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                opacity: currentIdx === questions.length - 1 ? 0.4 : 1
                            }}>
                            Next <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Custom Confirm Modal (replaces window.confirm to avoid fullscreen exit) */}
            {showConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: '#1e293b', borderRadius: '16px', padding: '28px', maxWidth: '400px',
                        width: '90%', border: '1px solid #334155', textAlign: 'center'
                    }}>
                        <AlertTriangle size={36} color="#fbbf24" style={{ marginBottom: '12px' }} />
                        <h3 style={{ margin: '0 0 8px', color: '#f1f5f9', fontSize: '18px' }}>Unanswered Questions</h3>
                        <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 20px' }}>
                            You have {questions.length - Object.keys(answers).length} unanswered question(s). Submit anyway?
                        </p>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setShowConfirm(false)} style={{
                                flex: 1, padding: '10px', background: '#334155', color: '#94a3b8',
                                border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600
                            }}>Cancel</button>
                            <button onClick={() => submitMCQ(false)} style={{
                                flex: 1, padding: '10px', background: '#8b5cf6', color: 'white',
                                border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600
                            }}>Submit Anyway</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
