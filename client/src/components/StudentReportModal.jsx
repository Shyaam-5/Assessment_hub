import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import axios from 'axios'
import {
    X, FileText, Code, Brain, CheckCircle, XCircle,
    AlertTriangle, TrendingUp, Award, Target, Clock, Download,
    BarChart3, PieChart, Zap, Star, ChevronRight, Eye,
    Trophy, Activity, Shield, Sparkles, ArrowRight, ListChecks,
    Lightbulb, ChevronDown, ChevronUp, Globe, User, Calendar
} from 'lucide-react'
import {
    ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, PieChart as RechartsPie, Pie, Legend,
    AreaChart, Area
} from 'recharts'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

const CHART_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']

function StudentReportModal({ studentId, studentName, onClose, requestedBy, requestedByRole }) {
    const [loading, setLoading] = useState(true)
    const [report, setReport] = useState(null)
    const [error, setError] = useState(null)
    const [activeTab, setActiveTab] = useState('overview')
    const [expandedSections, setExpandedSections] = useState({
        aptitude: true,
        code: false,
        tasks: false
    })
    const reportRef = useRef(null)

    useEffect(() => {
        if (studentId) {
            setLoading(true)
            axios.post(`${API_BASE}/reports/student/${studentId}`, {
                requestedBy,
                requestedByRole
            })
                .then(res => {
                    console.log('Report data:', res.data)
                    setReport(res.data)
                    setLoading(false)
                })
                .catch(err => {
                    console.error('Failed to generate report:', err)
                    setError('Failed to generate report')
                    setLoading(false)
                })
        }
    }, [studentId])

    const toggleSection = (section) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }))
    }

    const downloadPDF = async () => {
        if (!report || !reportRef.current) return

        // Expand all sections for PDF
        const originalState = { ...expandedSections }
        setExpandedSections({ aptitude: true, code: true, tasks: true })

        setTimeout(async () => {
            try {
                const canvas = await html2canvas(reportRef.current, {
                    scale: 2,
                    backgroundColor: '#0f172a',
                    useCORS: true,
                    logging: false
                })

                const imgData = canvas.toDataURL('image/png', 1.0)
                const pdf = new jsPDF('p', 'mm', 'a4')
                const imgWidth = 210
                const pageHeight = 297
                const imgHeight = (canvas.height * imgWidth) / canvas.width
                let heightLeft = imgHeight
                let position = 0

                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
                heightLeft -= pageHeight

                while (heightLeft >= 0) {
                    position = heightLeft - imgHeight
                    pdf.addPage()
                    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
                    heightLeft -= pageHeight
                }

                pdf.save(`${report.student.name}_Performance_Report.pdf`)
            } catch (e) {
                console.error('PDF generation failed:', e)
            }

            setExpandedSections(originalState)
        }, 500)
    }

    const getScoreColor = (score) => {
        if (score >= 80) return '#10b981'
        if (score >= 60) return '#f59e0b'
        return '#ef4444'
    }

    const getGradeLabel = (score) => {
        if (score >= 90) return { label: 'Excellent', color: '#10b981' }
        if (score >= 80) return { label: 'Very Good', color: '#22c55e' }
        if (score >= 70) return { label: 'Good', color: '#84cc16' }
        if (score >= 60) return { label: 'Average', color: '#f59e0b' }
        if (score >= 50) return { label: 'Below Average', color: '#f97316' }
        return { label: 'Needs Improvement', color: '#ef4444' }
    }

    if (!studentId) return null

    const tabs = [
        { id: 'overview', label: 'Overview', icon: BarChart3 },
        { id: 'performance', label: 'Performance', icon: TrendingUp },
        { id: 'code', label: 'Code Analysis', icon: Code },
        { id: 'aptitude', label: 'Aptitude', icon: Brain },
        { id: 'proctoring', label: 'Proctoring', icon: Eye },
        { id: 'insights', label: 'AI Insights', icon: Zap }
    ]

    // Prepare chart data
    const getPerformanceChartData = () => {
        if (!report) return []
        return [
            { name: 'Code', score: report.summary?.avgCodeScore || 0, fullMark: 100 },
            { name: 'Tasks', score: report.summary?.avgTaskScore || 0, fullMark: 100 },
            { name: 'Aptitude', score: report.summary?.avgAptitudeScore || 0, fullMark: 100 }
        ]
    }

    const getLanguageChartData = () => {
        if (!report?.languageBreakdown) return []
        return report.languageBreakdown.map((lang, idx) => ({
            name: lang.language,
            value: lang.count,
            avgScore: lang.avgScore,
            color: CHART_COLORS[idx % CHART_COLORS.length]
        }))
    }

    const getCategoryChartData = () => {
        if (!report?.categoryAnalysis) return []
        return report.categoryAnalysis.map(cat => ({
            name: cat.category,
            accuracy: cat.accuracy,
            correct: cat.correct,
            total: cat.total
        }))
    }

    return ReactDOM.createPortal(
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            backdropFilter: 'blur(8px)'
        }} onClick={onClose}>
            <div
                style={{
                    width: '95%',
                    maxWidth: '1200px',
                    maxHeight: '95vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    background: '#0f172a',
                    borderRadius: '24px',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '1.5rem 2rem',
                    borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.08))'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '16px',
                            background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 8px 24px rgba(139, 92, 246, 0.3)'
                        }}>
                            <Globe size={28} color="white" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>
                                Comprehensive Performance Report
                            </h2>
                            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem' }}>
                                {studentName || 'Loading...'}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {report && (
                            <button
                                onClick={downloadPDF}
                                style={{
                                    background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '12px',
                                    padding: '0.75rem 1.5rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '0.9rem',
                                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Download size={18} /> Download PDF
                            </button>
                        )}
                        <button onClick={onClose} style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: 'none',
                            borderRadius: '12px',
                            padding: '0.75rem',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            transition: 'all 0.2s'
                        }}>
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }} ref={reportRef}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '5rem' }}>
                            <div style={{
                                width: '60px',
                                height: '60px',
                                border: '4px solid rgba(139, 92, 246, 0.2)',
                                borderTopColor: '#8b5cf6',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                                margin: '0 auto'
                            }}></div>
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                            <p style={{ color: '#94a3b8', marginTop: '1.5rem', fontWeight: 500, fontSize: '1.1rem' }}>
                                Analyzing performance data...
                            </p>
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
                    ) : report ? (
                        <>
                            {/* AI Executive Summary Banner */}
                            {report.aiInsights?.overallAssessment && (
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
                                    <h3 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#a78bfa', fontSize: '1.3rem' }}>
                                        <Brain size={24} /> Executive Summary
                                    </h3>
                                    <p style={{ margin: 0, color: '#e2e8f0', fontSize: '1.05rem', lineHeight: 1.7, maxWidth: '90%' }}>
                                        {report.aiInsights.overallAssessment}
                                    </p>
                                </div>
                            )}

                            {/* Student Info & Score Overview */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '1.5rem',
                                marginBottom: '2rem'
                            }}>
                                {/* Student Card */}
                                <div style={{
                                    padding: '1.75rem',
                                    background: 'rgba(30, 41, 59, 0.5)',
                                    borderRadius: '20px',
                                    border: '1px solid rgba(255, 255, 255, 0.05)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1.5rem'
                                }}>
                                    <div style={{
                                        width: '80px',
                                        height: '80px',
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '2rem',
                                        fontWeight: 800,
                                        color: 'white',
                                        boxShadow: '0 8px 24px rgba(139, 92, 246, 0.3)'
                                    }}>
                                        {report.student.name?.charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ margin: 0, color: 'white', fontSize: '1.4rem', fontWeight: 700 }}>{report.student.name}</h3>
                                        <p style={{ margin: '0.3rem 0', color: '#94a3b8', fontSize: '0.95rem' }}>{report.student.email}</p>
                                        {report.mentor && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                                                <User size={14} color="#8b5cf6" />
                                                <span style={{ color: '#a78bfa', fontSize: '0.85rem' }}>Mentor: {report.mentor.name}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Overall Score Card */}
                                <div style={{
                                    padding: '1.75rem',
                                    background: `linear-gradient(135deg, ${getScoreColor(report.summary.overallAvgScore)}15, ${getScoreColor(report.summary.overallAvgScore)}08)`,
                                    borderRadius: '20px',
                                    border: `1px solid ${getScoreColor(report.summary.overallAvgScore)}30`,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <div style={{
                                            fontSize: '3.5rem',
                                            fontWeight: 900,
                                            color: getScoreColor(report.summary.overallAvgScore),
                                            lineHeight: 1
                                        }}>
                                            {report.summary.overallAvgScore}%
                                        </div>
                                        <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Overall Score</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{
                                            padding: '0.75rem 1.5rem',
                                            borderRadius: '14px',
                                            background: getScoreColor(report.summary.overallAvgScore),
                                            color: 'white',
                                            fontWeight: 800,
                                            fontSize: '1rem',
                                            boxShadow: `0 8px 20px ${getScoreColor(report.summary.overallAvgScore)}40`
                                        }}>
                                            {getGradeLabel(report.summary.overallAvgScore).label}
                                        </div>
                                        <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            <Trophy size={16} color="#f59e0b" />
                                            <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '1.1rem' }}>Rank #{report.summary.leaderboardRank}</span>
                                            <span style={{ color: '#64748b', fontSize: '0.85rem' }}>of {report.summary.totalStudents}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Stats Cards Row */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: '1rem',
                                marginBottom: '2rem'
                            }}>
                                <StatCard
                                    icon={Code}
                                    label="Code Submissions"
                                    value={report.summary.codeSubmissions}
                                    subLabel={`${report.summary.avgCodeScore}% avg score`}
                                    color="#3b82f6"
                                />
                                <StatCard
                                    icon={Target}
                                    label="Tasks Completed"
                                    value={report.summary.completedTasks}
                                    subLabel={`${report.summary.avgTaskScore}% avg score`}
                                    color="#10b981"
                                />
                                <StatCard
                                    icon={Brain}
                                    label="Aptitude Tests"
                                    value={report.summary.aptitudeTests}
                                    subLabel={`${report.summary.avgAptitudeScore}% avg score`}
                                    color="#8b5cf6"
                                />
                                <StatCard
                                    icon={Activity}
                                    label="Total Activities"
                                    value={report.summary.totalSubmissions}
                                    subLabel={`${report.summary.completedProblems} problems solved`}
                                    color="#06b6d4"
                                />
                            </div>

                            {/* Performance Charts Section */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1.2fr 1fr',
                                gap: '1.5rem',
                                marginBottom: '2.5rem'
                            }}>
                                {/* Radar Chart - Performance Overview */}
                                <div style={{
                                    background: 'rgba(30, 41, 59, 0.4)',
                                    borderRadius: '20px',
                                    border: '1px solid rgba(255, 255, 255, 0.05)',
                                    padding: '1.5rem'
                                }}>
                                    <h4 style={{ margin: '0 0 1rem', color: '#94a3b8', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <TrendingUp size={18} color="#8b5cf6" /> Performance Overview
                                    </h4>
                                    <ResponsiveContainer width="100%" height={280}>
                                        <RadarChart data={getPerformanceChartData()}>
                                            <PolarGrid stroke="rgba(255,255,255,0.1)" />
                                            <PolarAngleAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 13 }} />
                                            <PolarRadiusAxis
                                                angle={30}
                                                domain={[0, 100]}
                                                tick={{ fill: '#64748b', fontSize: 11 }}
                                                tickFormatter={(v) => `${v}%`}
                                            />
                                            <Radar
                                                name="Score"
                                                dataKey="score"
                                                stroke="#8b5cf6"
                                                fill="#8b5cf6"
                                                fillOpacity={0.4}
                                                strokeWidth={2}
                                            />
                                            <Tooltip
                                                contentStyle={{ background: '#1e293b', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '8px' }}
                                                itemStyle={{ color: 'white' }}
                                            />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Bar Chart - Section Scores */}
                                <div style={{
                                    background: 'rgba(30, 41, 59, 0.4)',
                                    borderRadius: '20px',
                                    border: '1px solid rgba(255, 255, 255, 0.05)',
                                    padding: '1.5rem'
                                }}>
                                    <h4 style={{ margin: '0 0 1rem', color: '#94a3b8', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <BarChart3 size={18} color="#3b82f6" /> Score Breakdown
                                    </h4>
                                    <ResponsiveContainer width="100%" height={280}>
                                        <BarChart data={getPerformanceChartData()} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                                            <Tooltip
                                                contentStyle={{ background: '#1e293b', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '8px' }}
                                                itemStyle={{ color: 'white' }}
                                                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                            />
                                            <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                                                {getPerformanceChartData().map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={getScoreColor(entry.score)} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Language & Category Analysis Row */}
                            {(report.languageBreakdown?.length > 0 || report.categoryAnalysis?.length > 0) && (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: report.languageBreakdown?.length > 0 && report.categoryAnalysis?.length > 0 ? '1fr 1fr' : '1fr',
                                    gap: '1.5rem',
                                    marginBottom: '2.5rem'
                                }}>
                                    {/* Language Distribution */}
                                    {report.languageBreakdown?.length > 0 && (
                                        <div style={{
                                            background: 'rgba(30, 41, 59, 0.4)',
                                            borderRadius: '20px',
                                            border: '1px solid rgba(255, 255, 255, 0.05)',
                                            padding: '1.5rem'
                                        }}>
                                            <h4 style={{ margin: '0 0 1rem', color: '#94a3b8', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <Code size={18} color="#06b6d4" /> Language Distribution
                                            </h4>
                                            <ResponsiveContainer width="100%" height={200}>
                                                <RechartsPie>
                                                    <Pie
                                                        data={getLanguageChartData()}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={50}
                                                        outerRadius={80}
                                                        paddingAngle={4}
                                                        dataKey="value"
                                                    >
                                                        {getLanguageChartData().map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        contentStyle={{ background: '#1e293b', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '8px' }}
                                                        itemStyle={{ color: 'white' }}
                                                    />
                                                </RechartsPie>
                                            </ResponsiveContainer>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem', justifyContent: 'center' }}>
                                                {getLanguageChartData().map((lang, i) => (
                                                    <div key={i} style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem',
                                                        padding: '0.5rem 1rem',
                                                        background: 'rgba(255,255,255,0.05)',
                                                        borderRadius: '8px'
                                                    }}>
                                                        <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: lang.color }} />
                                                        <span style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem' }}>{lang.name}</span>
                                                        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{lang.value} ({lang.avgScore}%)</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Category Analysis */}
                                    {report.categoryAnalysis?.length > 0 && (
                                        <div style={{
                                            background: 'rgba(30, 41, 59, 0.4)',
                                            borderRadius: '20px',
                                            border: '1px solid rgba(255, 255, 255, 0.05)',
                                            padding: '1.5rem'
                                        }}>
                                            <h4 style={{ margin: '0 0 1.5rem', color: '#94a3b8', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <Target size={18} color="#f59e0b" /> Category Performance
                                            </h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                {report.categoryAnalysis.map((cat, i) => (
                                                    <div key={i}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                            <span style={{ color: 'white', fontWeight: 600, fontSize: '0.95rem' }}>{cat.category}</span>
                                                            <span style={{ color: getScoreColor(cat.accuracy), fontWeight: 700 }}>{cat.correct}/{cat.total} ({cat.accuracy}%)</span>
                                                        </div>
                                                        <div style={{ height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
                                                            <div style={{
                                                                width: `${cat.accuracy}%`,
                                                                height: '100%',
                                                                background: `linear-gradient(90deg, ${getScoreColor(cat.accuracy)}, ${getScoreColor(cat.accuracy)}cc)`,
                                                                borderRadius: '5px',
                                                                transition: 'width 0.5s ease'
                                                            }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* AI Insights Section */}
                            {report.aiInsights && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2.5rem' }}>
                                    {/* Strengths */}
                                    <div style={{
                                        padding: '2rem',
                                        background: 'rgba(16, 185, 129, 0.03)',
                                        borderRadius: '24px',
                                        border: '1px solid rgba(16, 185, 129, 0.15)'
                                    }}>
                                        <h4 style={{ margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#10b981', fontSize: '1.2rem' }}>
                                            <Award size={24} /> Key Strengths
                                        </h4>
                                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {report.aiInsights.strengths?.map((s, i) => (
                                                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', color: '#e2e8f0', fontSize: '0.95rem' }}>
                                                    <div style={{ marginTop: '0.25rem', padding: '0.2rem', background: '#10b981', borderRadius: '50%' }}>
                                                        <CheckCircle size={12} color="white" />
                                                    </div>
                                                    {s}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    {/* Areas for Growth */}
                                    <div style={{
                                        padding: '2rem',
                                        background: 'rgba(245, 158, 11, 0.03)',
                                        borderRadius: '24px',
                                        border: '1px solid rgba(245, 158, 11, 0.15)'
                                    }}>
                                        <h4 style={{ margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#f59e0b', fontSize: '1.2rem' }}>
                                            <TrendingUp size={24} /> Areas for Growth
                                        </h4>
                                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {report.aiInsights.areasForImprovement?.map((a, i) => (
                                                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', color: '#e2e8f0', fontSize: '0.95rem' }}>
                                                    <div style={{ marginTop: '0.25rem', padding: '0.2rem', background: '#f59e0b', borderRadius: '50%' }}>
                                                        <ArrowRight size={12} color="white" />
                                                    </div>
                                                    {a}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Recommendations */}
                            {report.aiInsights?.recommendations?.length > 0 && (
                                <div style={{
                                    padding: '2rem',
                                    background: 'rgba(59, 130, 246, 0.03)',
                                    borderRadius: '24px',
                                    border: '1px solid rgba(59, 130, 246, 0.15)',
                                    marginBottom: '2.5rem'
                                }}>
                                    <h4 style={{ margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#60a5fa', fontSize: '1.2rem' }}>
                                        <ListChecks size={24} /> Personalized Action Plan
                                    </h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {report.aiInsights.recommendations.map((step, i) => (
                                            <div key={i} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '10px',
                                                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: 'white',
                                                    fontWeight: 800,
                                                    fontSize: '0.85rem',
                                                    flexShrink: 0
                                                }}>{i + 1}</div>
                                                <p style={{ margin: 0, color: '#e2e8f0', lineHeight: 1.6, fontSize: '0.95rem' }}>{step}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Proctoring Summary */}
                            {report.integrity && (
                                <div style={{
                                    padding: '2rem',
                                    background: 'rgba(30, 41, 59, 0.4)',
                                    borderRadius: '24px',
                                    border: '1px solid rgba(255, 255, 255, 0.05)',
                                    marginBottom: '2.5rem'
                                }}>
                                    <h4 style={{ margin: '0 0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'white', fontSize: '1.2rem' }}>
                                        <Shield size={24} color="#3b82f6" /> Proctoring & Integrity Summary
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                                        <IntegrityCard
                                            label="Tab Switches"
                                            value={report.integrity.tabSwitches || 0}
                                            severity={report.integrity.tabSwitches > 5 ? 'high' : report.integrity.tabSwitches > 2 ? 'medium' : 'low'}
                                        />
                                        <IntegrityCard
                                            label="Copy/Paste"
                                            value={report.integrity.copyPasteAttempts || 0}
                                            severity={report.integrity.copyPasteAttempts > 3 ? 'high' : report.integrity.copyPasteAttempts > 1 ? 'medium' : 'low'}
                                        />
                                        <IntegrityCard
                                            label="Camera Issues"
                                            value={report.integrity.cameraBlocked || 0}
                                            severity={report.integrity.cameraBlocked > 2 ? 'high' : report.integrity.cameraBlocked > 0 ? 'medium' : 'low'}
                                        />
                                        <IntegrityCard
                                            label="Plagiarism Flags"
                                            value={report.integrity.plagiarismCount || 0}
                                            severity={report.integrity.plagiarismCount > 0 ? 'high' : 'low'}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Recent Submissions Section */}
                            {report.recentSubmissions?.length > 0 && (
                                <div style={{
                                    background: 'rgba(30, 41, 59, 0.4)',
                                    borderRadius: '24px',
                                    border: '1px solid rgba(255, 255, 255, 0.05)',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        padding: '1.5rem 2rem',
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem'
                                    }}>
                                        <Clock size={20} color="#8b5cf6" />
                                        <h4 style={{ margin: 0, color: 'white', fontSize: '1.1rem' }}>Recent Submissions</h4>
                                    </div>
                                    <div style={{ padding: '1rem' }}>
                                        {report.recentSubmissions.slice(0, 8).map((sub, i) => (
                                            <div key={i} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '1rem',
                                                padding: '1rem',
                                                background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                                borderRadius: '12px'
                                            }}>
                                                <div style={{
                                                    width: '44px',
                                                    height: '44px',
                                                    borderRadius: '12px',
                                                    background: sub.status === 'accepted' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    {sub.status === 'accepted' ? <CheckCircle size={22} color="#10b981" /> : <XCircle size={22} color="#ef4444" />}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, color: 'white', fontSize: '0.95rem' }}>{sub.title}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>{sub.language} • {sub.type}</div>
                                                </div>
                                                <div style={{
                                                    fontSize: '1.1rem',
                                                    fontWeight: 700,
                                                    color: getScoreColor(sub.score),
                                                    padding: '0.4rem 1rem',
                                                    background: `${getScoreColor(sub.score)}15`,
                                                    borderRadius: '8px'
                                                }}>{sub.score}%</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : null}
                </div>

                {/* Footer */}
                {report && (
                    <div style={{
                        padding: '1rem 2rem',
                        borderTop: '1px solid rgba(139, 92, 246, 0.2)',
                        background: 'rgba(30, 41, 59, 0.5)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.85rem',
                        color: '#64748b'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Calendar size={14} />
                            <span>Generated: {new Date(report.generatedAt).toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <User size={14} />
                            <span>Requested by: {report.requestedBy || 'System'}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    )
}

// Helper Components
function StatCard({ icon: Icon, label, value, subLabel, color }) {
    return (
        <div style={{
            padding: '1.5rem',
            background: `linear-gradient(135deg, ${color}10, ${color}05)`,
            borderRadius: '16px',
            border: `1px solid ${color}20`,
            textAlign: 'center',
            transition: 'all 0.3s ease'
        }}>
            <Icon size={28} color={color} style={{ marginBottom: '0.75rem' }} />
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'white' }}>{value}</div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.25rem' }}>{label}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>{subLabel}</div>
        </div>
    )
}

function IntegrityCard({ label, value, severity }) {
    const colors = {
        low: '#10b981',
        medium: '#f59e0b',
        high: '#ef4444'
    }
    const color = colors[severity]

    return (
        <div style={{
            padding: '1.25rem',
            background: `${color}10`,
            borderRadius: '14px',
            border: `1px solid ${color}20`,
            textAlign: 'center'
        }}>
            <div style={{ fontSize: '2.25rem', fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.5rem' }}>{label}</div>
        </div>
    )
}

export default StudentReportModal
