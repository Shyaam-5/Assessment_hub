import { useState, useEffect, useRef } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { LayoutDashboard, Upload, FileCode, Trophy, List, Users, Medal, Activity, CheckCircle, TrendingUp, Clock, Plus, X, ChevronRight, Code, Trash2, Eye, AlertTriangle, FileText, BarChart2, Zap, Award, Sparkles, Brain, Target, XCircle, Search, Mail, Calendar, BookOpen, Settings, ClipboardList, Shield, Download, MessageSquare, Flag, Star } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import DashboardLayout from '../components/DashboardLayout'
import { AIChatbot, AIFloatingButton } from '../components/AIChatbot'
import AptitudeReportModal from '../components/AptitudeReportModal'
import StudentReportModal from '../components/StudentReportModal'
import TestCasesManager from '../components/TestCasesManager'
import LocalTestCasesManager from '../components/LocalTestCasesManager'
import MentorLiveMonitoring from '../components/MentorLiveMonitoring'

import InlineCodeFeedback from '../components/InlineCodeFeedback'
import FileUpload from '../components/FileUpload'
import { useAuth } from '../App'
import { useI18n } from '../services/i18n.jsx'
import axios from 'axios'
import GlobalReportModal from '../components/GlobalReportModal'
import './Portal.css'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'
const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b']
const DEFAULT_SQL_SCHEMA = `CREATE TABLE employees (
  id INT PRIMARY KEY,
  name VARCHAR(100),
  department VARCHAR(100),
  salary DECIMAL(10,2),
  hire_date DATE,
  manager_id INT
);
INSERT INTO employees VALUES
(1,'Alice Johnson','Engineering',95000,'2020-03-15',NULL),
(2,'Bob Smith','Engineering',88000,'2021-07-01',1),
(3,'Carol Williams','Marketing',72000,'2019-11-20',NULL),
(4,'David Brown','Marketing',68000,'2022-01-10',3),
(5,'Eve Davis','Sales',76000,'2020-06-25',NULL);

CREATE TABLE departments (
  id INT PRIMARY KEY,
  name VARCHAR(100),
  budget DECIMAL(12,2),
  location VARCHAR(100)
);
INSERT INTO departments VALUES
(1,'Engineering',500000,'New York'),
(2,'Marketing',300000,'San Francisco'),
(3,'Sales',350000,'Chicago');

CREATE TABLE projects (
  id INT PRIMARY KEY,
  name VARCHAR(100),
  department_id INT,
  start_date DATE,
  end_date DATE,
  status VARCHAR(50)
);
INSERT INTO projects VALUES
(1,'Website Redesign',1,'2024-01-15','2024-06-30','completed'),
(2,'Mobile App',1,'2024-03-01','2024-12-31','in_progress'),
(3,'Q1 Campaign',2,'2024-01-01','2024-03-31','completed');

CREATE TABLE orders (
  id INT PRIMARY KEY,
  customer_name VARCHAR(100),
  product VARCHAR(100),
  quantity INT,
  price DECIMAL(10,2),
  order_date DATE
);
INSERT INTO orders VALUES
(1,'John Doe','Laptop',2,1200,'2024-01-15'),
(2,'Jane Smith','Keyboard',5,75,'2024-01-20'),
(3,'Bob Johnson','Monitor',3,450,'2024-02-10');`

function MentorPortal() {
    const { user } = useAuth()
    const { t } = useI18n()
    const location = useLocation()
    const [title, setTitle] = useState('')
    const [subtitle, setSubtitle] = useState('')
    const perms = Array.isArray(user?.permissions) ? user.permissions : []
    const can = (perm) => user?.role === 'admin' || user?.role === 'organization_admin' || perms.includes(perm)


    useEffect(() => {
        const path = location.pathname.split('/').pop()
        switch (path) {

            case 'upload-problems':
                setTitle(t('upload_problems'))
                setSubtitle(t('create_problems_subtitle'))
                break
            case 'leaderboard':
                setTitle(t('leaderboard'))
                setSubtitle(t('student_rankings'))
                break
            case 'all-submissions':
                setTitle(t('all_submissions'))
                setSubtitle(t('review_student_work'))
                break
            case 'live-monitoring':
                setTitle(t('live_student_monitoring'))
                setSubtitle(t('realtime_activity_subtitle'))
                break
            case 'analytics':
                setTitle(t('analytics'))
                setSubtitle(t('analytics_dashboard_subtitle'))
                break
            case 'messaging':
                setTitle('Direct Messaging')
                setSubtitle('Chat with your students')
                break
            default:
                setTitle(t('dashboard'))
                setSubtitle(t('welcome_back_name', { name: user?.name || '' }))
        }
    }, [location, user, t])

    const navItems = [
        { path: '/mentor', label: t('dashboard'), icon: <LayoutDashboard size={20} /> },
        {
            label: 'Content Management',
            icon: <FileCode size={20} />,
            defaultExpanded: false,
            children: [
                can('tests.create') && { path: '/mentor/upload-problems', label: t('upload_problems'), icon: <FileCode size={20} /> }
            ].filter(Boolean)
        },
        {
            label: 'Monitoring',
            icon: <Activity size={20} />,
            defaultExpanded: false,
            children: [
                can('tests.view') && { path: '/mentor/leaderboard', label: t('leaderboard'), icon: <Trophy size={20} /> },
                can('tests.view') && { path: '/mentor/all-submissions', label: t('all_submissions'), icon: <List size={20} /> },
                can('analytics.view') && { path: '/mentor/analytics', label: t('analytics'), icon: <TrendingUp size={20} /> },
                can('proctoring.view') && { path: '/mentor/live-monitoring', label: t('live_monitoring'), icon: <Activity size={20} /> }
            ].filter(Boolean)
        }]
        .filter((item) => !item.children || item.children.length > 0)

    return (
        <DashboardLayout navItems={navItems} title={title} subtitle={subtitle}>
            <Routes>
                <Route path="/" element={<Dashboard user={user} />} />
                <Route path="/upload-problems" element={<UploadProblems user={user} />} />
                <Route path="/leaderboard" element={<Leaderboard user={user} />} />
                <Route path="/all-submissions" element={<AllSubmissions user={user} />} />
                <Route path="/analytics" element={<MentorAnalytics user={user} />} />
                <Route path="/live-monitoring" element={<MentorLiveMonitoring user={user} />} />
            </Routes>
        </DashboardLayout>
    )
}

