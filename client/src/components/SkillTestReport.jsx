import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    FileText, CheckCircle, XCircle, AlertTriangle, ArrowLeft, Brain, Code2, Database, MessageSquare, Shield, Camera, Smartphone, ArrowRightLeft, Maximize,
    TrendingUp, Target, Calendar, Award, BookOpen, Activity, ChevronRight, Zap
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Cell, PieChart, Pie
} from 'recharts';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function SkillTestReport({ attemptId, onBack, initialData = null, isEmbedded = false }) {
    const [data, setData] = useState(initialData);
    const [loading, setLoading] = useState(!initialData);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!initialData && attemptId) loadReport();
    }, [attemptId, initialData]);

    const loadReport = async () => {
        try {
            setLoading(true);
            const { data: resp } = await axios.get(`${API}/api/skill-tests/report/${attemptId}`);
            setData(resp);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', color: '#94a3b8', gap: '10px' }}>
            <Activity className="animate-spin" /> Generating comprehensive report...
        </div>
    );
    if (error) return <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>{error}</div>;
    // Handle both nested format (new API) and flat format (legacy/cached)
    const attempt = data?.attempt || data;
    const violations = data?.violations || data?.proctoring_logs || [];

    if (!attempt || !attempt.id) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Report data unavailable</div>;
    const passed = attempt.overall_status === 'completed';
    // Ensure report is an object
    const report = (attempt.report && typeof attempt.report === 'object') ? attempt.report : {};

    // ─── Data Prep for Charts ─────────────────────────────────────────────

    // 1. Performance Metrics (Radar)
    const metricsData = report.performance_metrics ? [
        { subject: 'Accuracy', A: report.performance_metrics.accuracy || 0, fullMark: 100 },
        { subject: 'Speed', A: report.performance_metrics.speed || 0, fullMark: 100 },
        { subject: 'Completeness', A: report.performance_metrics.completeness || 0, fullMark: 100 },
        { subject: 'Code Quality', A: report.performance_metrics.code_quality || 0, fullMark: 100 },
        { subject: 'Best Practices', A: report.performance_metrics.best_practices || (report.performance_metrics.code_quality ? report.performance_metrics.code_quality - 5 : 0), fullMark: 100 },
    ] : [];

    // 2. Concept Mastery (Bar)
    let masteryData = [];
    if (report.concept_mastery) {
        masteryData = Object.entries(report.concept_mastery).map(([name, score]) => ({
            name, score
        })).sort((a, b) => b.score - a.score).slice(0, 8);
    } else if (report.skill_ratings) {
        masteryData = Object.entries(report.skill_ratings).map(([name, score]) => ({
            name, score: score * 10
        }));
    }

    const sections = [
        { key: 'mcq', label: 'MCQ Test', icon: <Brain size={18} />, score: Number(attempt.mcq_score || 0), status: attempt.mcq_status, color: '#8b5cf6' },
        { key: 'coding', label: 'Coding Test', icon: <Code2 size={18} />, score: Number(attempt.coding_score || 0), status: attempt.coding_status, color: '#3b82f6' },
        { key: 'sql', label: 'SQL Test', icon: <Database size={18} />, score: Number(attempt.sql_score || 0), status: attempt.sql_status, color: '#10b981' },
        { key: 'interview', label: 'AI Interview', icon: <MessageSquare size={18} />, score: Number(attempt.interview_score || 0), status: attempt.interview_status, isOutOf10: true, color: '#f59e0b' },
    ];

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
            {/* Header */}
            {!isEmbedded && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <button onClick={onBack} style={{
                        padding: '8px 16px', background: '#334155', border: '1px solid #475569',
                        borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#94a3b8',
                        display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
                    }}>
                        <ArrowLeft size={16} /> Back
                    </button>
                    <div style={{ textAlign: 'right' }}>
                        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#f1f5f9' }}>Detailed Skill Report</h1>
                        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>Generated on {new Date(attempt.created_at).toLocaleDateString()}</p>
                    </div>
                </div>
            )}

            {/* Top Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', marginBottom: '32px' }}>

                {/* 1. Overall Status Card */}
                <div style={{
                    background: passed ? 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(6,95,70,0.2))' : 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(153,27,27,0.2))',
                    border: '1px solid ' + (passed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'),
                    borderRadius: '16px', padding: '32px', textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        width: '80px', height: '80px', borderRadius: '50%', marginBottom: '16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: '#0f172a', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        border: `2px solid ${passed ? '#22c55e' : '#ef4444'}`
                    }}>
                        {passed ? <Award size={40} color="#22c55e" /> : <Activity size={40} color="#ef4444" />}
                    </div>
                    <h2 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 800, color: '#f1f5f9' }}>
                        {passed ? 'Excellent Work!' : 'Needs Improvement'}
                    </h2>
                    <span style={{
                        padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                        background: passed ? '#22c55e' : '#ef4444', color: 'white', marginTop: '8px'
                    }}>
                        {attempt.overall_status === 'completed' ? 'PASSED' :
                            attempt.mcq_status === 'failed' ? 'MCQ FAILED' :
                                attempt.coding_status === 'failed' ? 'CODING FAILED' :
                                    attempt.sql_status === 'failed' ? 'SQL FAILED' :
                                        attempt.interview_status === 'failed' ? 'INTERVIEW FAILED' : 'NOT PASSED'}
                    </span>
                </div>

                {/* 2. Score Breakdown */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    {sections.map(s => {
                        const isPassed = s.status === 'completed' || s.status === 'passed';
                        const isPending = !s.status || s.status === 'pending';
                        const val = s.isOutOf10 ? (s.score || 0) * 10 : (s.score || 0); // Normalize for visual
                        return (
                            <div key={s.key} style={{
                                background: '#1e293b', border: '1px solid #334155', borderRadius: '16px',
                                padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                                position: 'relative', overflow: 'hidden'
                            }}>
                                <div style={{
                                    position: 'absolute', bottom: 0, left: 0, width: '100%', height: '4px', background: '#334155'
                                }}>
                                    <div style={{ width: `${val}%`, height: '100%', background: s.color, transition: 'width 1s ease-out' }} />
                                </div>
                                <div style={{ marginBottom: '12px', color: s.color, background: `${s.color}15`, padding: '8px', borderRadius: '10px' }}>
                                    {s.icon}
                                </div>
                                <div style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: 600 }}>{s.label}</div>
                                <div style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', marginTop: '4px' }}>
                                    {s.isOutOf10 ? (s.score || 0).toFixed(1) : Math.round(s.score || 0)}
                                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>{s.isOutOf10 ? '/10' : '%'}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* AI Summary & Charts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>

                {/* AI Executive Summary */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '24px' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Brain color="#8b5cf6" size={20} /> AI Assessment Summary
                    </h3>
                    <div style={{ fontSize: '14px', lineHeight: '1.7', color: '#cbd5e1' }}>
                        {report.summary || report.overall_assessment || "No summary available."}
                    </div>

                    {report.behavioral_analysis && (
                        <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(59,130,246,0.1)', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.2)' }}>
                            <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 700, color: '#60a5fa' }}>Behavioral Analysis</h4>
                            <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1' }}>{report.behavioral_analysis}</p>
                        </div>
                    )}
                </div>

                {/* Performance Radar */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#f1f5f9', alignSelf: 'flex-start' }}>Performance Metrics</h3>
                    {metricsData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={metricsData}>
                                <PolarGrid stroke="#475569" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar name="Performance" dataKey="A" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.4} />
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
                                <Legend />
                            </RadarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ color: '#64748b', fontStyle: 'italic', marginTop: '40px' }}>Not enough data for metrics</div>
                    )}
                </div>
            </div>

            {/* Concept Mastery & Skill Gap */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>

                {/* Concept Mastery Bar Chart */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '24px' }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: '#f1f5f9' }}>Concept Mastery</h3>
                    {masteryData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={masteryData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                                <XAxis type="number" domain={[0, 100]} stroke="#64748b" ticCount={5} />
                                <YAxis dataKey="name" type="category" width={100} stroke="#94a3b8" fontSize={11} />
                                <Tooltip cursor={{ fill: '#334155', opacity: 0.4 }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }} />
                                <Bar dataKey="score" fill="#10b981" radius={[0, 4, 4, 0]}>
                                    {masteryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.score >= 80 ? '#10b981' : entry.score >= 60 ? '#f59e0b' : '#ef4444'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ color: '#64748b' }}>No concept data available</div>
                    )}
                </div>

                {/* Skill Gap Analysis */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '24px', overflowY: 'auto', maxHeight: '400px' }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Target color="#ef4444" size={20} /> Skill Gap Analysis
                    </h3>
                    {report.skill_gap_analysis ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {report.skill_gap_analysis.map((gap, i) => (
                                <div key={i} style={{
                                    padding: '16px', background: '#0f172a', borderRadius: '12px', border: '1px solid #334155'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{gap.skill}</span>
                                        <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ color: '#94a3b8' }}>{gap.current_level}</span>
                                            <ChevronRight size={12} color="#64748b" />
                                            <span style={{ color: '#22c55e', fontWeight: 700 }}>{gap.target_level}</span>
                                        </div>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: '1.5' }}>{gap.gap_description}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {report.weaknesses && report.weaknesses.map((w, i) => (
                                <div key={i} style={{ padding: '12px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', color: '#fca5a5', fontSize: '13px' }}>
                                    • {w}
                                </div>
                            ))}
                            {!report.weaknesses && <div style={{ color: '#94a3b8' }}>No specific gap analysis available.</div>}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══════════════════════ SECTION-WISE DETAILED FEEDBACK ═══════════════════════ */}
            {report.section_feedback && (
                <div style={{ marginBottom: '32px' }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: '20px', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <BookOpen color="#8b5cf6" size={24} /> Section-wise Detailed Feedback
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {[
                            { key: 'mcq', label: 'MCQ Analysis', icon: <Brain size={18} />, color: '#8b5cf6' },
                            { key: 'coding', label: 'Coding Analysis', icon: <Code2 size={18} />, color: '#3b82f6' },
                            { key: 'sql', label: 'SQL Analysis', icon: <Database size={18} />, color: '#10b981' },
                            { key: 'interview', label: 'Interview Analysis', icon: <MessageSquare size={18} />, color: '#f59e0b' },
                        ].map(sec => (
                            report.section_feedback[sec.key] && (
                                <div key={sec.key} style={{
                                    background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '20px'
                                }}>
                                    <h4 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 700, color: sec.color, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {sec.icon} {sec.label}
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.7', color: '#cbd5e1' }}>
                                        {report.section_feedback[sec.key]}
                                    </p>
                                </div>
                            )
                        ))}
                    </div>
                </div>
            )}

            {/* ═══════════════════════ SKILL-WISE SCORES ═══════════════════════ */}
            {report.skill_wise_scores && Object.keys(report.skill_wise_scores).length > 0 && (
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '24px', marginBottom: '32px' }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Zap color="#f59e0b" size={20} /> Skill-wise Assessment
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                        {Object.entries(report.skill_wise_scores).sort((a, b) => b[1] - a[1]).map(([skill, score], i) => (
                            <div key={i} style={{
                                padding: '14px 16px', background: '#0f172a', borderRadius: '12px', border: '1px solid #334155'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9', textTransform: 'capitalize' }}>{skill}</span>
                                    <span style={{
                                        fontSize: '13px', fontWeight: 800,
                                        color: score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444'
                                    }}>{score}%</span>
                                </div>
                                <div style={{ width: '100%', height: '6px', background: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${score}%`, height: '100%', borderRadius: '3px',
                                        background: score >= 80 ? 'linear-gradient(90deg, #22c55e, #10b981)' : score >= 60 ? 'linear-gradient(90deg, #f59e0b, #eab308)' : 'linear-gradient(90deg, #ef4444, #dc2626)',
                                        transition: 'width 1s ease-out'
                                    }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══════════════════════ MCQ QUESTION-WISE ANALYSIS ═══════════════════════ */}
            {report.mcq_question_analysis && report.mcq_question_analysis.length > 0 && (
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '24px', marginBottom: '32px' }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Brain color="#8b5cf6" size={20} /> MCQ Question-wise Analysis
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {report.mcq_question_analysis.map((q, i) => (
                            <div key={i} style={{
                                padding: '14px 16px', background: '#0f172a', borderRadius: '12px',
                                border: `1px solid ${q.correct ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                display: 'flex', gap: '12px', alignItems: 'flex-start'
                            }}>
                                <div style={{
                                    minWidth: '28px', height: '28px', borderRadius: '50%',
                                    background: q.correct ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px'
                                }}>
                                    {q.correct ? <CheckCircle size={16} color="#22c55e" /> : <XCircle size={16} color="#ef4444" />}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>Q{i + 1}: {q.question_summary}</span>
                                        {q.skill && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>{q.skill}</span>}
                                    </div>
                                    <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8', lineHeight: '1.5' }}>{q.feedback}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══════════════════════ CODING PROBLEM-WISE ANALYSIS ═══════════════════════ */}
            {report.coding_problem_analysis && report.coding_problem_analysis.length > 0 && (
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '24px', marginBottom: '32px' }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Code2 color="#3b82f6" size={20} /> Coding Problem-wise Feedback
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {report.coding_problem_analysis.map((p, i) => (
                            <div key={i} style={{
                                padding: '16px', background: '#0f172a', borderRadius: '12px',
                                border: `1px solid ${p.solved ? 'rgba(59,130,246,0.3)' : 'rgba(245,158,11,0.3)'}`
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>{p.problem_title || `Problem ${i + 1}`}</span>
                                    <span style={{
                                        fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '10px',
                                        background: p.solved ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                        color: p.solved ? '#22c55e' : '#ef4444'
                                    }}>{p.solved ? '✓ Solved' : '✗ Not Solved'}</span>
                                </div>
                                <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>{p.feedback}</p>
                                {p.improvement_tip && (
                                    <div style={{
                                        padding: '8px 12px', borderRadius: '8px', background: 'rgba(59,130,246,0.08)',
                                        border: '1px solid rgba(59,130,246,0.15)', fontSize: '12px', color: '#93c5fd'
                                    }}>
                                        💡 <strong>Tip:</strong> {p.improvement_tip}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══════════════════════ SQL PROBLEM-WISE ANALYSIS ═══════════════════════ */}
            {report.sql_problem_analysis && report.sql_problem_analysis.length > 0 && (
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '24px', marginBottom: '32px' }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Database color="#10b981" size={20} /> SQL Problem-wise Feedback
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {report.sql_problem_analysis.map((p, i) => (
                            <div key={i} style={{
                                padding: '16px', background: '#0f172a', borderRadius: '12px',
                                border: `1px solid ${p.solved ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>{p.problem_title || `SQL Problem ${i + 1}`}</span>
                                    <span style={{
                                        fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '10px',
                                        background: p.solved ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                        color: p.solved ? '#22c55e' : '#ef4444'
                                    }}>{p.solved ? '✓ Correct' : '✗ Incorrect'}</span>
                                </div>
                                <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>{p.feedback}</p>
                                {p.improvement_tip && (
                                    <div style={{
                                        padding: '8px 12px', borderRadius: '8px', background: 'rgba(16,185,129,0.08)',
                                        border: '1px solid rgba(16,185,129,0.15)', fontSize: '12px', color: '#6ee7b7'
                                    }}>
                                        💡 <strong>Tip:</strong> {p.improvement_tip}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══════════════════════ INTERVIEW QUESTION-WISE FEEDBACK ═══════════════════════ */}
            {report.interview_feedback && report.interview_feedback.length > 0 && (
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '24px', marginBottom: '32px' }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <MessageSquare color="#f59e0b" size={20} /> Interview Question-wise Feedback
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {report.interview_feedback.map((q, i) => {
                            const scoreColor = (q.score || 0) >= 7 ? '#22c55e' : (q.score || 0) >= 5 ? '#f59e0b' : '#ef4444';
                            return (
                                <div key={i} style={{
                                    padding: '16px', background: '#0f172a', borderRadius: '12px',
                                    border: '1px solid #334155'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9', flex: 1 }}>Q{i + 1}: {q.question_summary}</span>
                                        <span style={{
                                            fontSize: '14px', fontWeight: 800, color: scoreColor,
                                            minWidth: '50px', textAlign: 'right'
                                        }}>{q.score || 0}/10</span>
                                    </div>
                                    <div style={{ width: '100%', height: '4px', background: '#334155', borderRadius: '2px', marginBottom: '10px' }}>
                                        <div style={{
                                            width: `${((q.score || 0) / 10) * 100}%`, height: '100%', borderRadius: '2px',
                                            background: scoreColor, transition: 'width 1s ease-out'
                                        }} />
                                    </div>
                                    <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>{q.feedback}</p>
                                    {q.improvement_tip && (
                                        <div style={{
                                            padding: '8px 12px', borderRadius: '8px', background: 'rgba(245,158,11,0.08)',
                                            border: '1px solid rgba(245,158,11,0.15)', fontSize: '12px', color: '#fbbf24'
                                        }}>
                                            💡 <strong>Improve:</strong> {q.improvement_tip}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Personalized Roadmap */}
            {report.roadmap && (
                <div style={{ marginBottom: '32px' }}>
                    <h3 style={{ margin: '0 0 20px', fontSize: '20px', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Calendar color="#3b82f6" size={24} /> Personalized Improvement Roadmap
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                        {report.roadmap.map((step, i) => (
                            <div key={i} style={{
                                background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '20px',
                                position: 'relative'
                            }}>
                                <div style={{
                                    position: 'absolute', top: '-10px', left: '20px', background: '#3b82f6', color: 'white',
                                    fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '10px'
                                }}>
                                    Week {step.week}
                                </div>
                                <h4 style={{ marginTop: '12px', marginBottom: '12px', fontSize: '16px', fontWeight: 700, color: '#93c5fd' }}>
                                    {step.focus_area}
                                </h4>
                                <ul style={{ margin: 0, paddingLeft: '16px', color: '#cbd5e1', fontSize: '13px' }}>
                                    {step.action_items.map((item, idx) => (
                                        <li key={idx} style={{ marginBottom: '6px' }}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Proctoring Violations */}
            {violations && violations.length > 0 && (
                <div style={{ background: '#1e293b', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '16px', padding: '24px', marginBottom: '32px' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171' }}>
                        <Shield size={20} /> Proctoring Violations ({violations.length})
                    </h3>
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {violations.map((v, i) => (
                            <div key={i} style={{
                                padding: '10px 14px', borderRadius: '8px', marginBottom: '6px',
                                background: v.severity === 'high' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                fontSize: '13px', display: 'flex', justifyContent: 'space-between', color: '#cbd5e1'
                            }}>
                                <span><strong>{v.event_type}</strong> during {v.test_stage}</span>
                                <span style={{ opacity: 0.7 }}>{new Date(v.created_at).toLocaleTimeString()}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

        </div>
    );
}
