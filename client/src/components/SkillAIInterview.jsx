import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Mic, MicOff, Send, CheckCircle, XCircle, MessageSquare, Volume2, VolumeX, Loader2 } from 'lucide-react';
import AvatarInterviewer from './AvatarInterviewer';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function SkillAIInterview({ attemptId, attemptData, onComplete, onFailed }) {
    const [question, setQuestion] = useState('');
    const [category, setCategory] = useState('');
    const [difficulty, setDifficulty] = useState('medium');
    const [questionNumber, setQuestionNumber] = useState(1);
    const [totalQuestions, setTotalQuestions] = useState(5);
    const [answer, setAnswer] = useState('');
    const [feedback, setFeedback] = useState(null);
    const [avatarState, setAvatarState] = useState('idle');
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [ttsEnabled, setTtsEnabled] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState([]);
    const [error, setError] = useState('');
    const [timeLeft, setTimeLeft] = useState(null);
    const recognitionRef = useRef(null);
    const synthRef = useRef(null);
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
        onFailed(); // Force fail if time runs out
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    useEffect(() => {
        synthRef.current = window.speechSynthesis;
        startInterview();
        return () => {
            stopListening();
            if (synthRef.current) synthRef.current.cancel();
        };
    }, []);

    const startInterview = async () => {
        try {
            const { data } = await axios.post(`${API}/api/skill-tests/interview/start/${attemptId}`);
            setQuestion(data.question);
            setCategory(data.category || '');
            setDifficulty(data.difficulty || 'medium');
            setQuestionNumber(data.question_number);
            setTotalQuestions(data.total_questions);
            if (data.duration_minutes) setTimeLeft(data.duration_minutes * 60);
            setLoading(false);
            // Speak the question
            if (ttsEnabled) speakText(data.question);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setLoading(false);
        }
    };

    const speakText = (text) => {
        if (!synthRef.current || !ttsEnabled) return;
        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1;
        utterance.volume = 0.8;
        utterance.onstart = () => { setIsSpeaking(true); setAvatarState('speaking'); };
        utterance.onend = () => { setIsSpeaking(false); setAvatarState('idle'); };
        utterance.onerror = () => { setIsSpeaking(false); setAvatarState('idle'); };
        synthRef.current.speak(utterance);
    };

    const startListening = () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            setError('Speech recognition not supported in this browser. Please type your answer.');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        let finalTranscript = answer;

        recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript + ' ';
                } else {
                    interim += event.results[i][0].transcript;
                }
            }
            setAnswer(finalTranscript + interim);
        };

        recognition.onend = () => {
            setIsListening(false);
            setAvatarState('idle');
        };

        recognition.onerror = (event) => {
            if (event.error !== 'no-speech') {
                console.error('Speech error:', event.error);
            }
            setIsListening(false);
            setAvatarState('idle');
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
        setAvatarState('listening');

        // Stop any TTS
        if (synthRef.current) synthRef.current.cancel();
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setIsListening(false);
        setAvatarState('idle');
    };

    const submitAnswer = async () => {
        if (!answer.trim()) return setError('Please provide an answer');
        setSubmitting(true);
        setError('');
        setFeedback(null);
        setAvatarState('thinking');
        stopListening();

        try {
            const { data } = await axios.post(`${API}/api/skill-tests/interview/answer`, { attemptId, answer: answer.trim() });

            // Save to history
            setHistory(prev => [...prev, {
                question, answer: answer.trim(),
                score: data.score, feedback: data.feedback
            }]);

            setFeedback({ score: data.score, feedback: data.feedback });

            if (data.is_complete) {
                setResult({
                    passed: data.passed,
                    overall_score: data.overall_score,
                    status: data.status
                });
                setAvatarState('idle');
                if (data.passed) {
                    setTimeout(() => onComplete(data), 3000);
                } else {
                    setTimeout(() => onFailed(), 3000);
                }
            } else {
                // Move to next question after showing feedback
                setTimeout(() => {
                    setQuestion(data.next_question);
                    setCategory(data.next_category || '');
                    setDifficulty(data.next_difficulty || 'medium');
                    setQuestionNumber(data.question_number);
                    setAnswer('');
                    setFeedback(null);
                    setAvatarState('idle');
                    if (ttsEnabled) speakText(data.next_question);
                }, 3000);
            }
        } catch (err) {
            setError(err.response?.data?.error || err.message);
            setAvatarState('idle');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Starting AI Interview...</div>;

    if (result) {
        return (
            <div style={{ textAlign: 'center', padding: '60px' }}>
                <AvatarInterviewer state="idle" size={160} />
                <div style={{ marginTop: '20px' }}>
                    <div style={{
                        width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto 20px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: result.passed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'
                    }}>
                        {result.passed ? <CheckCircle size={40} color="#22c55e" /> : <XCircle size={40} color="#ef4444" />}
                    </div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px', color: '#f1f5f9' }}>
                        {result.passed ? 'Interview Passed!' : 'Interview Not Passed'}
                    </h2>
                    <p style={{ fontSize: '18px', color: '#94a3b8' }}>
                        Average Score: {(result.overall_score || 0).toFixed(1)}/10
                    </p>
                    <p style={{ fontSize: '14px', color: result.passed ? '#22c55e' : '#ef4444', marginTop: '12px' }}>
                        {result.passed ? 'Assessment complete! Generating report...' : 'Assessment ended. Generating report...'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px' }}>
            {/* Left: Avatar + Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <AvatarInterviewer state={avatarState} size={220} />

                {timeLeft !== null && (
                    <div style={{
                        padding: '6px 16px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
                        background: timeLeft < 300 ? 'rgba(239,68,68,0.2)' : 'rgba(139,92,246,0.15)',
                        color: timeLeft < 300 ? '#fca5a5' : '#a78bfa',
                        border: '1px solid ' + (timeLeft < 300 ? 'rgba(239,68,68,0.4)' : 'rgba(139,92,246,0.3)'),
                        marginBottom: '8px'
                    }}>
                        Time Left: {formatTime(timeLeft)}
                    </div>
                )}

                {/* Question Meta */}
                <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#8b5cf6' }}>
                        Question {questionNumber}/{totalQuestions}
                    </span>
                    {category && (
                        <div style={{
                            marginTop: '4px', padding: '2px 10px', borderRadius: '12px',
                            background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontSize: '11px', fontWeight: 600, display: 'inline-block'
                        }}>{category}</div>
                    )}
                </div>

                {/* TTS Toggle */}
                <button onClick={() => {
                    const newVal = !ttsEnabled;
                    setTtsEnabled(newVal);
                    if (!newVal && synthRef.current) synthRef.current.cancel();
                }} style={{
                    padding: '8px 14px', background: ttsEnabled ? 'rgba(34,197,94,0.1)' : '#334155',
                    border: '1px solid ' + (ttsEnabled ? 'rgba(34,197,94,0.3)' : '#475569'),
                    borderRadius: '8px', cursor: 'pointer', fontSize: '12px', color: '#f1f5f9',
                    display: 'flex', alignItems: 'center', gap: '6px'
                }}>
                    {ttsEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    Voice {ttsEnabled ? 'On' : 'Off'}
                </button>

                {/* Previous Q&A History */}
                {history.length > 0 && (
                    <div style={{
                        width: '100%', maxHeight: '200px', overflowY: 'auto',
                        background: '#0f172a', borderRadius: '8px', padding: '10px', fontSize: '11px'
                    }}>
                        <div style={{ fontWeight: 600, marginBottom: '6px', color: '#94a3b8' }}>Previous Answers</div>
                        {history.map((h, i) => (
                            <div key={i} style={{ marginBottom: '8px', padding: '6px', background: '#1e293b', borderRadius: '4px' }}>
                                <div style={{ fontWeight: 600, color: '#cbd5e1' }}>Q{i + 1}: {h.question.slice(0, 50)}...</div>
                                <div style={{ color: h.score >= 7 ? '#22c55e' : h.score >= 5 ? '#f59e0b' : '#ef4444' }}>
                                    Score: {h.score}/10
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Right: Question + Answer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px', color: '#fca5a5', fontSize: '13px' }}>{error}</div>
                )}

                {/* Question */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <MessageSquare size={18} color="#8b5cf6" />
                        <span style={{ fontWeight: 700, fontSize: '14px', color: '#8b5cf6' }}>Interviewer</span>
                        {difficulty && (
                            <span style={{
                                padding: '2px 8px', borderRadius: '12px', fontSize: '11px',
                                background: difficulty === 'hard' ? 'rgba(239,68,68,0.15)' : difficulty === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
                                color: difficulty === 'hard' ? '#f87171' : difficulty === 'medium' ? '#fbbf24' : '#34d399'
                            }}>{difficulty}</span>
                        )}
                    </div>
                    <p style={{ fontSize: '16px', lineHeight: 1.6, color: '#f1f5f9', margin: 0 }}>{question}</p>
                    {!isSpeaking && ttsEnabled && (
                        <button onClick={() => speakText(question)} style={{
                            marginTop: '8px', background: 'none', border: 'none', cursor: 'pointer',
                            color: '#8b5cf6', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px'
                        }}>
                            <Volume2 size={14} /> Replay
                        </button>
                    )}
                </div>

                {/* Feedback from previous answer */}
                {feedback && (
                    <div style={{
                        background: feedback.score >= 7 ? 'rgba(34,197,94,0.1)' : feedback.score >= 5 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                        border: '1px solid ' + (feedback.score >= 7 ? 'rgba(34,197,94,0.3)' : feedback.score >= 5 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'),
                        borderRadius: '10px', padding: '16px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#f1f5f9' }}>Feedback</span>
                            <span style={{
                                fontWeight: 700, fontSize: '16px',
                                color: feedback.score >= 7 ? '#22c55e' : feedback.score >= 5 ? '#d97706' : '#ef4444'
                            }}>
                                {feedback.score}/10
                            </span>
                        </div>
                        <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>{feedback.feedback}</p>
                        {!result && <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>Next question coming up...</p>}
                    </div>
                )}

                {/* Answer Input */}
                {!feedback && !result && (
                    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span style={{ fontWeight: 600, fontSize: '14px', color: '#f1f5f9' }}>Your Answer</span>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>
                                {answer.split(/\s+/).filter(Boolean).length} words
                            </span>
                        </div>

                        <textarea
                            value={answer}
                            onChange={e => setAnswer(e.target.value)}
                            placeholder="Type your answer or use the microphone..."
                            rows={6}
                            style={{
                                width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #475569',
                                fontSize: '14px', lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box',
                                background: isListening ? 'rgba(34,197,94,0.1)' : '#0f172a', color: '#f1f5f9'
                            }}
                        />

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                            <button onClick={isListening ? stopListening : startListening} style={{
                                padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px',
                                background: isListening ? '#ef4444' : '#22c55e', color: 'white'
                            }}>
                                {isListening ? <><MicOff size={16} /> Stop Recording</> : <><Mic size={16} /> Start Speaking</>}
                            </button>

                            <button onClick={submitAnswer} disabled={submitting || !answer.trim()} style={{
                                padding: '10px 24px', background: '#8b5cf6', color: 'white', border: 'none',
                                borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '14px',
                                display: 'flex', alignItems: 'center', gap: '8px',
                                opacity: (submitting || !answer.trim()) ? 0.5 : 1
                            }}>
                                {submitting ? <><Loader2 size={16} /> Evaluating...</> : <><Send size={16} /> Submit Answer</>}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