function Dashboard({ user }) {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const perms = Array.isArray(user?.permissions) ? user.permissions : []
    const canViewAnalytics = user?.role === 'admin' || user?.role === 'organization_admin' || perms.includes('analytics.view')

    useEffect(() => {
        if (!canViewAnalytics) {
            setLoading(false)
            setError('You do not have analytics permission to view dashboard metrics.')
            return
        }
        axios.get(`${API_BASE}/analytics/mentor/${user.id}`)
            .then(res => {
                setStats(res.data)
                setLoading(false)
            })
            .catch(err => {
                setError(err?.response?.data?.detail || 'Failed to load dashboard metrics')
                setLoading(false)
            })
    }, [user.id, canViewAnalytics])

    const formatTimeAgo = (dateStr) => {
        if (!dateStr) return 'Never'
        const date = new Date(dateStr)
        const now = new Date()
        const diffMs = now - date
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMins / 60)
        const diffDays = Math.floor(diffHours / 24)

        if (diffMins < 1) return 'Just now'
        if (diffMins < 60) return `${diffMins}m ago`
        if (diffHours < 24) return `${diffHours}h ago`
        if (diffDays < 7) return `${diffDays}d ago`
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    if (loading) return <div className="page-loading"><div className="loading-spinner" /></div>
    if (error) return <div className="dashboard-panel">{error}</div>
    if (!stats) return <div className="dashboard-panel">No dashboard data available.</div>

    const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
    const deltaPct = (current, previous) => {
        const c = toNum(current)
        const p = toNum(previous)
        if (p <= 0) return c > 0 ? 100 : 0
        return ((c - p) / p) * 100
    }
    const fmtDelta = (value) => {
        const rounded = Math.round(value * 10) / 10
        if (rounded > 0) return `+${rounded}%`
        if (rounded < 0) return `${rounded}%`
        return '0.0%'
    }

    const trendSeries = Array.isArray(stats.submissionTrends) ? stats.submissionTrends : []
    const half = Math.max(1, Math.floor(trendSeries.length / 2))
    const currentWindow = trendSeries.slice(-half).reduce((sum, i) => sum + toNum(i.count), 0)
    const previousWindow = trendSeries.slice(-2 * half, -half).reduce((sum, i) => sum + toNum(i.count), 0)
    const submissionsDelta = deltaPct(currentWindow, previousWindow)

    const activity = Array.isArray(stats.recentActivity) ? stats.recentActivity : []
    const completedNow = activity.slice(0, Math.max(1, Math.floor(activity.length / 2))).filter((a) => (a.status || '').toLowerCase() === 'accepted').length
    const completedPrev = activity.slice(Math.max(1, Math.floor(activity.length / 2))).filter((a) => (a.status || '').toLowerCase() === 'accepted').length
    const qualityDelta = deltaPct(completedNow, Math.max(1, completedPrev))
    const codeDelta = deltaPct(toNum(stats.codeSubmissions), Math.max(1, toNum(stats.aptitudeSubmissions)))
    const scoreDelta = deltaPct(toNum(stats.avgScore), 70)

    const kpiCards = [
        { label: 'Submission Velocity', value: `${currentWindow}`, delta: submissionsDelta, meta: 'current vs previous window' },
        { label: 'Code Focus Delta', value: `${stats.codeSubmissions || 0}`, delta: codeDelta, meta: 'vs aptitude submissions' },
        { label: 'Group Quality Delta', value: `${stats.avgScore || 0}%`, delta: scoreDelta, meta: 'against 70% baseline' },
        { label: 'Accepted Runs Delta', value: `${completedNow}`, delta: qualityDelta, meta: 'recent accepted completions' },
    ]

    return (
        <div className="dashboard-container animate-fadeIn">
            {/* Top Stats Row - 5 Cards */}
            <div className="dashboard-stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                {/* Your Students */}
                <div className="dashboard-stat-card stat-card-blue">
                    <div className="stat-card-inner">
                        <div className="stat-icon-box" style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)' }}>
                            <Users size={22} color="#fff" />
                        </div>
                        <div className="stat-content">
                            <div className="stat-number">{stats.totalStudents}</div>
                            <div className="stat-label-text">Students</div>
                        </div>
                    </div>
                </div>

                {/* Code Submissions */}
                <div className="dashboard-stat-card stat-card-emerald">
                    <div className="stat-card-inner">
                        <div className="stat-icon-box" style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}>
                            <Code size={22} color="#fff" />
                        </div>
                        <div className="stat-content">
                            <div className="stat-number">{stats.codeSubmissions || 0}</div>
                            <div className="stat-label-text">Code Subs</div>
                        </div>
                    </div>
                </div>

                {/* Aptitude Submissions */}
                <div className="dashboard-stat-card stat-card-pink">
                    <div className="stat-card-inner">
                        <div className="stat-icon-box" style={{ background: 'linear-gradient(135deg, #be185d, #ec4899)' }}>
                            <Brain size={22} color="#fff" />
                        </div>
                        <div className="stat-content">
                            <div className="stat-number">{stats.aptitudeSubmissions || 0}</div>
                            <div className="stat-label-text">Aptitude</div>
                        </div>
                    </div>
                </div>

                {/* Group Score */}
                <div className="dashboard-stat-card stat-card-green">
                    <div className="stat-card-inner">
                        <div className="stat-icon-box" style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}>
                            <CheckCircle size={22} color="#fff" />
                        </div>
                        <div className="stat-content">
                            <div className="stat-number">{stats.avgScore}%</div>
                            <div className="stat-label-text">Avg Score</div>
                        </div>
                    </div>
                </div>

                {/* Total Content */}
                <div className="dashboard-stat-card stat-card-orange">
                    <div className="stat-card-inner">
                        <div className="stat-icon-box" style={{ background: 'linear-gradient(135deg, #c2410c, #f97316)' }}>
                            <TrendingUp size={22} color="#fff" />
                        </div>
                        <div className="stat-content">
                            <div className="stat-number">{stats.totalProblems}</div>
                            <div className="stat-label-text">Content</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="kpi-trend-grid">
                {kpiCards.map((kpi) => (
                    <div key={kpi.label} className="kpi-trend-card">
                        <div className="kpi-trend-label">{kpi.label}</div>
                        <div className="kpi-trend-value">{kpi.value}</div>
                        <div className="kpi-trend-meta">{kpi.meta}</div>
                        <div className={`kpi-trend-delta ${kpi.delta > 0 ? 'up' : kpi.delta < 0 ? 'down' : 'flat'}`}>
                            {fmtDelta(kpi.delta)}
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts Section */}
            <div className="mentor-charts-grid">
                <div className="dashboard-panel mentor-chart-large">
                    <div className="chart-header">
                        <div>
                            <h3 className="panel-title" style={{ marginBottom: '0.25rem' }}>
                                <BarChart2 size={18} color="#8b5cf6" /> Group Submission Trends
                            </h3>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Last 7 days mentee activity</p>
                        </div>
                    </div>
                    <div style={{ width: '100%', height: '280px', marginTop: '1rem' }}>
                        <ResponsiveContainer>
                            <AreaChart data={stats.submissionTrends}>
                                <defs>
                                    <linearGradient id="colorCountMentor" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} axisLine={false} tickLine={false} />
                                <YAxis stroke="var(--text-muted)" fontSize={12} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}
                                    itemStyle={{ color: '#8b5cf6' }}
                                    labelStyle={{ color: 'var(--text)' }}
                                />
                                <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorCountMentor)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="dashboard-panel mentor-chart-small">
                    <div className="chart-header">
                        <div>
                            <h3 className="panel-title" style={{ marginBottom: '0.25rem' }}>
                                <Code size={18} color="#3b82f6" /> Language Usage
                            </h3>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Mentee preference</p>
                        </div>
                    </div>
                    <div style={{ width: '100%', height: '280px', marginTop: '1rem' }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={stats.languageStats}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={65}
                                    outerRadius={90}
                                    paddingAngle={4}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {stats.languageStats.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '10px' }}
                                    itemStyle={{ color: 'var(--text)' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="language-legend">
                            {stats.languageStats.slice(0, 4).map((lang, idx) => (
                                <div key={lang.name} className="legend-item">
                                    <span className="legend-dot" style={{ background: COLORS[idx] }}></span>
                                    <span className="legend-text">{lang.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Three Column Bottom Section */}
            <div className="mentor-bottom-grid" style={{ gridTemplateColumns: '1fr' }}>
                {/* Recent Mentee Activity */}
                <div className="dashboard-panel">
                    <div className="panel-header">
                        <h3 className="panel-title" style={{ margin: 0 }}>
                            <Activity size={18} color="#8b5cf6" /> Recent Activity
                        </h3>
                    </div>
                    <div className="submissions-list">
                        {stats.recentActivity && stats.recentActivity.length > 0 ? (
                            stats.recentActivity.map((sub, idx) => (
                                <div key={sub.id} className="submission-item">
                                    <div className={`activity-status-dot ${sub.status}`}></div>
                                    <div className="submission-info">
                                        <div className="submission-title">{sub.studentName}</div>
                                        <div className="submission-meta">
                                            <Clock size={12} /> {formatTimeAgo(sub.time)}
                                        </div>
                                    </div>
                                    <span className={`submission-status ${sub.status}`}>
                                        {sub.score}%
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="empty-state-small">
                                <Activity size={32} color="var(--text-muted)" />
                                No recent activity
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}



// ==================== UPLOAD CODING PROBLEMS ====================
function UploadProblems({ user }) {
    const [problems, setProblems] = useState([])
    const [students, setStudents] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showAIChat, setShowAIChat] = useState(false)
    const [activeTab, setActiveTab] = useState('coding') // 'coding' or 'sql'
    const [uploading, setUploading] = useState(false)
    const [submittingProblem, setSubmittingProblem] = useState(false)
    const csvInputRef = useRef(null)
    const [selectedProblemForTestCases, setSelectedProblemForTestCases] = useState(null)
    const [showDraftTestCasesManager, setShowDraftTestCasesManager] = useState(false)
    const [problem, setProblem] = useState({
        title: '',
        type: 'Coding',
        language: 'Python',
        difficulty: 'Medium',
        description: '',
        testInput: '',
        expectedOutput: '',
        testCases: [],
        deadline: '',
        status: 'live',
        // SQL specific fields
        sqlSchema: DEFAULT_SQL_SCHEMA,
        expectedQueryResult: '',
        // Proctoring settings
        enableProctoring: false,
        enableVideoAudio: false,
        disableCopyPaste: false,
        trackTabSwitches: false,
        maxTabSwitches: 3,
        enableFaceDetection: false,
        detectMultipleFaces: false,
        trackFaceLookaway: false,
        excludedViolationTypes: ['window_blur']
    })

    // Check if SQL is selected
    const isSQLProblem = problem.type === 'SQL' || problem.language === 'SQL'

    // AI Chatbot handler - auto-fills the problem form
    const handleAIGenerate = (generated) => {
        const isSQL = generated.type === 'SQL' || generated.language === 'SQL'
        setProblem({
            title: generated.title || '',
            type: generated.type || 'Coding',
            language: generated.language || 'Python',
            difficulty: generated.difficulty || 'Medium',
            description: generated.description || '',
            testInput: isSQL ? '' : (generated.sampleInput || ''),
            expectedOutput: isSQL ? '' : (generated.expectedOutput || ''),
            testCases: isSQL ? [] : (Array.isArray(generated.testCases) ? generated.testCases : []),
            sqlSchema: isSQL ? (generated.sqlSchema || generated.schema || DEFAULT_SQL_SCHEMA) : '',
            expectedQueryResult: isSQL ? (generated.expectedOutput || generated.expectedQueryResult || generated.expectedResult || '') : '',
            deadline: problem.deadline,
            status: generated.status || 'live',
            enableProctoring: problem.enableProctoring,
            enableVideoAudio: problem.enableVideoAudio,
            disableCopyPaste: problem.disableCopyPaste,
            trackTabSwitches: problem.trackTabSwitches,
            maxTabSwitches: problem.maxTabSwitches,
            enableFaceDetection: problem.enableFaceDetection,
            detectMultipleFaces: problem.detectMultipleFaces,
            trackFaceLookaway: problem.trackFaceLookaway,
            excludedViolationTypes: problem.excludedViolationTypes || ['window_blur']
        })
        setShowAIChat(false)
        setShowModal(true)
    }

    const fetchData = async () => {
        try {
            const [problemsRes, studentsRes] = await Promise.all([
                axios.get(`${API_BASE}/problems?mentorId=${user.id}`),
                axios.get(`${API_BASE}/mentors/${user.id}/students`)
            ])
            setProblems(Array.isArray(problemsRes.data) ? problemsRes.data : (problemsRes.data?.data || []))
            setStudents(studentsRes.data)
            setLoading(false)
        } catch (err) {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [user.id])

    const handleCSVUpload = async (e) => {
        if (uploading) return
        const file = e.target.files[0]
        if (!file) return
        setUploading(true)

        try {
            const text = await file.text()
            const lines = text.split('\n').filter(l => l.trim()).map(l => l.trim())
            if (lines.length < 2) { alert('CSV must have header + at least one row'); return }

            // Parse CSV with proper quote handling
            const parseCSVLine = (line) => {
                const result = []
                let current = ''
                let insideQuotes = false
                for (let i = 0; i < line.length; i++) {
                    const char = line[i]
                    if (char === '"') {
                        insideQuotes = !insideQuotes
                    } else if (char === ',' && !insideQuotes) {
                        result.push(current.trim())
                        current = ''
                    } else {
                        current += char
                    }
                }
                result.push(current.trim())
                return result
            }

            const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase())
            let created = 0

            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue
                const vals = parseCSVLine(lines[i])
                const row = {}
                headers.forEach((h, idx) => row[h] = vals[idx] || '')

                if (!row.title || !row.description) continue

                const isSQL = (row.type || '').toUpperCase() === 'SQL' || (row.language || '').toUpperCase() === 'SQL'

                // Map various column name variations
                const getTestInput = () => {
                    return row['testinput'] || row['test_input'] || row['testinput'] || row['sample_input'] || row['sampleinput'] || row['sample input'] || row['test input'] || ''
                }

                const getExpectedOutput = () => {
                    return row['expectedoutput'] || row['expected_output'] || row['expectedresult'] || row['expected_result'] || row['expected output'] || row['expected result'] || ''
                }

                const getSQLSchema = () => {
                    return row['sqlschema'] || row['sql_schema'] || row['schema'] || row['sql schema'] || ''
                }

                const getExpectedQueryResult = () => {
                    return row['expectedqueryresult'] || row['expected_query_result'] || row['expectedresult'] || row['expected_result'] || row['expected query result'] || ''
                }

                await axios.post(`${API_BASE}/problems`, {
                    title: row.title,
                    type: isSQL ? 'SQL' : (row.type || 'Coding'),
                    language: isSQL ? 'SQL' : (row.language || 'Python'),
                    difficulty: (row.difficulty || 'Medium').charAt(0).toUpperCase() + (row.difficulty || 'Medium').slice(1).toLowerCase(),
                    description: row.description || '',
                    testInput: getTestInput(),
                    expectedOutput: getExpectedOutput(),
                    sqlSchema: isSQL ? getSQLSchema() : '',
                    expectedQueryResult: isSQL ? getExpectedQueryResult() : '',
                    deadline: row.deadline || '',
                    status: row.status || 'live',
                    mentorId: user.id
                })
                created++
            }
            alert(`Created ${created} problems from CSV!`)
            fetchData()
        } catch (err) {
            alert('CSV upload failed: ' + (err.response?.data?.error || err.message))
        } finally {
            setUploading(false)
            e.target.value = ''
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (submittingProblem) return
        setSubmittingProblem(true)
        try {
            const normalizedTestCases = Array.isArray(problem.testCases)
                ? problem.testCases
                    .map((tc) => ({
                        input: tc.input || '',
                        expectedOutput: tc.expectedOutput || tc.expected_output || '',
                        isHidden: !!tc.isHidden,
                        points: tc.points || 10,
                        description: tc.description || ''
                    }))
                    .filter((tc) => tc.input.trim() || tc.expectedOutput.trim())
                : []
            await axios.post(`${API_BASE}/problems`, {
                ...problem,
                testCases: normalizedTestCases.length > 0
                    ? normalizedTestCases
                    : (problem.testInput || problem.expectedOutput
                        ? [{
                            input: problem.testInput || '',
                            expectedOutput: problem.expectedOutput || '',
                            isHidden: false,
                            points: 10,
                            description: 'Sample case'
                        }]
                        : []),
                mentorId: user.id
            })
            setShowModal(false)
            setProblem({
                title: '', type: 'Coding', language: 'Python', difficulty: 'Medium',
                description: '', testInput: '', expectedOutput: '', testCases: [], deadline: '', status: 'live',
                enableProctoring: false, enableVideoAudio: false, disableCopyPaste: false,
                trackTabSwitches: false, maxTabSwitches: 3,
                enableFaceDetection: false, detectMultipleFaces: false, trackFaceLookaway: false, excludedViolationTypes: ['window_blur']
            })
            fetchData()
        } catch (error) {
            alert('Error creating problem')
        } finally {
            setSubmittingProblem(false)
        }
    }

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this problem?')) {
            try {
                await axios.delete(`${API_BASE}/problems/${id}`)
                fetchData()
            } catch (error) {
                alert('Error deleting problem')
            }
        }
    }

    const canDelete = (problem) => {
        // Allow deletion if no one has started (0 submissions) OR if everyone has finished
        const completedCount = problem.completedBy?.length || 0;
        return completedCount === 0 || (completedCount >= students.length && students.length > 0);
    }

    if (loading) return <div className="page-loading"><div className="loading-spinner" /></div>

    // Separate problems into Coding and SQL
    const codingProblems = problems.filter(p => p.language !== 'SQL' && p.type !== 'SQL')
    const sqlProblems = problems.filter(p => p.language === 'SQL' || p.type === 'SQL')
    const displayedProblems = activeTab === 'coding' ? codingProblems : sqlProblems

    return (
        <div className="animate-fadeIn">
            {/* Header with Create Button */}
            <div className="section-header" style={{ marginBottom: '2rem' }}>
                <div>
                    <h2 className="section-title">Coding Problems</h2>
                    <p className="section-subtitle">Manage your problem library (C, C++, Python, Java, SQL)</p>
                </div>
                <div className="btn-group" style={{ flexWrap: 'wrap' }}>
                    <input type="file" accept=".csv" ref={csvInputRef} style={{ display: 'none' }} onChange={handleCSVUpload} />
                    <button onClick={() => csvInputRef.current?.click()} disabled={uploading} className="btn-action-green">
                        <Upload size={18} /> {uploading ? 'Uploading...' : 'CSV Upload'}
                    </button>
                    <button onClick={() => setShowAIChat(true)} className="btn-action-purple">
                        <Sparkles size={18} /> AI Generate
                    </button>
                    <button onClick={() => setShowModal(true)} className="btn-create-new">
                        <Plus size={20} /> Create Manually
                    </button>
                </div>
            </div>

            {/* Tab Buttons */}
            <div className="tabs-bar" style={{ marginBottom: '1.5rem', width: 'fit-content' }}>
                <button onClick={() => setActiveTab('coding')} className={`tab-btn${activeTab === 'coding' ? ' active' : ''}`}>
                    <Code size={18} /> Coding Problems <span className="tab-count">{codingProblems.length}</span>
                </button>
                <button onClick={() => setActiveTab('sql')} className={`tab-btn${activeTab === 'sql' ? ' active' : ''}`}>
                    <FileText size={18} /> SQL Problems <span className="tab-count">{sqlProblems.length}</span>
                </button>
            </div>

            {/* Problem Leaderboard Table */}
            <div className="card glass">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                    <Trophy size={20} style={{ color: '#f59e0b' }} /> Problem Leaderboard
                </h3>
                <div className="table-container" style={{ border: 'none' }}>
                    <table>
                        <thead>
                            <tr>
                                <th>Problem Title</th>
                                <th>Type</th>
                                <th>Language</th>
                                <th>Difficulty</th>
                                <th>Created</th>
                                <th>Completion</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedProblems.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                        No {activeTab === 'sql' ? 'SQL' : 'coding'} problems found. Create one to get started!
                                    </td>
                                </tr>
                            ) : displayedProblems.map(p => (
                                <tr key={p.id}>
                                    <td style={{ fontWeight: 600 }}>
                                        <div className="problem-card-badges">
                                            {p.title}
                                            {p.proctoring?.enabled && (
                                                <span className="badge-proctored"><Eye size={10} /> Proctored</span>
                                            )}
                                        </div>
                                    </td>
                                    <td><span className="badge-type">{p.type?.toUpperCase()}</span></td>
                                    <td><span style={{ fontWeight: 500 }}>{p.language}</span></td>
                                    <td><span className={`difficulty-badge ${p.difficulty?.toLowerCase()}`}>{p.difficulty}</span></td>
                                    <td className="text-muted-sm">{new Date(p.createdAt).toLocaleDateString()}</td>
                                    <td>
                                        <div className="completion-bar-wrap">
                                            <div className="completion-bar">
                                                <div className="completion-fill" style={{ width: `${students.length > 0 ? ((p.completedBy?.length || 0) / students.length) * 100 : 0}%` }} />
                                            </div>
                                            <span className="text-muted-sm">{p.completedBy?.length || 0}/{students.length}</span>
                                        </div>
                                    </td>
                                    <td><span className={`status-badge ${p.status}`}>{p.status}</span></td>
                                    <td>
                                        <div className="btn-group">
                                            <button
                                                onClick={() => setSelectedProblemForTestCases(p)}
                                                disabled={p.language === 'SQL' || p.type === 'SQL'}
                                                className={`tbl-action-btn ${(p.language === 'SQL' || p.type === 'SQL') ? 'disabled' : 'success'}`}
                                                title={(p.language === 'SQL' || p.type === 'SQL') ? 'Test cases not available for SQL problems' : 'Manage Test Cases'}
                                            >
                                                <ClipboardList size={14} /> Tests
                                            </button>
                                            <button
                                                onClick={() => handleDelete(p.id)}
                                                disabled={!canDelete(p)}
                                                className={`tbl-action-btn ${canDelete(p) ? 'danger' : 'disabled'}`}
                                                title={canDelete(p) ? 'Delete problem' : 'Cannot delete while students are in progress'}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Problem Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-title-with-icon">
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <FileCode size={20} color="white" />
                                </div>
                                <h2>Create New Problem</h2>
                            </div>
                            <button onClick={() => setShowModal(false)} className="modal-close"><X size={20} /></button>
                        </div>
                        <div className="modal-body premium-form">
                            <form onSubmit={handleSubmit}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                    <div className="form-group">
                                        <label className="form-label">Problem Title</label>
                                        <input type="text" placeholder="Enter problem title" value={problem.title} onChange={(e) => setProblem({ ...problem, title: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Problem Type</label>
                                        <select value={problem.type} onChange={(e) => {
                                            const newType = e.target.value
                                            setProblem({
                                                ...problem,
                                                type: newType,
                                                language: newType === 'SQL' ? 'SQL' : problem.language === 'SQL' ? 'Python' : problem.language
                                            })
                                        }}>
                                            <option value="Coding">Coding</option>
                                            <option value="SQL">SQL</option>
                                            <option value="Algorithm">Algorithm</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                    <div className="form-group">
                                        <label className="form-label">Language</label>
                                        <select
                                            value={problem.language}
                                            onChange={(e) => {
                                                const newLang = e.target.value
                                                setProblem({
                                                    ...problem,
                                                    language: newLang,
                                                    type: newLang === 'SQL' ? 'SQL' : problem.type === 'SQL' ? 'Coding' : problem.type
                                                })
                                            }}
                                        >
                                            <option value="Python">Python</option>
                                            <option value="JavaScript">JavaScript</option>
                                            <option value="Java">Java</option>
                                            <option value="C">C</option>
                                            <option value="C++">C++</option>
                                            <option value="SQL">SQL</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Difficulty</label>
                                        <select value={problem.difficulty} onChange={(e) => setProblem({ ...problem, difficulty: e.target.value })}>
                                            <option value="Easy">Easy</option>
                                            <option value="Medium">Medium</option>
                                            <option value="Hard">Hard</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select value={problem.status} onChange={(e) => setProblem({ ...problem, status: e.target.value })}>
                                            <option value="live">Live</option>
                                            <option value="draft">Draft</option>
                                            <option value="closed">Closed</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label className="form-label">Problem Description</label>
                                    <textarea rows="5" placeholder="Describe the problem..." value={problem.description} onChange={(e) => setProblem({ ...problem, description: e.target.value })} required></textarea>
                                </div>

                                {/* SQL-specific fields */}
                                {isSQLProblem ? (
                                    <>
                                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <Code size={14} color="#06b6d4" /> Database Schema (CREATE TABLE statements)
                                            </label>
                                            <textarea
                                                rows="6"
                                                placeholder="CREATE TABLE employees (&#10;  id INT PRIMARY KEY,&#10;  name VARCHAR(100),&#10;  department VARCHAR(50),&#10;  salary DECIMAL(10,2)&#10;);&#10;&#10;INSERT INTO employees VALUES (1, 'John', 'IT', 50000);"
                                                value={problem.sqlSchema}
                                                onChange={(e) => setProblem({ ...problem, sqlSchema: e.target.value })}
                                                style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                                            />
                                            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                Include CREATE TABLE and INSERT statements to set up the test database
                                            </small>
                                        </div>
                                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <CheckCircle size={14} color="#10b981" /> Expected Query Result
                                            </label>
                                            <textarea
                                                rows="4"
                                                placeholder="id | name | salary&#10;1  | John | 50000&#10;2  | Jane | 60000"
                                                value={problem.expectedQueryResult}
                                                onChange={(e) => setProblem({ ...problem, expectedQueryResult: e.target.value })}
                                                style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                                            />
                                            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                The expected output when the correct SQL query is executed
                                            </small>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                            <div className="form-group">
                                                <label className="form-label">Sample Input</label>
                                                <input type="text" placeholder="e.g., [1, 2, 3]" value={problem.testInput} onChange={(e) => setProblem({ ...problem, testInput: e.target.value })} />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Expected Output</label>
                                                <input type="text" placeholder="e.g., 6" value={problem.expectedOutput} onChange={(e) => setProblem({ ...problem, expectedOutput: e.target.value })} />
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                            <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                                {problem.testCases?.length || 0} saved test case{(problem.testCases?.length || 0) === 1 ? '' : 's'}
                                            </small>
                                            <button
                                                type="button"
                                                className="btn-reset"
                                                onClick={() => setShowDraftTestCasesManager(true)}
                                                style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                            >
                                                <Code size={14} /> Manage Test Cases
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label className="form-label">Deadline (Optional)</label>
                                    <input type="date" value={problem.deadline} onChange={(e) => setProblem({ ...problem, deadline: e.target.value })} />
                                </div>

                                {/* Proctoring Settings */}
                                <div style={{
                                    padding: '1.25rem',
                                    background: 'rgba(139, 92, 246, 0.05)',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(139, 92, 246, 0.2)',
                                    marginBottom: '1.5rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <Eye size={18} color="#8b5cf6" />
                                        <span style={{ fontWeight: 600, color: '#8b5cf6' }}>Proctoring Settings</span>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                        <input
                                            type="checkbox"
                                            id="enableProctoring"
                                            checked={problem.enableProctoring}
                                            onChange={(e) => setProblem({ ...problem, enableProctoring: e.target.checked })}
                                            style={{ width: '18px', height: '18px', accentColor: '#8b5cf6' }}
                                        />
                                        <label htmlFor="enableProctoring" style={{ cursor: 'pointer', fontSize: '0.9rem' }}>Enable Proctoring Mode</label>
                                    </div>

                                    {problem.enableProctoring && (
                                        <div style={{ marginLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <input
                                                    type="checkbox"
                                                    id="enableVideoAudio"
                                                    checked={problem.enableVideoAudio}
                                                    onChange={(e) => setProblem({ ...problem, enableVideoAudio: e.target.checked })}
                                                    style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }}
                                                />
                                                <label htmlFor="enableVideoAudio" style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    📹 Enable Video & Audio Monitoring
                                                </label>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <input
                                                    type="checkbox"
                                                    id="disableCopyPaste"
                                                    checked={problem.disableCopyPaste}
                                                    onChange={(e) => setProblem({ ...problem, disableCopyPaste: e.target.checked })}
                                                    style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }}
                                                />
                                                <label htmlFor="disableCopyPaste" style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    🚫 Disable Copy/Paste
                                                </label>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <input
                                                    type="checkbox"
                                                    id="trackTabSwitches"
                                                    checked={problem.trackTabSwitches}
                                                    onChange={(e) => setProblem({ ...problem, trackTabSwitches: e.target.checked })}
                                                    style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }}
                                                />
                                                <label htmlFor="trackTabSwitches" style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    👁️ Track Tab Switches
                                                </label>
                                            </div>

                                            {problem.trackTabSwitches && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '1.5rem' }}>
                                                    <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Max Tab Switches:</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="10"
                                                        value={problem.maxTabSwitches}
                                                        onChange={(e) => setProblem({ ...problem, maxTabSwitches: parseInt(e.target.value) || 3 })}
                                                        style={{ width: '60px', padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'white', textAlign: 'center' }}
                                                    />
                                                </div>
                                            )}

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <input
                                                    type="checkbox"
                                                    id="excludeWindowBlur"
                                                    checked={Array.isArray(problem.excludedViolationTypes) && problem.excludedViolationTypes.includes('window_blur')}
                                                    onChange={(e) => setProblem({
                                                        ...problem,
                                                        excludedViolationTypes: e.target.checked ? ['window_blur'] : []
                                                    })}
                                                    style={{ width: '16px', height: '16px', accentColor: '#22c55e' }}
                                                />
                                                <label htmlFor="excludeWindowBlur" style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    Exclude window blur from auto-submit counting
                                                </label>
                                            </div>

                                            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(139, 92, 246, 0.2)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                                    <input
                                                        type="checkbox"
                                                        id="enableFaceDetection"
                                                        checked={problem.enableFaceDetection}
                                                        onChange={(e) => setProblem({ ...problem, enableFaceDetection: e.target.checked })}
                                                        style={{ width: '16px', height: '16px', accentColor: '#ec4899' }}
                                                    />
                                                    <label htmlFor="enableFaceDetection" style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                        👁️ Enable Face Detection
                                                    </label>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                                    <input
                                                        type="checkbox"
                                                        id="detectMultipleFaces"
                                                        checked={problem.detectMultipleFaces}
                                                        onChange={(e) => setProblem({ ...problem, detectMultipleFaces: e.target.checked })}
                                                        style={{ width: '16px', height: '16px', accentColor: '#ef4444' }}
                                                    />
                                                    <label htmlFor="detectMultipleFaces" style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                        👥 Detect Multiple Faces (Cheating)
                                                    </label>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <input
                                                        type="checkbox"
                                                        id="trackFaceLookaway"
                                                        checked={problem.trackFaceLookaway}
                                                        onChange={(e) => setProblem({ ...problem, trackFaceLookaway: e.target.checked })}
                                                        style={{ width: '16px', height: '16px', accentColor: '#3b82f6' }}
                                                    />
                                                    <label htmlFor="trackFaceLookaway" style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                        👀 Track Face Lookaway
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="form-actions">
                                    <button type="button" className="btn-reset" onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit" className="btn-create-new" disabled={submittingProblem}><Plus size={16} /> {submittingProblem ? 'Creating...' : 'Create Problem'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Chatbot for Problem Generation */}
            <AIChatbot
                context="problem"
                isOpen={showAIChat}
                onClose={() => setShowAIChat(false)}
                onGenerate={handleAIGenerate}
            />

            {/* Test Cases Manager Modal */}
            {selectedProblemForTestCases && (
                <TestCasesManager
                    problemId={selectedProblemForTestCases.id}
                    problemTitle={selectedProblemForTestCases.title}
                    onClose={() => setSelectedProblemForTestCases(null)}
                />
            )}

            {showDraftTestCasesManager && (
                <LocalTestCasesManager
                    initialTestCases={problem.testCases || []}
                    title={problem.title || 'Draft Coding Problem'}
                    onUpdate={(cases) => setProblem(prev => ({
                        ...prev,
                        testCases: cases,
                        testInput: cases[0]?.input || prev.testInput,
                        expectedOutput: cases[0]?.expectedOutput || cases[0]?.expected_output || prev.expectedOutput,
                    }))}
                    onClose={() => setShowDraftTestCasesManager(false)}
                />
            )}
        </div>
    )
}

// ==================== STUDENT LEADERBOARD ====================
function Leaderboard({ user }) {
    const [leaders, setLeaders] = useState([])
    const [loading, setLoading] = useState(true)
    const [reportStudent, setReportStudent] = useState(null)

    useEffect(() => {
        axios.get(`${API_BASE}/leaderboard?mentorId=${user.id}`)
            .then(res => {
                setLeaders(res.data)
                setLoading(false)
            })
            .catch(res => setLoading(false))
    }, [user.id])

    if (loading) return <div className="page-loading"><div className="loading-spinner" /></div>

    const getRankStyle = (rank) => {
        if (rank === 1) return { color: '#fbbf24', transform: 'scale(1.2)' }
        if (rank === 2) return { color: '#94a3b8', transform: 'scale(1.1)' }
        if (rank === 3) return { color: '#b45309', transform: 'scale(1.1)' }
        return { color: 'var(--text-muted)' }
    }

    const getRankIcon = (rank) => {
        if (rank === 1) return <Trophy size={24} fill="#fbbf24" color="#d97706" />
        if (rank === 2) return <Medal size={24} fill="#e2e8f0" color="#64748b" />
        if (rank === 3) return <Medal size={24} fill="#fbbf24" color="#b45309" />
        return <span style={{ fontWeight: 600, fontSize: '1.1rem', width: '24px', textAlign: 'center', display: 'inline-block' }}>#{rank}</span>
    }

    const getTotalViolations = (student) => {
        if (!student.violations) return 0
        return (student.violations.tabSwitches || 0) +
            (student.violations.copyPaste || 0) +
            (student.violations.cameraBlocked || 0) +
            (student.violations.phoneDetection || 0) +
            (student.violations.integrityViolations || 0) +
            (student.violations.plagiarism || 0)
    }

    return (
        <div className="card animate-slideUp glass" style={{ padding: '0 0 1rem 0', overflow: 'hidden' }}>
            <div style={{ padding: '2rem 2rem 1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Trophy size={28} className="text-primary" />
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.5rem' }}>Student Leaderboard</h3>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Rankings based on scores</p>
                </div>
            </div>

            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: '0 8px', padding: '0 1rem' }}>
                    <thead>
                        <tr>
                            <th style={{ paddingLeft: '2rem' }}>Rank</th>
                            <th>Student</th>
                            <th>Total Score</th>
                            <th>Submissions</th>
                            <th>Violations</th>
                            <th style={{ textAlign: 'center' }}>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leaders.map((student, i) => {
                            const totalViolations = getTotalViolations(student)
                            const hasIssues = totalViolations > 0 || student.violations?.plagiarism > 0

                            return (
                                <tr key={student.studentId} className="leaderboard-row" style={{
                                    backgroundColor: i < 3 ? 'var(--bg-dark)' : 'transparent',
                                    transition: 'transform 0.2s',
                                }}>
                                    <td style={{ paddingLeft: '2rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', ...getRankStyle(i + 1) }}>
                                            {getRankIcon(i + 1)}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div className="avatar-circle">
                                                {student.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{student.name}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1.1rem', color: 'var(--primary)' }}>
                                            {student.avgScore} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>pts</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="status-badge live" style={{ width: 'fit-content' }}>
                                            {student.acceptedSubmissions || student.totalSubmissions} Submitted
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            {student.violations?.tabSwitches > 0 && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    background: 'rgba(245, 158, 11, 0.15)',
                                                    color: '#f59e0b',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }} title="Tab Switches">
                                                    <Eye size={10} /> {student.violations.tabSwitches}
                                                </span>
                                            )}
                                            {student.violations?.cameraBlocked > 0 && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    background: 'rgba(239, 68, 68, 0.15)',
                                                    color: '#ef4444',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }} title="Camera Blocked">
                                                    📷 {student.violations.cameraBlocked}
                                                </span>
                                            )}
                                            {student.violations?.phoneDetection > 0 && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    background: 'rgba(239, 68, 68, 0.15)',
                                                    color: '#ef4444',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }} title="Phone Detected">
                                                    📱 {student.violations.phoneDetection}
                                                </span>
                                            )}
                                            {student.violations?.copyPaste > 0 && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    background: 'rgba(245, 158, 11, 0.15)',
                                                    color: '#f59e0b',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }} title="Copy/Paste">
                                                    📋 {student.violations.copyPaste}
                                                </span>
                                            )}
                                            {student.violations?.plagiarism > 0 && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    background: 'rgba(239, 68, 68, 0.15)',
                                                    color: '#ef4444',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '3px'
                                                }} title="Plagiarism">
                                                    <AlertTriangle size={10} /> {student.violations.plagiarism}
                                                </span>
                                            )}
                                            {!hasIssues && (
                                                <span style={{ color: '#10b981' }}>
                                                    <CheckCircle size={14} />
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ width: '100px', height: '6px', backgroundColor: 'var(--border-color)', borderRadius: '10px', margin: '0 auto', overflow: 'hidden' }}>
                                            <div style={{ width: `${Math.min(student.avgScore, 100)}%`, height: '100%', backgroundColor: hasIssues ? '#f59e0b' : (i === 0 ? '#fbbf24' : 'var(--primary)') }}></div>
                                        </div>
                                    </td>
                                    <td>
                                        <button
                                            onClick={() => setReportStudent({ id: student.studentId, name: student.name })}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.4rem',
                                                padding: '0.5rem 0.85rem',
                                                background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                                border: 'none',
                                                borderRadius: '8px',
                                                color: 'white',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
                                            }}
                                            title="Generate comprehensive report"
                                        >
                                            <FileText size={14} />
                                            Report
                                        </button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Student Report Modal */}
            {reportStudent && (
                <StudentReportModal
                    studentId={reportStudent.id}
                    studentName={reportStudent.name}
                    onClose={() => setReportStudent(null)}
                    requestedBy={user?.name || 'Mentor'}
                    requestedByRole="mentor"
                />
            )}
        </div>
    )
}

