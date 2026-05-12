import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Brain, CheckCircle, XCircle, Clock, Eye, ChevronDown, ChevronUp, FileText,
    Code, Database, MessageSquare, Shield, Target, AlertTriangle, BarChart2,
    ArrowLeft, Loader2, Award, TrendingUp, BookOpen, Activity, Map, Zap, Smartphone, Maximize, ArrowLeftRight, Camera,
    Calendar, Play, Trash2, RotateCcw
} from 'lucide-react';
import SkillTestReport from './SkillTestReport';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function SkillSubmissions({ user, isAdmin = false }) {
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [filter, setFilter] = useState('all');
    const [submissionDetails, setSubmissionDetails] = useState({}); // Cache for detailed reports
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [resetting, setResetting] = useState(false);

    useEffect(() => { loadSubmissions(); }, []);

    const loadSubmissions = async () => {
        try {
            setLoading(true);
            const url = isAdmin
                ? `${API}/api/skill-tests/admin/all-submissions`
                : `${API}/api/skill-tests/student/submissions?studentId=${encodeURIComponent(user?.id || user?.userId || user?.email || '')}`;
            const { data } = await axios.get(url);
            setSubmissions(data);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = async (id) => {
        if (expandedId === id) {
            setExpandedId(null);
            return;
        }

        setExpandedId(id);

        // Fetch details if not already cached
        if (!submissionDetails[id]) {
            try {
                setLoadingDetails(true);
                const { data } = await axios.get(`${API}/api/skill-tests/report/${id}`);
                setSubmissionDetails(prev => ({ ...prev, [id]: data }));
            } catch (err) {
                console.error("Failed to fetch report details", err);
            } finally {
                setLoadingDetails(false);
            }
        }
    };

    const resetAllSubmissions = async () => {
        if (!window.confirm('⚠️ Are you sure you want to DELETE ALL skill test submissions?\n\nThis will permanently remove all student attempts, reports, and proctoring logs.\n\nThis action CANNOT be undone!')) return;
        try {
            setResetting(true);
            const { data } = await axios.delete(`${API}/api/skill-tests/admin/reset-all-submissions`);
            alert(`✅ ${data.message}`);
            setSubmissions([]);
            setSubmissionDetails({});
            setExpandedId(null);
        } catch (err) {
            alert('❌ Reset failed: ' + (err.response?.data?.error || err.message));
        } finally {
            setResetting(false);
        }
    };

    const deleteSubmission = async (e, id) => {
        e.stopPropagation();
        if (!window.confirm('Delete this submission? This action cannot be undone.')) return;
        try {
            await axios.delete(`${API}/api/skill-tests/admin/submission/${id}`);
            setSubmissions(prev => prev.filter(s => s.id !== id));
            if (expandedId === id) setExpandedId(null);
            delete submissionDetails[id];
        } catch (err) {
            alert('❌ Delete failed: ' + (err.response?.data?.error || err.message));
        }
    };

    const filtered = filter === 'all' ? submissions
        : filter === 'passed' ? submissions.filter(s => s.overall_status === 'completed')
            : filter === 'failed' ? submissions.filter(s => s.overall_status === 'failed')
                : submissions.filter(s => s.overall_status === 'in_progress');

    const stats = {
        total: submissions.length,
        passed: submissions.filter(s => s.overall_status === 'completed').length,
        failed: submissions.filter(s => s.overall_status === 'failed').length,
        inProgress: submissions.filter(s => s.overall_status === 'in_progress').length
    };

    if (loading) return (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ marginTop: '12px', fontSize: '14px' }}>Loading submissions...</p>
        </div>
    );

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '42px', height: '42px', borderRadius: '12px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)'
                    }}>
                        <FileText size={22} color="white" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#f1f5f9' }}>
                            {isAdmin ? 'All Skill Test Submissions' : 'My Skill Test Submissions'}
                        </h2>
                        <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af' }}>
                            {isAdmin ? 'View all student assessment results' : 'View your assessment results & reports'}
                        </p>
                    </div>
                </div>

                {/* Stats + Reset */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ padding: '8px 16px', borderRadius: '10px', background: '#1e293b', border: '1px solid #334155', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>PASSED</div>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: '#22c55e' }}>{stats.passed}</div>
                    </div>
                    <div style={{ padding: '8px 16px', borderRadius: '10px', background: '#1e293b', border: '1px solid #334155', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>FAILED</div>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: '#ef4444' }}>{stats.failed}</div>
                    </div>
                    {isAdmin && submissions.length > 0 && (
                        <button
                            onClick={resetAllSubmissions}
                            disabled={resetting}
                            style={{
                                padding: '10px 18px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.3)',
                                background: 'rgba(239,68,68,0.1)', color: '#f87171', cursor: resetting ? 'not-allowed' : 'pointer',
                                fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px',
                                transition: 'all 0.2s', opacity: resetting ? 0.5 : 1
                            }}
                            onMouseEnter={e => { e.target.style.background = 'rgba(239,68,68,0.2)'; }}
                            onMouseLeave={e => { e.target.style.background = 'rgba(239,68,68,0.1)'; }}
                        >
                            <RotateCcw size={15} style={resetting ? { animation: 'spin 1s linear infinite' } : {}} />
                            {resetting ? 'Resetting...' : 'Reset All'}
                        </button>
                    )}
                </div>
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', padding: '4px', background: '#1e293b', borderRadius: '12px', width: 'fit-content', border: '1px solid #334155' }}>
                {['all', 'passed', 'failed', 'in_progress'].map(f => (
                    <button key={f} onClick={() => setFilter(f)} style={{
                        padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                        fontSize: '13px', fontWeight: 600, textTransform: 'capitalize',
                        background: filter === f ? '#334155' : 'transparent',
                        color: filter === f ? 'white' : '#94a3b8',
                        transition: 'all 0.2s'
                    }}>
                        {f.replace('_', ' ')}
                    </button>
                ))}
            </div>

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#64748b', background: '#1e293b', borderRadius: '16px', border: '1px solid #334155' }}>
                        <FileText size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                        <p>No submissions found for this filter.</p>
                    </div>
                ) : (
                    filtered.map(sub => {
                        const isExpanded = expandedId === sub.id;
                        const statusColor = sub.overall_status === 'completed' ? '#22c55e' : sub.overall_status === 'failed' ? '#ef4444' : '#f59e0b';
                        const statusBg = sub.overall_status === 'completed' ? 'rgba(34,197,94,0.1)' : sub.overall_status === 'failed' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)';

                        return (
                            <div key={sub.id} style={{
                                background: '#1e293b', border: `1px solid ${isExpanded ? '#64748b' : '#334155'}`,
                                borderRadius: '16px', padding: '20px', transition: 'all 0.2s',
                                boxShadow: isExpanded ? '0 4px 20px rgba(0,0,0,0.2)' : 'none'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => toggleExpand(sub.id)}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div style={{
                                            width: '50px', height: '50px', borderRadius: '50%',
                                            background: statusBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            border: `1px solid ${statusColor}`
                                        }}>
                                            {sub.overall_status === 'completed' ? <CheckCircle size={24} color={statusColor} />
                                                : sub.overall_status === 'failed' ? <XCircle size={24} color={statusColor} />
                                                    : <Clock size={24} color={statusColor} />}
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f1f5f9' }}>{sub.title}</h3>
                                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#334155', color: '#94a3b8' }}>#{sub.attempt_number}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '13px', color: '#94a3b8' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Calendar size={13} /> {new Date(sub.created_at).toLocaleDateString()}
                                                </span>
                                                {sub.student_name && isAdmin && (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#e2e8f0', fontWeight: 600 }}>
                                                        <Activity size={13} /> {sub.student_name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '2px' }}>Total Score</div>
                                            <div style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9' }}>
                                                {Math.round((Number(sub.mcq_score || 0) + Number(sub.coding_score || 0) + Number(sub.sql_score || 0) + (Number(sub.interview_score || 0) * 10)) / 4)}%
                                            </div>
                                        </div>
                                        {isAdmin && (
                                            <div
                                                onClick={(e) => deleteSubmission(e, sub.id)}
                                                style={{
                                                    width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171',
                                                    cursor: 'pointer', transition: 'all 0.2s', border: '1px solid rgba(239,68,68,0.2)'
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.25)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                                                title="Delete this submission"
                                            >
                                                <Trash2 size={15} />
                                            </div>
                                        )}
                                        <div style={{
                                            width: '32px', height: '32px', borderRadius: '8px', background: '#334155',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8'
                                        }}>
                                            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Detail View - NOW USES SkillTestReport */}
                                {isExpanded && (
                                    <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #334155' }}>
                                        {loadingDetails && !submissionDetails[sub.id] ? (
                                            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /> Loading detailed report...
                                            </div>
                                        ) : (
                                            <SkillTestReport
                                                attemptId={sub.id}
                                                initialData={submissionDetails[sub.id]}
                                                isEmbedded={true}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
