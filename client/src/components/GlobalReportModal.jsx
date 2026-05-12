import React, { useState, useEffect } from 'react'
import axios from 'axios'
import {
    Globe, Target, CheckCircle, XCircle, X, AlertTriangle,
    Clock, Award, Brain, Code, Database, ChevronDown, ChevronUp,
    Shield, BarChart2, Zap, TrendingUp, Download, Lightbulb, ListChecks,
    ArrowRight, Star, Sparkles
} from 'lucide-react'
import {
    ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Cell
} from 'recharts'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

function GlobalReportModal({ submissionId, onClose, isStudentView = false }) {
    const [loading, setLoading] = useState(true)
    const [report, setReport] = useState(null)
    const [error, setError] = useState(null)
    const [expandedSections, setExpandedSections] = useState({
        aptitude: true,
        verbal: false,
        logical: false,
        coding: false,
        sql: false
    })

    useEffect(() => {
        if (submissionId) {
            setLoading(true)
            axios.get(`${API_BASE}/global-test-submissions/${submissionId}/report`)
                .then(res => {
                    setReport(res.data)
                    setLoading(false)
                })
                .catch(err => {
                    console.error('Failed to load global test report:', err)
                    setError('Failed to load report details')
                    setLoading(false)
                })
        }
    }, [submissionId])

    if (!submissionId) return null

    const toggleSection = (section) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }))
    }

    const downloadPDF = async () => {
        // Expand all for PDF
        const originalState = { ...expandedSections };
        const allExpanded = {
            aptitude: true,
            verbal: true,
            logical: true,
            coding: true,
            sql: true
        };
        setExpandedSections(allExpanded);

        // Give it a moment to render all sections
        setTimeout(async () => {
            const element = document.getElementById('report-content');
            if (!element) return;

            const canvas = await html2canvas(element, {
                scale: 2,
                backgroundColor: '#0f172a',
                useCORS: true,
                logging: false
            });

            const imgData = canvas.toDataURL('image/png', 1.0);
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgWidth = 210;
            const pageHeight = 297;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            pdf.save(`${report.studentInfo.name}_Assessment_Report.pdf`);

            // Restore original state
            setExpandedSections(originalState);
        }, 1000);
    }

    const getScoreColor = (percentage) => {
        if (percentage >= 80) return '#10b981'
        if (percentage >= 60) return '#f59e0b'
        return '#ef4444'
    }

    const getSectionIcon = (section) => {
        switch (section) {
            case 'aptitude': return <Brain size={20} />
            case 'verbal': return <Zap size={20} />
            case 'logical': return <TrendingUp size={20} />
            case 'coding': return <Code size={20} />
            case 'sql': return <Database size={20} />
            default: return <Target size={20} />
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            backdropFilter: 'blur(8px)'
        }}>
            <div
                className="modal-content"
                onClick={e => e.stopPropagation()}
                style={{
                    width: '95%',
                    maxWidth: '1100px',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    background: '#0f172a',
                    borderRadius: '24px',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}
            >
                {/* Header */}
                <div className="modal-header" style={{
                    padding: '1.5rem 2rem',
                    borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(6, 182, 212, 0.05))'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '14px',
                            background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 8px 16px rgba(139, 92, 246, 0.2)'
                        }}>
                            <Globe size={26} color="white" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>
                                Global Assessment Report
                            </h2>
                            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>
                                {loading ? 'Loading...' : report?.testInfo.title}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button
                            onClick={downloadPDF}
                            disabled={loading || !report}
                            style={{
                                background: 'rgba(139, 92, 246, 0.15)',
                                color: '#a78bfa',
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                                borderRadius: '12px',
                                padding: '0.6rem 1.2rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                cursor: 'pointer',
                                fontWeight: 600,
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={e => {
                                e.currentTarget.style.background = '#8b5cf6';
                                e.currentTarget.style.color = 'white';
                            }}
                            onMouseOut={e => {
                                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)';
                                e.currentTarget.style.color = '#a78bfa';
                            }}
                        >
                            <Download size={18} /> Download PDF
                        </button>
                        <button onClick={onClose} style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: 'none',
                            borderRadius: '12px',
                            padding: '0.6rem',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            transition: 'all 0.2s'
                        }}
                            onMouseOver={e => e.currentTarget.style.color = 'white'}
                            onMouseOut={e => e.currentTarget.style.color = '#94a3b8'}
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '5rem' }}>
                            <div style={{
                                width: '50px',
                                height: '50px',
                                border: '3px solid rgba(139, 92, 246, 0.2)',
                                borderTopColor: '#8b5cf6',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                                margin: '0 auto'
                            }}></div>
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                            <p style={{ color: '#94a3b8', marginTop: '1.5rem', fontWeight: 500 }}>Analyzing performance data...</p>
                        </div>
                    ) : error ? (
                        <div style={{ textAlign: 'center', padding: '5rem' }}>
                            <AlertTriangle size={64} color="#ef4444" style={{ marginBottom: '1.5rem', opacity: 0.8 }} />
                            <h3 style={{ color: 'white' }}>Oops! Something went wrong</h3>
                            <p style={{ color: '#94a3b8' }}>{error}</p>
                            <button onClick={onClose} style={{
                                marginTop: '1.5rem',
                                padding: '0.75rem 1.5rem',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '10px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}>Close Modal</button>
                        </div>
                    ) : (
                        <div id="report-content">
                            {/* AI Summary Banner */}
                            {report.personalizedAnalysis?.summary && (
                                <div style={{
                                    padding: '2rem',
                                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.1))',
                                    borderRadius: '24px',
                                    border: '1px solid rgba(139, 92, 246, 0.2)',
                                    marginBottom: '2rem',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}>
                                    <Sparkles style={{ position: 'absolute', right: '2rem', top: '1.5rem', opacity: 0.2 }} size={48} color="#8b5cf6" />
                                    <h3 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#a78bfa', fontSize: '1.4rem' }}>
                                        <Brain size={24} /> Executive Summary
                                    </h3>
                                    <p style={{ margin: 0, color: '#e2e8f0', fontSize: '1.1rem', lineHeight: 1.6, maxWidth: '90%' }}>
                                        {report.personalizedAnalysis.summary}
                                    </p>
                                </div>
                            )}
                            {/* Student & Test Overview */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '1.5rem',
                                marginBottom: '2rem'
                            }}>
                                <div style={{
                                    padding: '1.5rem',
                                    background: 'rgba(30, 41, 59, 0.5)',
                                    borderRadius: '16px',
                                    border: '1px solid rgba(255, 255, 255, 0.05)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1.25rem'
                                }}>
                                    <div style={{
                                        width: '64px',
                                        height: '64px',
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '1.75rem',
                                        fontWeight: 800,
                                        color: 'white'
                                    }}>
                                        {report.studentInfo.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, color: 'white', fontSize: '1.25rem' }}>{report.studentInfo.name}</h3>
                                        <p style={{ margin: '0.25rem 0 0', color: '#94a3b8' }}>{report.studentInfo.email}</p>
                                    </div>
                                </div>

                                <div style={{
                                    padding: '1.5rem',
                                    background: report.overallPerformance.status === 'passed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    borderRadius: '16px',
                                    border: `1px solid ${report.overallPerformance.status === 'passed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{
                                            fontSize: '2.5rem',
                                            fontWeight: 900,
                                            color: getScoreColor(report.overallPerformance.percentage),
                                            lineHeight: 1
                                        }}>
                                            {report.overallPerformance.percentage}%
                                        </div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Overall Score</div>
                                    </div>
                                    <div style={{
                                        padding: '0.75rem 1.5rem',
                                        borderRadius: '12px',
                                        background: report.overallPerformance.status === 'passed' ? '#10b981' : '#ef4444',
                                        color: 'white',
                                        fontWeight: 800,
                                        fontSize: '1.1rem',
                                        boxShadow: `0 8px 20px ${report.overallPerformance.status === 'passed' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                    }}>
                                        {report.overallPerformance.status.toUpperCase()}
                                    </div>
                                </div>
                            </div>

                            {/* Section breakdown and Visualization */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1.5fr 1fr',
                                gap: '1.5rem',
                                marginBottom: '2.5rem'
                            }}>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, 1fr)',
                                    gap: '1rem'
                                }}>
                                    {Object.entries(report.sectionWisePerformance).map(([sec, data]) => (
                                        <div key={sec} style={{
                                            padding: '1.25rem',
                                            background: 'rgba(30, 41, 59, 0.5)',
                                            borderRadius: '16px',
                                            border: '1px solid rgba(255, 255, 255, 0.05)',
                                            textAlign: 'center'
                                        }}>
                                            <div style={{
                                                width: '40px',
                                                height: '40px',
                                                borderRadius: '10px',
                                                background: 'rgba(255,255,255,0.05)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                margin: '0 auto 1rem',
                                                color: getScoreColor(data.percentage)
                                            }}>
                                                {getSectionIcon(sec)}
                                            </div>
                                            <div style={{ color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>{sec}</div>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white' }}>{data.percentage}%</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>{data.correctCount}/{data.totalQuestions} Correct</div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{
                                    background: 'rgba(30, 41, 59, 0.4)',
                                    borderRadius: '20px',
                                    border: '1px solid rgba(255, 255, 255, 0.05)',
                                    padding: '1.5rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <h4 style={{ margin: '0 0 1rem', color: '#94a3b8', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Section Performance Summary</h4>
                                    <ResponsiveContainer width="100%" height={250}>
                                        <BarChart data={
                                            Object.entries(report.sectionWisePerformance).map(([name, data]) => ({
                                                name: name.charAt(0).toUpperCase() + name.slice(1),
                                                score: data.percentage
                                            }))
                                        } margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                            <XAxis
                                                dataKey="name"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#94a3b8', fontSize: 12 }}
                                            />
                                            <YAxis
                                                domain={[0, 100]}
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#94a3b8', fontSize: 12 }}
                                                tickFormatter={(v) => `${v}%`}
                                            />
                                            <RechartsTooltip
                                                contentStyle={{ background: '#1e293b', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '8px' }}
                                                itemStyle={{ color: 'white' }}
                                                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                            />
                                            <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                                                {Object.entries(report.sectionWisePerformance).map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={getScoreColor(entry[1].percentage)} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* AI Analysis Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2.5rem' }}>
                                <div style={{ padding: '2rem', background: 'rgba(16, 185, 129, 0.03)', borderRadius: '24px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                                    <h4 style={{ margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#10b981', fontSize: '1.2rem' }}>
                                        <Award size={24} /> Key Strengths
                                    </h4>
                                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {report.strengths.map((s, i) => (
                                            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', color: '#e2e8f0', fontSize: '1rem' }}>
                                                <div style={{ marginTop: '0.25rem', padding: '0.2rem', background: '#10b981', borderRadius: '50%' }}>
                                                    <CheckCircle size={12} color="white" />
                                                </div>
                                                {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div style={{ padding: '2rem', background: 'rgba(239, 68, 68, 0.03)', borderRadius: '24px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                                    <h4 style={{ margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#f87171', fontSize: '1.2rem' }}>
                                        <TrendingUp size={24} /> Areas for Growth
                                    </h4>
                                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {report.weaknesses.map((w, i) => (
                                            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', color: '#e2e8f0', fontSize: '1rem' }}>
                                                <div style={{ marginTop: '0.25rem', padding: '0.2rem', background: '#f87171', borderRadius: '50%' }}>
                                                    <ArrowRight size={12} color="white" />
                                                </div>
                                                {w}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Action Plan & Focus Areas */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem', marginBottom: '2.5rem' }}>
                                <div style={{ padding: '2rem', background: 'rgba(59, 130, 246, 0.03)', borderRadius: '24px', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
                                    <h4 style={{ margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#60a5fa', fontSize: '1.2rem' }}>
                                        <ListChecks size={24} /> Personalized Action Plan
                                    </h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        {report.recommendations.map((step, i) => (
                                            <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                                <div style={{
                                                    width: '28px', height: '28px', borderRadius: '8px', background: '#3b82f6',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '0.8rem', flexShrink: 0
                                                }}>{i + 1}</div>
                                                <p style={{ margin: 0, color: '#e2e8f0', lineHeight: 1.5 }}>{step}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ padding: '2rem', background: 'rgba(245, 158, 11, 0.03)', borderRadius: '24px', border: '1px solid rgba(245, 158, 11, 0.1)' }}>
                                    <h4 style={{ margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#f59e0b', fontSize: '1.2rem' }}>
                                        <Lightbulb size={24} /> Critical Focus Areas
                                    </h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                        {report.personalizedAnalysis?.focusAreas?.map((area, i) => (
                                            <div key={i} style={{
                                                padding: '0.75rem 1.25rem',
                                                background: 'rgba(245, 158, 11, 0.1)',
                                                border: '1px solid rgba(245, 158, 11, 0.2)',
                                                borderRadius: '12px',
                                                color: '#f59e0b',
                                                fontWeight: 600,
                                                fontSize: '0.9rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem'
                                            }}>
                                                <Target size={16} /> {area}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Section Results */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <h3 style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                    <BarChart2 size={24} color="#8b5cf6" />
                                    Detailed Question Analysis
                                </h3>

                                {/* Calculate global question index mapping */}
                                {(() => {
                                    let globalIdx = 0;
                                    const sectionEntries = Object.entries(report.questionResultsBySection);
                                    return sectionEntries.map(([section, questions]) => {
                                        const sectionStartIdx = globalIdx;
                                        globalIdx += questions.length;
                                        return { section, questions, sectionStartIdx };
                                    });
                                })().map(({ section, questions, sectionStartIdx }) => (
                                    <div key={section} style={{
                                        background: 'rgba(30, 41, 59, 0.3)',
                                        borderRadius: '16px',
                                        border: '1px solid rgba(255, 255, 255, 0.05)',
                                        overflow: 'hidden'
                                    }}>
                                        <button
                                            onClick={() => toggleSection(section)}
                                            style={{
                                                width: '100%',
                                                padding: '1.25rem 1.5rem',
                                                background: 'transparent',
                                                border: 'none',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                cursor: 'pointer',
                                                color: 'white'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{ color: getScoreColor(report.sectionWisePerformance[section]?.percentage) }}>
                                                    {getSectionIcon(section)}
                                                </div>
                                                <span style={{ fontSize: '1.1rem', fontWeight: 700, textTransform: 'capitalize' }}>{section} Analysis</span>
                                                <span style={{
                                                    fontSize: '0.85rem',
                                                    padding: '0.2rem 0.6rem',
                                                    background: 'rgba(255,255,255,0.05)',
                                                    borderRadius: '6px',
                                                    color: '#94a3b8'
                                                }}>
                                                    {report.sectionWisePerformance[section]?.percentage}% Accuraccy
                                                </span>
                                            </div>
                                            {expandedSections[section] ? <ChevronUp size={20} color="#64748b" /> : <ChevronDown size={20} color="#64748b" />}
                                        </button>

                                        {expandedSections[section] && report.personalizedAnalysis?.sectionAnalysis?.[section] && (
                                            <div style={{
                                                margin: '0 1.5rem 1.5rem',
                                                padding: '1.25rem',
                                                background: 'rgba(139, 92, 246, 0.05)',
                                                borderRadius: '12px',
                                                border: '1px solid rgba(139, 92, 246, 0.2)',
                                                color: '#e2e8f0',
                                                fontSize: '0.95rem',
                                                lineHeight: 1.6
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '1px' }}>
                                                    <Brain size={16} /> AI Performance Insight
                                                </div>
                                                {report.personalizedAnalysis.sectionAnalysis[section]}
                                            </div>
                                        )}

                                        {expandedSections[section] && (
                                            <div style={{ padding: '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                {questions.length > 0 ? questions.map((q, idx) => (
                                                    <div key={idx} style={{
                                                        padding: '1.25rem',
                                                        background: q.is_correct ? 'rgba(16, 185, 129, 0.03)' : 'rgba(239, 68, 68, 0.03)',
                                                        border: `1px solid ${q.is_correct ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`,
                                                        borderRadius: '12px'
                                                    }}>
                                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                                            <div style={{
                                                                width: '32px', height: '32px', borderRadius: '50%',
                                                                background: q.is_correct ? '#10b981' : '#ef4444',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                color: 'white', fontWeight: 800, flexShrink: 0
                                                            }}>
                                                                {q.is_correct ? '✓' : '✗'}
                                                            </div>
                                                            <div style={{ flex: 1 }}>
                                                                <p style={{ margin: '0 0 1rem', color: '#e2e8f0', fontWeight: 500, lineHeight: 1.5 }}>{q.question}</p>

                                                                {(section === 'coding' || section === 'sql') ? (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                                        <div style={{ background: '#020617', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto' }}>
                                                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase' }}>Your Code Submission</div>
                                                                            <pre style={{ margin: 0, color: '#e2e8f0', fontSize: '0.85rem', fontFamily: '"Fira Code", monospace' }}>{q.user_answer}</pre>
                                                                        </div>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', background: q.is_correct ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
                                                                            <Shield size={16} color={q.is_correct ? '#10b981' : '#ef4444'} />
                                                                            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Evaluation:</span>
                                                                            <span style={{ fontWeight: 600, color: q.is_correct ? '#10b981' : '#f87171' }}>{q.correct_answer}</span>
                                                                            {q.points_earned !== undefined && (
                                                                                <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#94a3b8' }}>
                                                                                    Score: <span style={{ color: 'white', fontWeight: 600 }}>{q.points_earned}</span>
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', background: q.is_correct ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
                                                                            <span style={{ fontSize: '0.85rem', color: '#94a3b8', minWidth: '100px' }}>Your Answer:</span>
                                                                            <span style={{ fontWeight: 600, color: q.is_correct ? '#10b981' : '#f87171' }}>{q.user_answer || '(No answer)'}</span>
                                                                        </div>
                                                                        {!q.is_correct && (
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px' }}>
                                                                                <span style={{ fontSize: '0.85rem', color: '#94a3b8', minWidth: '100px' }}>Correct Answer:</span>
                                                                                <span style={{ fontWeight: 600, color: '#10b981' }}>{q.correct_answer}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {q.explanation && (
                                                                    <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(139, 92, 246, 0.05)', borderRadius: '8px', borderLeft: '4px solid #8b5cf6' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                                            <Shield size={14} color="#8b5cf6" />
                                                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase' }}>Conceptual Explanation</span>
                                                                        </div>
                                                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>{q.explanation}</p>
                                                                    </div>
                                                                )}

                                                                {/* Individual Question AI Insight */}
                                                                {report.personalizedAnalysis?.questionInsights?.[`Q${sectionStartIdx + idx + 1}`] && (
                                                                    <div style={{
                                                                        marginTop: '1rem',
                                                                        padding: '1.25rem',
                                                                        background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.08), rgba(139, 92, 246, 0.08))',
                                                                        borderRadius: '12px',
                                                                        border: '1px solid rgba(139, 92, 246, 0.2)',
                                                                        position: 'relative'
                                                                    }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', color: '#06b6d4' }}>
                                                                            <Lightbulb size={18} />
                                                                            <span style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Mentor Insight</span>
                                                                            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#64748b', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>Q{sectionStartIdx + idx + 1}</span>
                                                                        </div>

                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                                            <div>
                                                                                <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '2px' }}>DIAGNOSIS</span>
                                                                                <p style={{ margin: 0, color: '#e2e8f0', fontSize: '0.9rem' }}>{report.personalizedAnalysis.questionInsights[`Q${sectionStartIdx + idx + 1}`].diagnosis}</p>
                                                                            </div>
                                                                            <div>
                                                                                <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '2px' }}>THE MISSTEP</span>
                                                                                <p style={{ margin: 0, color: '#e2e8f0', fontSize: '0.9rem' }}>{report.personalizedAnalysis.questionInsights[`Q${sectionStartIdx + idx + 1}`].misstep}</p>
                                                                            </div>
                                                                            <div style={{ padding: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', borderLeft: '3px solid #10b981' }}>
                                                                                <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 800, display: 'block', marginBottom: '2px' }}>HOW TO EXCEL</span>
                                                                                <p style={{ margin: 0, color: '#e2e8f0', fontSize: '0.9rem', fontWeight: 500 }}>{report.personalizedAnalysis.questionInsights[`Q${sectionStartIdx + idx + 1}`].recommendation}</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No questions found in this section.</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default GlobalReportModal