// ==================== ALL SUBMISSIONS WITH AI EVALUATION ====================
function MentorFeedbackModal({ submission, mentorId, onClose }) {
    const [comment, setComment] = useState('')
    const [rating, setRating] = useState(0)
    const [submitting, setSubmitting] = useState(false)
    const [existingFeedback, setExistingFeedback] = useState([])
    const [loadingFeedback, setLoadingFeedback] = useState(true)

    useEffect(() => {
        axios.get(`${API_BASE}/submissions/${submission.id}/feedback`)
            .then(r => setExistingFeedback(r.data?.feedback || []))
            .catch(() => {})
            .finally(() => setLoadingFeedback(false))
    }, [submission.id])

    const handleSubmit = async () => {
        if (!comment.trim()) return
        setSubmitting(true)
        try {
            await axios.post(`${API_BASE}/submissions/${submission.id}/feedback`, { mentor_id: mentorId, comment: comment.trim(), rating: rating || null })
            const r = await axios.get(`${API_BASE}/submissions/${submission.id}/feedback`)
            setExistingFeedback(r.data?.feedback || [])
            setComment('')
            setRating(0)
        } catch (e) {
            alert(e.response?.data?.detail || 'Failed to save feedback')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <div className="modal-header">
                    <div className="modal-title-with-icon">
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <MessageSquare size={20} color="white" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Feedback</h2>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{submission.studentName} — {submission.itemTitle || submission.testTitle}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="modal-close"><X size={20} /></button>
                </div>
                <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                    {!loadingFeedback && existingFeedback.length > 0 && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <p style={{ margin: '0 0 0.75rem', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-muted)' }}>Previous Feedback</p>
                            {existingFeedback.map(fb => (
                                <div key={fb.id} style={{ padding: '0.85rem 1rem', background: 'rgba(139,92,246,0.07)', borderRadius: 10, border: '1px solid rgba(139,92,246,0.15)', marginBottom: '0.6rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{fb.mentor_name || 'Mentor'}</span>
                                        <div style={{ display: 'flex', gap: 2 }}>
                                            {fb.rating && [...Array(5)].map((_, i) => <Star key={i} size={12} fill={i < fb.rating ? '#f59e0b' : 'none'} color={i < fb.rating ? '#f59e0b' : 'rgba(255,255,255,0.2)'} />)}
                                        </div>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'rgba(255,255,255,0.75)' }}>{fb.comment}</p>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'block' }}>{new Date(fb.created_at).toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div>
                        <p style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.875rem' }}>Add Feedback</p>
                        <div style={{ display: 'flex', gap: 6, marginBottom: '0.75rem' }}>
                            {[1,2,3,4,5].map(n => (
                                <button key={n} type="button" onClick={() => setRating(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                                    <Star size={20} fill={n <= rating ? '#f59e0b' : 'none'} color={n <= rating ? '#f59e0b' : 'rgba(255,255,255,0.2)'} />
                                </button>
                            ))}
                            {rating > 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center' }}>{rating}/5</span>}
                        </div>
                        <textarea
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            placeholder="Write your feedback or comments for the student..."
                            rows={4}
                            style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, color: 'white', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.875rem', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
                            <button onClick={onClose} style={{ padding: '0.6rem 1.25rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.6)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleSubmit} disabled={!comment.trim() || submitting} style={{ padding: '0.6rem 1.5rem', background: comment.trim() ? 'linear-gradient(135deg,#8b5cf6,#6366f1)' : 'rgba(139,92,246,0.2)', border: 'none', borderRadius: 8, color: comment.trim() ? 'white' : 'rgba(255,255,255,0.3)', fontWeight: 700, cursor: comment.trim() ? 'pointer' : 'not-allowed' }}>
                                {submitting ? 'Saving...' : 'Submit Feedback'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function EscalateModal({ submission, mentorId, onClose }) {
    const [reason, setReason] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [done, setDone] = useState(false)

    const handleEscalate = async () => {
        setSubmitting(true)
        try {
            await axios.post(`${API_BASE}/submissions/${submission.id}/escalate`, { mentor_id: mentorId, reason: reason.trim() })
            setDone(true)
        } catch (e) {
            alert(e.response?.data?.detail || 'Failed to escalate')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                <div className="modal-header">
                    <div className="modal-title-with-icon">
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#ef4444,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Flag size={20} color="white" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Escalate to Admin</h2>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{submission.studentName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="modal-close"><X size={20} /></button>
                </div>
                <div className="modal-body">
                    {done ? (
                        <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                            <CheckCircle size={48} color="#10b981" style={{ marginBottom: '1rem' }} />
                            <p style={{ fontWeight: 700, margin: '0 0 0.5rem' }}>Escalated Successfully</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>An admin will be notified to review this submission.</p>
                            <button onClick={onClose} style={{ marginTop: '1rem', padding: '0.6rem 1.5rem', background: 'linear-gradient(135deg,#10b981,#06b6d4)', border: 'none', borderRadius: 8, color: 'white', fontWeight: 700, cursor: 'pointer' }}>Done</button>
                        </div>
                    ) : (
                        <>
                            <p style={{ margin: '0 0 1rem', color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>Flag this submission for admin review. Provide a reason to help the admin prioritize.</p>
                            <textarea
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                placeholder="Reason for escalation (e.g. plagiarism concern, unusual score drop, integrity violation...)"
                                rows={4}
                                style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, color: 'white', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.875rem', boxSizing: 'border-box' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                                <button onClick={onClose} style={{ padding: '0.6rem 1.25rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.6)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                <button onClick={handleEscalate} disabled={submitting} style={{ padding: '0.6rem 1.5rem', background: 'linear-gradient(135deg,#ef4444,#f97316)', border: 'none', borderRadius: 8, color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                                    {submitting ? 'Escalating...' : 'Flag for Admin'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

function AllSubmissions({ user }) {
    const [submissions, setSubmissions] = useState([])
    const [aptitudeSubmissions, setAptitudeSubmissions] = useState([])
    const [globalSubmissions, setGlobalSubmissions] = useState([])
    const [loading, setLoading] = useState(true)
    const [viewReport, setViewReport] = useState(null)
    const [activeTab, setActiveTab] = useState('all')
    const [viewAptitudeResult, setViewAptitudeResult] = useState(null)
    const [viewGlobalReport, setViewGlobalReport] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [feedbackModal, setFeedbackModal] = useState(null)
    const [escalateModal, setEscalateModal] = useState(null)

    const fetchSubmissions = () => {
        Promise.all([
            axios.get(`${API_BASE}/submissions?mentorId=${user.id}`),
            axios.get(`${API_BASE}/aptitude-submissions?mentorId=${user.id}`),
            axios.get(`${API_BASE}/global-test-submissions?mentorId=${user.id}`)
        ]).then(([codeRes, aptRes, globalRes]) => {
            const codeData = Array.isArray(codeRes.data) ? codeRes.data : (codeRes.data?.data || [])
            setSubmissions(codeData.map(s => ({ ...s, subType: 'code' })))
            setAptitudeSubmissions((aptRes.data || []).map(s => ({ ...s, subType: 'aptitude', itemTitle: s.testTitle })))
            setGlobalSubmissions((globalRes.data || []).map(s => ({
                ...s,
                subType: 'global',
                itemTitle: s.testTitle,
                score: s.overallPercentage
            })))
            setLoading(false)
        }).catch(err => setLoading(false))
    }

    useEffect(() => {
        fetchSubmissions()
    }, [user.id])

    const allSubmissions = [...submissions, ...aptitudeSubmissions, ...globalSubmissions]
        .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))

    const getFilteredSubmissions = () => {
        let filtered = activeTab === 'all'
            ? allSubmissions
            : activeTab === 'code'
                ? submissions
                : activeTab === 'aptitude'
                    ? aptitudeSubmissions
                    : globalSubmissions

        return filtered.filter(s =>
            (s.studentName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.itemTitle || s.testTitle || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.status.toLowerCase().includes(searchTerm.toLowerCase())
        )
    }

    const filteredSubmissions = getFilteredSubmissions()

    if (loading) return <div className="page-loading"><div className="loading-spinner" /></div>

    return (
        <>
            {/* Header with Search */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => setActiveTab('all')}
                        style={{
                            padding: '0.6rem 1.2rem',
                            background: activeTab === 'all' ? 'var(--primary)' : 'rgba(59, 130, 246, 0.1)',
                            border: activeTab === 'all' ? 'none' : '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: activeTab === 'all' ? 'white' : 'var(--text-muted)',
                            cursor: 'pointer',
                            fontWeight: 500
                        }}
                    >All ({allSubmissions.length})</button>
                    <button
                        onClick={() => setActiveTab('code')}
                        style={{
                            padding: '0.6rem 1.2rem',
                            background: activeTab === 'code' ? 'var(--primary)' : 'rgba(59, 130, 246, 0.1)',
                            border: activeTab === 'code' ? 'none' : '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: activeTab === 'code' ? 'white' : 'var(--text-muted)',
                            cursor: 'pointer',
                            fontWeight: 500
                        }}
                    >💻 Code ({submissions.length})</button>
                    <button
                        onClick={() => setActiveTab('aptitude')}
                        style={{
                            padding: '0.6rem 1.2rem',
                            background: activeTab === 'aptitude' ? '#8b5cf6' : 'rgba(139, 92, 246, 0.1)',
                            border: activeTab === 'aptitude' ? 'none' : '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: activeTab === 'aptitude' ? 'white' : 'var(--text-muted)',
                            cursor: 'pointer',
                            fontWeight: 500
                        }}
                    >📝 Aptitude ({aptitudeSubmissions.length})</button>
                    <button
                        onClick={() => setActiveTab('global')}
                        style={{
                            padding: '0.6rem 1.2rem',
                            background: activeTab === 'global' ? '#3b82f6' : 'rgba(59, 130, 246, 0.1)',
                            border: activeTab === 'global' ? 'none' : '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: activeTab === 'global' ? 'white' : 'var(--text-muted)',
                            cursor: 'pointer',
                            fontWeight: 500
                        }}
                    >🌐 Global ({globalSubmissions.length})</button>
                </div>
                <div style={{ position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Search student, problem or status..."
                        style={{ padding: '0.6rem 1rem 0.6rem 2.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'white', width: '280px' }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="table-container card glass">
                <table>
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Type</th>
                            <th>Problem / Test</th>
                            <th>Language</th>
                            <th>Score</th>
                            <th>Status</th>
                            <th>Submitted At</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSubmissions.length === 0 ? (
                            <tr><td colSpan="8" style={{ textAlign: 'center', padding: '3rem' }}>No submissions found</td></tr>
                        ) : filteredSubmissions.map(sub => (
                            <tr key={sub.id}>
                                <td><div style={{ fontWeight: 600 }}>{sub.studentName}</div></td>
                                <td>
                                    <span style={{
                                        fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px',
                                        background: sub.subType === 'aptitude' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                        color: sub.subType === 'aptitude' ? '#8b5cf6' : '#3b82f6'
                                    }}>
                                        {sub.subType === 'aptitude' ? '📝 Aptitude' : sub.subType === 'global' ? '🌐 Global' : '💻 Code'}
                                    </span>
                                </td>
                                <td><div style={{ color: 'var(--primary)', fontWeight: 500 }}>{sub.itemTitle || sub.testTitle}</div></td>
                                <td>
                                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)' }}>
                                        {sub.subType === 'aptitude' ? 'N/A' : sub.subType === 'global' ? 'Mixed' : (sub.language?.toUpperCase() || 'N/A')}
                                    </span>
                                </td>
                                <td style={{ fontWeight: 700, fontSize: '1.1rem' }}>{sub.score}%</td>
                                <td>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
                                        <span className={`status-badge ${sub.status}`}>{sub.status}</span>
                                        {sub.plagiarism?.detected && (
                                            <span className="status-badge plagiarized" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <AlertTriangle size={11} /> Plag
                                            </span>
                                        )}
                                        {(sub.integrity?.integrityViolation || sub.tabSwitches > 0) && (
                                            <span style={{
                                                fontSize: '0.65rem',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                background: 'rgba(245, 158, 11, 0.15)',
                                                color: '#f59e0b',
                                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '3px'
                                            }}>
                                                <AlertTriangle size={10} /> {sub.integrity?.tabSwitches || sub.tabSwitches || 0} Tab
                                            </span>
                                        )}
                                        {sub.cameraBlockedCount > 0 && (
                                            <span style={{
                                                fontSize: '0.65rem',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                background: 'rgba(239, 68, 68, 0.15)',
                                                color: '#ef4444',
                                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '3px'
                                            }}>
                                                📷 {sub.cameraBlockedCount} Cam
                                            </span>
                                        )}
                                        {sub.phoneDetectionCount > 0 && (
                                            <span style={{
                                                fontSize: '0.65rem',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                background: 'rgba(239, 68, 68, 0.15)',
                                                color: '#ef4444',
                                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '3px'
                                            }}>
                                                📱 {sub.phoneDetectionCount} Phone
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(sub.submittedAt).toLocaleString()}</td>
                                <td>
                                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                        {sub.subType === 'aptitude' ? (
                                            <button onClick={() => setViewAptitudeResult(sub)} style={{ background: 'rgba(139,92,246,0.1)', border: 'none', color: '#8b5cf6', padding: '0.4rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <Eye size={13} /> Results
                                            </button>
                                        ) : sub.subType === 'global' ? (
                                            <button onClick={() => setViewGlobalReport(sub.id)} style={{ background: 'rgba(59,130,246,0.1)', border: 'none', color: '#3b82f6', padding: '0.4rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <Eye size={13} /> Report
                                            </button>
                                        ) : (
                                            <button onClick={() => setViewReport(sub)} style={{ background: 'rgba(59,130,246,0.1)', border: 'none', color: '#3b82f6', padding: '0.4rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <Eye size={13} /> Report
                                            </button>
                                        )}
                                        <button onClick={() => setFeedbackModal(sub)} style={{ background: 'rgba(139,92,246,0.1)', border: 'none', color: '#a78bfa', padding: '0.4rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '3px' }} title="Add feedback">
                                            <MessageSquare size={13} /> Feedback
                                        </button>
                                        <button onClick={() => setEscalateModal(sub)} style={{ background: 'rgba(239,68,68,0.08)', border: 'none', color: '#f87171', padding: '0.4rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '3px' }} title="Flag for admin review">
                                            <Flag size={13} /> Escalate
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Report Modal */}
            {viewReport && (
                <SubmissionReportModal submission={viewReport} onClose={() => setViewReport(null)} />
            )}

            {/* Aptitude Results Modal */}
            {viewAptitudeResult && (
                <AptitudeReportModal submission={viewAptitudeResult} onClose={() => setViewAptitudeResult(null)} />
            )}

            {viewGlobalReport && (
                <GlobalReportModal
                    submissionId={viewGlobalReport}
                    onClose={() => setViewGlobalReport(null)}
                    isStudentView={false}
                />
            )}

            {feedbackModal && (
                <MentorFeedbackModal
                    submission={feedbackModal}
                    mentorId={user.id}
                    onClose={() => setFeedbackModal(null)}
                />
            )}

            {escalateModal && (
                <EscalateModal
                    submission={escalateModal}
                    mentorId={user.id}
                    onClose={() => setEscalateModal(null)}
                />
            )}

        </>
    )
}

// ==================== SUBMISSION REPORT MODAL FOR MENTOR ====================
function SubmissionReportModal({ submission, onClose }) {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px' }}>
                <div className="modal-header">
                    <div className="modal-title-with-icon">
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '10px',
                            background: submission.status === 'accepted' ? 'linear-gradient(135deg, #10b981, #06b6d4)' : 'linear-gradient(135deg, #ef4444, #f59e0b)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <FileText size={20} color="white" />
                        </div>
                        <h2>Detailed Submission Report</h2>
                    </div>
                    <button onClick={onClose} className="modal-close"><X size={20} /></button>
                </div>
                <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                    {/* Student & Submission Info */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '1rem',
                        marginBottom: '2rem',
                        padding: '1.5rem',
                        background: 'rgba(59, 130, 246, 0.05)',
                        borderRadius: '1rem',
                        border: '1px solid rgba(59, 130, 246, 0.1)'
                    }}>
                        <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Student Name</span>
                            <p style={{ margin: '0.25rem 0 0', fontWeight: 600, fontSize: '1.1rem' }}>{submission.studentName}</p>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Submitted At</span>
                            <p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>{new Date(submission.submittedAt).toLocaleString()}</p>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Language</span>
                            <p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>{submission.language}</p>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Submission Type</span>
                            <p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>{submission.submissionType === 'file' ? 'File Upload' : 'Code Editor'}</p>
                        </div>
                    </div>

                    {/* Score & Status */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '3rem',
                        marginBottom: '2rem',
                        padding: '2rem',
                        background: submission.status === 'accepted' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                        borderRadius: '1rem',
                        border: `1px solid ${submission.status === 'accepted' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '3rem', fontWeight: 800, color: submission.status === 'accepted' ? '#10b981' : '#ef4444' }}>
                                {submission.score}
                            </div>
                            <div style={{ color: 'var(--text-muted)' }}>AI Evaluation Score</div>
                        </div>
                        <div style={{
                            padding: '1rem 2rem',
                            borderRadius: '1rem',
                            background: submission.status === 'accepted' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: submission.status === 'accepted' ? '#10b981' : '#ef4444',
                            fontWeight: 700,
                            fontSize: '1.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            {submission.status === 'accepted' ? <CheckCircle size={24} /> : <X size={24} />}
                            {submission.status?.toUpperCase()}
                        </div>
                    </div>

                    {/* Plagiarism Warning */}
                    {submission.plagiarism?.detected && (
                        <div className="plagiarism-banner" style={{ marginBottom: '1.5rem' }}>
                            <AlertTriangle size={24} color="#ef4444" />
                            <div>
                                <strong style={{ color: '#ef4444' }}>Plagiarism Detected</strong>
                                <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)' }}>
                                    This code matches a submission from {submission.plagiarism.copiedFromName}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Proctoring Violations Section */}
                    {(submission.tabSwitches > 0 || submission.copyPasteAttempts > 0 || submission.cameraBlockedCount > 0 || submission.phoneDetectionCount > 0) && (
                        <div style={{ marginBottom: '1.5rem', padding: '1.5rem', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '1rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                            <h4 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
                                <AlertTriangle size={18} /> Proctoring Violations
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                                {submission.tabSwitches > 0 && (
                                    <div style={{ padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <Eye size={18} color="#f59e0b" />
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#f59e0b' }}>{submission.tabSwitches} Tab Switches</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Penalty: -{Math.min(submission.tabSwitches * 5, 25)} pts</div>
                                        </div>
                                    </div>
                                )}
                                {submission.copyPasteAttempts > 0 && (
                                    <div style={{ padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '1.1rem' }}>📋</span>
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#f59e0b' }}>{submission.copyPasteAttempts} Copy/Paste</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Penalty: -{Math.min(submission.copyPasteAttempts * 3, 15)} pts</div>
                                        </div>
                                    </div>
                                )}
                                {submission.cameraBlockedCount > 0 && (
                                    <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '1.1rem' }}>📷</span>
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#ef4444' }}>{submission.cameraBlockedCount} Camera Blocked</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Penalty: -{Math.min(submission.cameraBlockedCount * 10, 30)} pts</div>
                                        </div>
                                    </div>
                                )}
                                {submission.phoneDetectionCount > 0 && (
                                    <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '1.1rem' }}>📱</span>
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#ef4444' }}>{submission.phoneDetectionCount} Phone Detected</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Penalty: -{Math.min(submission.phoneDetectionCount * 15, 45)} pts</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {submission.proctoringVideo && (
                                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '1rem' }}>🎥</span>
                                    <span style={{ fontSize: '0.85rem', color: '#3b82f6' }}>Proctoring video recorded: {submission.proctoringVideo}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* AI Feedback */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h4 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <CheckCircle size={18} color="#3b82f6" /> AI Feedback
                        </h4>
                        <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', background: 'var(--bg-tertiary)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                            {submission.feedback || 'No feedback provided.'}
                        </p>
                    </div>

                    {/* AI Explanation - WHY THIS SCORE */}
                    {submission.aiExplanation && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Activity size={18} color="#8b5cf6" /> AI Explanation (Why this score?)
                            </h4>
                            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', background: 'rgba(139, 92, 246, 0.05)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(139, 92, 246, 0.1)' }}>
                                {submission.aiExplanation}
                            </p>
                        </div>
                    )}

                    {/* Detailed Analysis if available */}
                    {submission.analysis && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <BarChart2 size={18} color="var(--primary)" />
                                Detailed Analysis
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {submission.analysis.correctness !== undefined && (
                                    <div style={{ background: 'var(--bg-tertiary)', padding: '1rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <CheckCircle size={22} color="#3b82f6" />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Correctness</span>
                                            <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#3b82f6' }}>{submission.analysis.correctness}</p>
                                        </div>
                                    </div>
                                )}
                                {submission.analysis.efficiency !== undefined && (
                                    <div style={{ background: 'var(--bg-tertiary)', padding: '1rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Zap size={22} color="#10b981" />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Efficiency</span>
                                            <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#10b981' }}>{submission.analysis.efficiency}</p>
                                        </div>
                                    </div>
                                )}
                                {submission.analysis.codeStyle !== undefined && (
                                    <div style={{ background: 'var(--bg-tertiary)', padding: '1rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Code size={22} color="#8b5cf6" />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Code Style</span>
                                            <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#8b5cf6' }}>{submission.analysis.codeStyle}</p>
                                        </div>
                                    </div>
                                )}
                                {submission.analysis.bestPractices !== undefined && (
                                    <div style={{ background: 'var(--bg-tertiary)', padding: '1rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Award size={22} color="#f59e0b" />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Best Practices</span>
                                            <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#f59e0b' }}>{submission.analysis.bestPractices}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}


                    {/* Code Preview */}
                    <div>
                        <h4 style={{ margin: '0 0 0.75rem' }}>Submitted Code</h4>
                        <pre style={{
                            background: '#020617',
                            padding: '1.5rem',
                            borderRadius: '0.5rem',
                            overflow: 'auto',
                            maxHeight: '300px',
                            fontSize: '0.85rem',
                            fontFamily: 'monospace',
                            color: '#e2e8f0',
                            border: '1px solid #334155'
                        }}>
                            {submission.code}
                        </pre>
                    </div>

                    {/* Inline Code Feedback */}
                    <div style={{ marginTop: '1.5rem' }}>
                        <h4 style={{ margin: '0 0 0.75rem' }}>💬 Code Feedback</h4>
                        <InlineCodeFeedback
                            submissionId={submission.id}
                            code={submission.code}
                            mentorId={submission.mentorId}
                            studentId={submission.studentId}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

// ==================== FEATURES 39,40,41,42: MENTOR ANALYTICS ====================
function MentorAnalytics({ user }) {
    const { t } = useI18n()
    const [activeTab, setActiveTab] = useState('plagiarism')
    const [plagiarism, setPlagiarism] = useState(null)
    const [timeToSolve, setTimeToSolve] = useState(null)
    const [topicAnalysis, setTopicAnalysis] = useState(null)
    const [loading, setLoading] = useState(true)
    const [exporting, setExporting] = useState(false)

    useEffect(() => {
        setLoading(true)
        Promise.all([
            axios.get(`${API_BASE}/analytics/plagiarism?mentorId=${user.id}`),
            axios.get(`${API_BASE}/analytics/time-to-solve?mentorId=${user.id}`),
            axios.get(`${API_BASE}/analytics/topics?mentorId=${user.id}`)
        ]).then(([pRes, tRes, taRes]) => {
            setPlagiarism(pRes.data)
            setTimeToSolve(tRes.data)
            setTopicAnalysis(taRes.data)
            setLoading(false)
        }).catch(err => { console.error(err); setLoading(false) })
    }, [user.id])

    const handleExport = async (format) => {
        setExporting(true)
        try {
            if (format === 'csv') {
                const res = await axios.get(`${API_BASE}/analytics/export/csv?mentorId=${user.id}`, { responseType: 'blob' })
                const url = window.URL.createObjectURL(new Blob([res.data]))
                const a = document.createElement('a'); a.href = url; a.download = `analytics_${new Date().toISOString().split('T')[0]}.csv`; a.click()
            } else {
                const res = await axios.get(`${API_BASE}/analytics/export/json?mentorId=${user.id}`)
                const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = `analytics_${new Date().toISOString().split('T')[0]}.json`; a.click()
            }
        } catch (err) { console.error(err) }
        setExporting(false)
    }

    if (loading) return <div className="page-loading"><div className="loading-spinner" /></div>

    const tabs = [
        { id: 'plagiarism', label: t('plagiarism_detection'), icon: <Shield size={16} /> },
        { id: 'time-to-solve', label: t('time_to_solve'), icon: <Clock size={16} /> },
        { id: 'topics', label: t('topic_analysis'), icon: <BookOpen size={16} /> },
        { id: 'export', label: t('export_report'), icon: <Download size={16} /> }
    ]

    return (
        <div className="animate-fadeIn">
            {/* Tab Nav */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem',
                        borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                        background: activeTab === tab.id ? 'var(--primary)' : 'var(--card-bg)',
                        color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
                        boxShadow: activeTab === tab.id ? '0 4px 15px rgba(59,130,246,0.3)' : '0 1px 3px rgba(0,0,0,0.1)',
                        transition: 'all 0.2s'
                    }}>
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* PLAGIARISM TAB */}
            {activeTab === 'plagiarism' && plagiarism && (
                <div>
                    {/* Stats Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div className="dashboard-stat-card stat-card-blue">
                            <div className="stat-card-inner">
                                <div className="stat-icon-box" style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)' }}><ClipboardList size={22} color="#fff" /></div>
                                <div className="stat-content"><div className="stat-number">{plagiarism.stats.totalSubmissions}</div><div className="stat-label-text">{t('total_submissions')}</div></div>
                            </div>
                        </div>
                        <div className="dashboard-stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
                            <div className="stat-card-inner">
                                <div className="stat-icon-box" style={{ background: 'linear-gradient(135deg, #b91c1c, #ef4444)' }}><AlertTriangle size={22} color="#fff" /></div>
                                <div className="stat-content"><div className="stat-number" style={{ color: '#ef4444' }}>{plagiarism.stats.plagiarismCount}</div><div className="stat-label-text">{t('flagged')}</div></div>
                            </div>
                        </div>
                        <div className="dashboard-stat-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                            <div className="stat-card-inner">
                                <div className="stat-icon-box" style={{ background: 'linear-gradient(135deg, #b45309, #f59e0b)' }}><Target size={22} color="#fff" /></div>
                                <div className="stat-content"><div className="stat-number" style={{ color: '#f59e0b' }}>{plagiarism.stats.plagiarismRate}%</div><div className="stat-label-text">{t('plagiarism_rate')}</div></div>
                            </div>
                        </div>
                    </div>

                    {/* Repeat Offenders */}
                    {plagiarism.repeatOffenders.length > 0 && (
                        <div className="dashboard-panel" style={{ marginBottom: '1.5rem' }}>
                            <h3 className="panel-title" style={{ color: '#ef4444' }}><AlertTriangle size={18} /> {t('repeat_offenders')}</h3>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                {plagiarism.repeatOffenders.map((o, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '10px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{o.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('copied_from')}: {o.copiedFrom.join(', ') || 'Unknown'}</div>
                                        </div>
                                        <span style={{ background: '#ef4444', color: '#fff', padding: '0.25rem 0.75rem', borderRadius: '20px', fontWeight: 700, fontSize: '0.8rem' }}>{o.count}x</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Most Copied Problems */}
                    {plagiarism.byProblem.length > 0 && (
                        <div className="dashboard-panel" style={{ marginBottom: '1.5rem' }}>
                            <h3 className="panel-title"><FileCode size={18} color="#f59e0b" /> {t('most_copied_problems')}</h3>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                {plagiarism.byProblem.map((p, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-secondary)' }}>
                                        <div><div style={{ fontWeight: 600 }}>{p.title}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{p.difficulty}</div></div>
                                        <span style={{ fontWeight: 700, color: '#ef4444' }}>{p.flaggedCount} {t('flags')}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Flagged Submissions */}
                    <div className="dashboard-panel">
                        <h3 className="panel-title"><Shield size={18} color="#ef4444" /> {t('flagged_submissions')}</h3>
                        {plagiarism.flaggedSubmissions.length > 0 ? (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead><tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                        <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('student')}</th>
                                        <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('problem')}</th>
                                        <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('score')}</th>
                                        <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('copied_from')}</th>
                                        <th style={{ textAlign: 'right', padding: '0.6rem' }}>{t('date')}</th>
                                    </tr></thead>
                                    <tbody>
                                        {plagiarism.flaggedSubmissions.slice(0, 20).map((s, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '0.6rem', fontWeight: 600 }}>{s.studentName}</td>
                                                <td style={{ padding: '0.6rem' }}>{s.problemTitle}</td>
                                                <td style={{ padding: '0.6rem', textAlign: 'center' }}>{s.score}/100</td>
                                                <td style={{ padding: '0.6rem', color: '#ef4444' }}>{s.copiedFromName || s.copiedFrom}</td>
                                                <td style={{ padding: '0.6rem', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(s.submittedAt).toLocaleDateString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>{t('no_plagiarism_detected')}</div>}
                    </div>
                </div>
            )}

            {/* TIME TO SOLVE TAB */}
            {activeTab === 'time-to-solve' && timeToSolve && (
                <div>
                    {/* Difficulty Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        {timeToSolve.difficultySummary.map((d, i) => {
                            const colors = { easy: '#10b981', medium: '#f59e0b', hard: '#ef4444' }
                            const color = colors[d.difficulty] || '#3b82f6'
                            return (
                                <div key={i} style={{ padding: '1.25rem', borderRadius: '14px', background: 'var(--card-bg)', borderLeft: `4px solid ${color}`, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                                    <div style={{ fontWeight: 700, fontSize: '1rem', textTransform: 'capitalize', color, marginBottom: '0.75rem' }}>{d.difficulty}</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('avg_time')}</div><div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{d.avgTimeMinutes}m</div></div>
                                        <div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('avg_attempts')}</div><div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{d.avgAttempts}</div></div>
                                        <div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('solve_rate')}</div><div style={{ fontSize: '1.3rem', fontWeight: 800, color }}>{d.avgSolveRate}%</div></div>
                                        <div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('problems')}</div><div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{d.problems}</div></div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Problem Details */}
                    <div className="dashboard-panel">
                        <h3 className="panel-title"><Clock size={18} color="#3b82f6" /> {t('problem_difficulty_metrics')}</h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead><tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                    <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('problem')}</th>
                                    <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('difficulty')}</th>
                                    <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('students')}</th>
                                    <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('avg_attempts')}</th>
                                    <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('avg_time')}</th>
                                    <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('solve_rate')}</th>
                                </tr></thead>
                                <tbody>
                                    {timeToSolve.problems.slice(0, 30).map((p, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={{ padding: '0.6rem', fontWeight: 600 }}>{p.title}</td>
                                            <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                                                <span style={{ padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600, background: p.difficulty === 'easy' ? 'rgba(16,185,129,0.12)' : p.difficulty === 'medium' ? 'rgba(251,191,36,0.12)' : 'rgba(239,68,68,0.12)', color: p.difficulty === 'easy' ? '#10b981' : p.difficulty === 'medium' ? '#f59e0b' : '#ef4444' }}>{p.difficulty}</span>
                                            </td>
                                            <td style={{ padding: '0.6rem', textAlign: 'center' }}>{p.studentCount}</td>
                                            <td style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 600 }}>{p.avgAttempts}</td>
                                            <td style={{ padding: '0.6rem', textAlign: 'center' }}>{p.avgTimeMinutes ? `${p.avgTimeMinutes}m` : '-'}</td>
                                            <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                                                <span style={{ fontWeight: 700, color: p.solveRate >= 70 ? '#10b981' : p.solveRate >= 40 ? '#f59e0b' : '#ef4444' }}>{p.solveRate}%</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TOPIC ANALYSIS TAB */}
            {activeTab === 'topics' && topicAnalysis && (
                <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        {/* By Type */}
                        <div className="dashboard-panel">
                            <h3 className="panel-title"><BookOpen size={18} color="#3b82f6" /> {t('by_problem_type')}</h3>
                            {topicAnalysis.byType.map((item, i) => (
                                <div key={i} style={{ marginBottom: '1rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{item.type}</span>
                                        <span style={{ fontWeight: 700, color: item.avgScore >= 70 ? '#10b981' : '#f59e0b' }}>{item.avgScore}% avg</span>
                                    </div>
                                    <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${item.passRate}%`, borderRadius: '4px', background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', transition: 'width 0.5s' }} />
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{item.submissions} submissions • {item.passRate}% pass • {item.uniqueStudents} students</div>
                                </div>
                            ))}
                        </div>

                        {/* By Difficulty */}
                        <div className="dashboard-panel">
                            <h3 className="panel-title"><Target size={18} color="#f59e0b" /> {t('by_difficulty')}</h3>
                            {topicAnalysis.byDifficulty.map((item, i) => {
                                const colors = { easy: '#10b981', medium: '#f59e0b', hard: '#ef4444' }
                                return (
                                    <div key={i} style={{ marginBottom: '1rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span style={{ fontWeight: 600, textTransform: 'capitalize', color: colors[item.difficulty] }}>{item.difficulty}</span>
                                            <span style={{ fontWeight: 700 }}>{item.avgScore}%</span>
                                        </div>
                                        <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${item.passRate}%`, borderRadius: '4px', background: colors[item.difficulty], transition: 'width 0.5s' }} />
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{item.submissions} submissions • {item.passRate}% pass</div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* By Language */}
                    <div className="dashboard-panel" style={{ marginBottom: '1.5rem' }}>
                        <h3 className="panel-title"><Code size={18} color="#8b5cf6" /> {t('performance_by_language')}</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                            {topicAnalysis.byLanguage.map((lang, i) => (
                                <div key={i} style={{ padding: '1rem', borderRadius: '12px', background: 'var(--bg-secondary)', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{lang.language}</div>
                                    <div style={{ fontSize: '2rem', fontWeight: 800, color: lang.avgScore >= 70 ? '#10b981' : lang.avgScore >= 40 ? '#f59e0b' : '#ef4444' }}>{lang.avgScore}%</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{lang.submissions} subs • {lang.passRate}% pass</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Heatmap */}
                    {topicAnalysis.heatmap.length > 0 && (
                        <div className="dashboard-panel">
                            <h3 className="panel-title"><BarChart2 size={18} color="#06b6d4" /> {t('type_difficulty_heatmap')}</h3>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead><tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                        <th style={{ padding: '0.6rem', textAlign: 'left' }}>{t('type')}</th>
                                        <th style={{ padding: '0.6rem', textAlign: 'center' }}>{t('difficulty')}</th>
                                        <th style={{ padding: '0.6rem', textAlign: 'center' }}>{t('submissions')}</th>
                                        <th style={{ padding: '0.6rem', textAlign: 'center' }}>{t('avg_score')}</th>
                                        <th style={{ padding: '0.6rem', textAlign: 'center' }}>{t('pass_rate')}</th>
                                    </tr></thead>
                                    <tbody>
                                        {topicAnalysis.heatmap.map((h, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '0.6rem', fontWeight: 600, textTransform: 'capitalize' }}>{h.type}</td>
                                                <td style={{ padding: '0.6rem', textAlign: 'center', textTransform: 'capitalize' }}>{h.difficulty}</td>
                                                <td style={{ padding: '0.6rem', textAlign: 'center' }}>{h.submissions}</td>
                                                <td style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 700, color: h.avgScore >= 70 ? '#10b981' : h.avgScore >= 40 ? '#f59e0b' : '#ef4444' }}>{h.avgScore}%</td>
                                                <td style={{ padding: '0.6rem', textAlign: 'center' }}>{h.passRate}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* EXPORT TAB */}
            {activeTab === 'export' && (
                <div>
                    <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                        <Download size={48} color="var(--primary)" style={{ marginBottom: '1rem' }} />
                        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.3rem' }}>{t('export_analytics')}</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', maxWidth: '500px', margin: '0 auto 2rem' }}>{t('export_description')}</p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button onClick={() => handleExport('csv')} disabled={exporting} style={{
                                padding: '0.75rem 2rem', borderRadius: '12px', border: 'none', cursor: 'pointer',
                                background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 700, fontSize: '0.9rem',
                                opacity: exporting ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}>
                                <FileText size={18} /> {t('download_csv')}
                            </button>
                            <button onClick={() => handleExport('json')} disabled={exporting} style={{
                                padding: '0.75rem 2rem', borderRadius: '12px', border: 'none', cursor: 'pointer',
                                background: 'linear-gradient(135deg, #1e40af, #3b82f6)', color: '#fff', fontWeight: 700, fontSize: '0.9rem',
                                opacity: exporting ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}>
                                <Code size={18} /> {t('download_json')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default MentorPortal
