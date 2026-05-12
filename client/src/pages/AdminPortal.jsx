import { useState, useEffect, useRef } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, Trophy, Award, List, Search, Send, Activity, CheckCircle, Check, TrendingUp, Clock, Globe, FileCode, Plus, X, Code, ChevronRight, Upload, AlertTriangle, Zap, Target, Sparkles, Bot, Wand2, Eye, FileText, BarChart2, RefreshCw, Calendar, HelpCircle, Trash2, Save, Brain, XCircle, Shield, Download, ClipboardList, Settings, Database, Mail, MessageSquare, Github, ExternalLink, BarChart3 } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts'
import DashboardLayout from '../components/DashboardLayout'
import { AIChatbot, AIFloatingButton } from '../components/AIChatbot'
import AptitudeReportModal from '../components/AptitudeReportModal'
import StudentReportModal from '../components/StudentReportModal'
import TestCasesManager from '../components/TestCasesManager'
import LocalTestCasesManager from '../components/LocalTestCasesManager'
import AdminLiveMonitoring from '../components/AdminLiveMonitoring'
import AdminOperations from '../components/AdminOperations'
import UserManagement from '../components/UserManagement'

import FileUpload from '../components/FileUpload'
import SkillTestManager from '../components/SkillTestManager'
import CommTestManager from '../components/CommTestManager'
import ProctorAgentDashboard from '../components/ProctorAgentDashboard'
import BehaviorAnalysisDashboard from '../components/BehaviorAnalysisDashboard'
import SkillSubmissions from '../components/SkillSubmissions'
import { useAuth } from '../App'
import { useI18n } from '../services/i18n.jsx'
import axios from 'axios'
import GlobalReportModal from '../components/GlobalReportModal'
import './Portal.css'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api'

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b']
const ADMIN_ID = 'admin-001'


function AdminPortal() {
    const { user } = useAuth()
    const { t } = useI18n()
    const location = useLocation()
    const [title, setTitle] = useState('')
    const [subtitle, setSubtitle] = useState('')


    useEffect(() => {
        const path = location.pathname.split('/').pop()
        switch (path) {
            case 'allocations':
                setTitle(t('allocations'))
                setSubtitle(t('mentor_student_assignments'))
                break
            case 'student-leaderboard':
                setTitle(t('student_leaderboard'))
                setSubtitle(t('top_performers'))
                break
            case 'mentor-leaderboard':
                setTitle(t('mentor_leaderboard'))
                setSubtitle(t('mentor_activity'))
                break
            case 'all-submissions':
                setTitle(t('all_submissions'))
                setSubtitle(t('platform_wide_submissions'))
                break

            case 'global-problems':
                setTitle(t('global_problems'))
                setSubtitle(t('coding_challenges_all'))
                break
            case 'aptitude-tests':
                setTitle(t('aptitude_tests'))
                setSubtitle(t('manage_aptitude_tests'))
                break
            case 'global-tests':
                setTitle(t('global_complete_tests'))
                setSubtitle(t('global_tests_subtitle'))
                break
            case 'live-monitoring':
                setTitle(t('global_live_monitoring'))
                setSubtitle(t('monitor_all_subtitle'))
                break
            case 'operations':
                setTitle(t('admin_operations'))
                setSubtitle(t('admin_ops_subtitle'))
                break
            case 'user-management':
                setTitle('User Management')
                setSubtitle('Create, edit, and manage platform users')
                break

            case 'analytics':
                setTitle(t('analytics'))
                setSubtitle(t('advanced_analytics_subtitle'))
                break
            case 'skill-tests':
                setTitle('Skill Tests')
                setSubtitle('Create and manage AI skill assessments')
                break
            case 'communication-tests':
                setTitle('Communication Tests')
                setSubtitle('Create and manage AI communication assessments')
                break
            case 'skill-submissions':
                setTitle('Skill Test Submissions')
                setSubtitle('View all student skill test results')
                break
            case 'proctor-agent':
                setTitle('Proctoring Intelligence Agent')
                setSubtitle('AI-powered fraud detection & exam integrity')
                break
            case 'behavior-analysis':
                setTitle('Behavior Analysis Agent')
                setSubtitle('AI-powered behavioral profiling & trust scoring')
                break
            default:
                setTitle(t('dashboard'))
                setSubtitle(t('system_administration'))
        }
    }, [location, t])

    const navItems = [
        { path: '/admin', label: t('dashboard'), icon: <LayoutDashboard size={20} /> },
        {
            label: 'Content Management',
            icon: <FileCode size={20} />,
            defaultExpanded: false,
            children: [
                { path: '/admin/aptitude-tests', label: t('aptitude_tests'), icon: <Target size={20} /> },
                { path: '/admin/global-tests', label: t('global_complete_tests'), icon: <ClipboardList size={20} /> },
                { path: '/admin/skill-tests', label: 'Skill Tests', icon: <Brain size={20} /> },
                { path: '/admin/communication-tests', label: 'Communication Tests', icon: <MessageSquare size={20} /> }
            ]
        },

        {
            label: 'Monitoring',
            icon: <Activity size={20} />,
            defaultExpanded: false,
            children: [
                { path: '/admin/all-submissions', label: t('all_submissions'), icon: <List size={20} /> },
                { path: '/admin/skill-submissions', label: 'Skill Submissions', icon: <Brain size={20} /> },
                { path: '/admin/live-monitoring', label: t('live_monitoring'), icon: <Activity size={20} /> },
                { path: '/admin/proctor-agent', label: 'Proctoring Agent', icon: <Shield size={20} /> },
                { path: '/admin/behavior-analysis', label: 'Behavior Analysis', icon: <Shield size={20} /> },
                { path: '/admin/analytics', label: t('analytics'), icon: <TrendingUp size={20} /> }
            ]
        },
        {
            label: 'System',
            icon: <Settings size={20} />,
            defaultExpanded: false,
            children: [
                { path: '/admin/user-management', label: 'User Management', icon: <Shield size={20} /> },
            ]
        }
    ]

    return (
        <DashboardLayout navItems={navItems} title={title} subtitle={subtitle}>
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/global-problems" element={<GlobalProblems />} />
                <Route path="/aptitude-tests" element={<AptitudeTestsAdmin />} />
                <Route path="/global-tests" element={<GlobalTestsAdmin />} />
                <Route path="/skill-tests" element={<SkillTestManager />} />
                <Route path="/communication-tests" element={<CommTestManager />} />
                <Route path="/skill-submissions" element={<SkillSubmissions user={user} isAdmin={true} />} />
                <Route path="/student-leaderboard" element={<StudentLeaderboard />} />

                <Route path="/all-submissions" element={<AllSubmissions />} />
                <Route path="/live-monitoring" element={<AdminLiveMonitoring user={user} />} />
                <Route path="/analytics" element={<AdminAnalyticsDashboard />} />
                <Route path="/proctor-agent" element={<ProctorAgentDashboard />} />
                <Route path="/behavior-analysis" element={<BehaviorAnalysisDashboard />} />
                <Route path="/user-management" element={<UserManagement />} />
            </Routes>
        </DashboardLayout>
    )
}

function Dashboard() {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [selectedPeriod, setSelectedPeriod] = useState('7d')

    useEffect(() => {
        axios.get(`${API_BASE}/analytics/admin`)
            .then(res => {
                setStats(res.data)
                setLoading(false)
            })
            .catch(err => setLoading(false))
    }, [])

    if (loading) return <div className="loading-spinner"></div>
    if (!stats) return <div>Error loading stats</div>

    // Calculate additional metrics
    const avgSubmissionsPerStudent = stats.totalStudents > 0
        ? Math.round(stats.totalSubmissions / stats.totalStudents * 10) / 10
        : 0
    const totalMentors = stats.mentorCount || Math.ceil(stats.totalStudents / 15)
    const activeToday = stats.recentSubmissions?.length || 0

    return (
        <div className="animate-fadeIn">
            {/* Welcome Header */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 50%, rgba(6, 182, 212, 0.05) 100%)',
                borderRadius: '20px',
                padding: '2rem 2.5rem',
                marginBottom: '2rem',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{
                    position: 'absolute',
                    top: '-50%',
                    right: '-10%',
                    width: '400px',
                    height: '400px',
                    background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
                    pointerEvents: 'none'
                }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '14px',
                            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 8px 24px rgba(59, 130, 246, 0.3)'
                        }}>
                            <Shield size={24} color="white" />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, background: 'linear-gradient(135deg, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                Admin Control Center
                            </h1>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                Monitor performance, manage content, and track platform health
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Stats Grid - 6 Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: '1rem',
                marginBottom: '2rem'
            }}>
                {/* Total Students */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.3s ease'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: '80px',
                        height: '80px',
                        background: 'radial-gradient(circle at top right, rgba(59, 130, 246, 0.15), transparent 70%)'
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                        }}>
                            <Users size={22} color="white" />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>{stats.totalStudents}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Students</div>
                        </div>
                    </div>
                    <div style={{
                        marginTop: '1rem',
                        padding: '0.35rem 0.75rem',
                        background: 'rgba(16, 185, 129, 0.1)',
                        borderRadius: '20px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#10b981'
                    }}>
                        <TrendingUp size={12} /> +12% this month
                    </div>
                </div>

                {/* Total Mentors */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: '80px',
                        height: '80px',
                        background: 'radial-gradient(circle at top right, rgba(139, 92, 246, 0.15), transparent 70%)'
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #6d28d9, #8b5cf6)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                        }}>
                            <Award size={22} color="white" />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>{totalMentors}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Active Mentors</div>
                        </div>
                    </div>
                    <div style={{
                        marginTop: '1rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)'
                    }}>
                        ~{Math.round(stats.totalStudents / totalMentors)} students/mentor
                    </div>
                </div>

                {/* Submissions */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: '80px',
                        height: '80px',
                        background: 'radial-gradient(circle at top right, rgba(6, 182, 212, 0.15), transparent 70%)'
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #0891b2, #06b6d4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)'
                        }}>
                            <Send size={22} color="white" />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>{stats.totalSubmissions}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Submissions</div>
                        </div>
                    </div>
                    <div style={{
                        marginTop: '1rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)'
                    }}>
                        {avgSubmissionsPerStudent} avg per student
                    </div>
                </div>

                {/* Success Rate */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: '80px',
                        height: '80px',
                        background: 'radial-gradient(circle at top right, rgba(16, 185, 129, 0.15), transparent 70%)'
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #047857, #10b981)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                        }}>
                            <CheckCircle size={22} color="white" />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>{stats.successRate}%</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Success Rate</div>
                        </div>
                    </div>
                    <div style={{
                        marginTop: '1rem',
                        height: '6px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        borderRadius: '3px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            height: '100%',
                            width: `${stats.successRate}%`,
                            background: 'linear-gradient(90deg, #10b981, #06b6d4)',
                            borderRadius: '3px',
                            transition: 'width 1s ease'
                        }} />
                    </div>
                </div>

                {/* Total Content */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: '80px',
                        height: '80px',
                        background: 'radial-gradient(circle at top right, rgba(245, 158, 11, 0.15), transparent 70%)'
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
                        }}>
                            <FileCode size={22} color="white" />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>{stats.totalContent}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Content</div>
                        </div>
                    </div>
                    <div style={{
                        marginTop: '1rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)'
                    }}>
                        {/* Tasks, Problems & Tests */}
                        Problems & Tests
                    </div>
                </div>

                {/* Active Today */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '1.5rem',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: '80px',
                        height: '80px',
                        background: 'radial-gradient(circle at top right, rgba(236, 72, 153, 0.15), transparent 70%)'
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #be185d, #ec4899)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(236, 72, 153, 0.3)'
                        }}>
                            <Zap size={22} color="white" />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)' }}>{activeToday}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Active Today</div>
                        </div>
                    </div>
                    <div style={{
                        marginTop: '1rem',
                        padding: '0.35rem 0.75rem',
                        background: 'rgba(236, 72, 153, 0.1)',
                        borderRadius: '20px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#ec4899'
                    }}>
                        <Activity size={12} /> Live
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gap: '1.5rem',
                marginBottom: '2rem'
            }}>
                {/* Submission Trends Chart */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '20px',
                    padding: '1.5rem',
                    position: 'relative'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Submission Trends</h3>
                            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Platform activity over time</p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {['7d', '30d', '90d'].map(period => (
                                <button
                                    key={period}
                                    onClick={() => setSelectedPeriod(period)}
                                    style={{
                                        padding: '0.4rem 0.8rem',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        background: selectedPeriod === period ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'var(--bg-tertiary)',
                                        color: selectedPeriod === period ? 'white' : 'var(--text-muted)',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    {period}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div style={{ width: '100%', height: '280px' }}>
                        <ResponsiveContainer>
                            <AreaChart data={stats.submissionTrends}>
                                <defs>
                                    <linearGradient id="colorCountAdmin" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} axisLine={false} tickLine={false} />
                                <YAxis stroke="var(--text-muted)" fontSize={11} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '12px',
                                        boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
                                    }}
                                    labelStyle={{ color: 'var(--text)', fontWeight: 600 }}
                                    itemStyle={{ color: '#3b82f6' }}
                                />
                                <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorCountAdmin)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Language Distribution */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '20px',
                    padding: '1.5rem'
                }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Language Distribution</h3>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Code submissions by language</p>
                    </div>
                    <div style={{ width: '100%', height: '200px' }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={stats.languageStats}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={80}
                                    paddingAngle={4}
                                    dataKey="value"
                                >
                                    {stats.languageStats.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '8px'
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '0.75rem',
                        marginTop: '1rem'
                    }}>
                        {stats.languageStats.map((entry, index) => (
                            <div key={entry.name} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontSize: '0.8rem'
                            }}>
                                <div style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '3px',
                                    background: COLORS[index % COLORS.length]
                                }} />
                                <span style={{ color: 'var(--text-muted)' }}>{entry.name}</span>
                                <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{entry.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Section - Activity & Leaderboard */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr',
                gap: '1.5rem'
            }}>
                {/* Recent Activity */}
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '20px',
                    padding: '1.5rem',
                    maxHeight: '420px',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <Activity size={18} color="white" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Recent Activity</h3>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Live platform submissions</p>
                            </div>
                        </div>
                        <button style={{
                            padding: '0.5rem 1rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                        }}>
                            <RefreshCw size={12} /> Refresh
                        </button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {stats.recentSubmissions.map((sub, index) => (
                            <div key={sub.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                padding: '1rem',
                                background: 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                border: '1px solid var(--border-color)',
                                transition: 'all 0.2s ease'
                            }}>
                                <div style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: sub.status === 'accepted' ? '#10b981' : '#ef4444',
                                    boxShadow: `0 0 12px ${sub.status === 'accepted' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'}`
                                }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{sub.studentName}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                                        <Clock size={11} />
                                        {new Date(sub.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        <span style={{ opacity: 0.5 }}>•</span>
                                        <span>submitted a solution</span>
                                    </div>
                                </div>
                                <div style={{
                                    padding: '0.4rem 0.8rem',
                                    borderRadius: '8px',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    background: sub.status === 'accepted' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    color: sub.status === 'accepted' ? '#10b981' : '#ef4444'
                                }}>
                                    {sub.score}%
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Performers */}


                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '20px',
                    padding: '1.5rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Trophy size={18} color="white" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Top Performers</h3>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Leading students</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {stats.studentPerformance.slice(0, 5).map((student, i) => (
                            <div key={student.name} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                padding: '1rem',
                                background: i === 0 ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.05))' : 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                border: `1px solid ${i === 0 ? 'rgba(251, 191, 36, 0.3)' : 'var(--border-color)'}`
                            }}>
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    background: i === 0 ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : i === 1 ? 'linear-gradient(135deg, #94a3b8, #64748b)' : i === 2 ? 'linear-gradient(135deg, #d97706, #b45309)' : 'var(--bg-secondary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    color: i < 3 ? 'white' : 'var(--text-muted)'
                                }}>
                                    {i < 3 ? <Trophy size={14} /> : `#${i + 1}`}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{student.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{student.count} submissions</div>
                                </div>
                                <div style={{
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    color: student.score >= 80 ? '#10b981' : student.score >= 60 ? '#f59e0b' : '#ef4444'
                                }}>
                                    {student.score}%
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div >
        </div >
    )
}


function Allocations() {
    const [allocations, setAllocations] = useState([])
    const [loading, setLoading] = useState(true)
    const [expandedMentor, setExpandedMentor] = useState(null)

    useEffect(() => {
        axios.get(`${API_BASE}/allocations`)
            .then(res => {
                setAllocations(res.data)
                setLoading(false)
            })
            .catch(err => setLoading(false))
    }, [])

    if (loading) return <div className="loading-spinner"></div>

    return (
        <div className="animate-fadeIn">
            <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>Mentor Allocations</h2>
                <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Manage and view student-mentor assignments</p>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
                {allocations.map((alloc) => (
                    <div key={alloc.mentorId} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div
                            style={{
                                padding: '1.5rem 2rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                background: expandedMentor === alloc.mentorId ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                            }}
                            onClick={() => setExpandedMentor(expandedMentor === alloc.mentorId ? null : alloc.mentorId)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                                <div className="avatar-circle" style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
                                    {alloc.mentorName.charAt(0)}
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{alloc.mentorName}</h3>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{alloc.mentorEmail}</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{alloc.students.length}</span>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>Students</span>
                                </div>
                                <div style={{ transform: expandedMentor === alloc.mentorId ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }}>
                                    <Send size={18} style={{ transform: 'rotate(90deg)', color: 'var(--text-muted)' }} />
                                </div>
                            </div>
                        </div>

                        {expandedMentor === alloc.mentorId && (
                            <div style={{ padding: '0 2rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
                                <div className="table-container" style={{ marginTop: '1.5rem', background: 'var(--bg-tertiary)', borderRadius: '0.75rem' }}>
                                    <table style={{ margin: 0 }}>
                                        <thead>
                                            <tr>
                                                <th>Student Name</th>
                                                <th>Email</th>
                                                <th>Batch</th>
                                                <th>ID</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {alloc.students.map(student => (
                                                <tr key={student.id}>
                                                    <td>{student.name}</td>
                                                    <td>{student.email}</td>
                                                    <td>{student.batch}</td>
                                                    <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{student.id}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

function StudentLeaderboard() {
    const [leaders, setLeaders] = useState([])
    const [loading, setLoading] = useState(true)
    const [reportStudent, setReportStudent] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        axios.get(`${API_BASE}/leaderboard`)
            .then(res => {
                setLeaders(res.data)
                setLoading(false)
            })
            .catch(err => setLoading(false))
    }, [])

    if (loading) return <div className="loading-spinner"></div>

    const getRankIcon = (rank) => {
        if (rank === 1) return <Trophy size={24} style={{ color: '#fbbf24' }} />
        if (rank === 2) return <Award size={24} style={{ color: '#94a3b8' }} />
        if (rank === 3) return <Award size={24} style={{ color: '#b45309' }} />
        return <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>#{rank}</span>
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
        <div className="card animate-fadeIn" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <Trophy size={32} className="text-primary" />
                        <div>
                            <h2 style={{ margin: 0 }}>Global Performance Ranking</h2>
                            <p style={{ margin: 0, color: 'var(--text-muted)' }}>Real-time ranking of students across all mentors</p>
                        </div>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search students..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                padding: '0.75rem 1rem 0.75rem 2.75rem',
                                borderRadius: '12px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                width: '300px',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                </div>

                <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                    <table>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Student Name</th>
                                <th>Submissions</th>
                                <th>Avg. Score</th>
                                <th>Violations</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leaders.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).map((student, i) => {
                                const totalViolations = getTotalViolations(student)
                                const hasIssues = totalViolations > 0 || student.violations?.plagiarism > 0

                                return (
                                    <tr key={student.studentId}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {getRankIcon(i + 1)}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div className="avatar-circle">{student.name.charAt(0)}</div>
                                                <span>{student.name}</span>
                                            </div>
                                        </td>
                                        <td>{student.totalSubmissions}</td>
                                        <td>
                                            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{student.avgScore}%</span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                {student.violations?.tabSwitches > 0 && (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        background: 'rgba(245, 158, 11, 0.15)',
                                                        color: '#f59e0b',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }} title="Tab Switches">
                                                        <Eye size={10} /> {student.violations.tabSwitches}
                                                    </span>
                                                )}
                                                {student.violations?.cameraBlocked > 0 && (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        background: 'rgba(239, 68, 68, 0.15)',
                                                        color: '#ef4444',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }} title="Camera Blocked">
                                                        📷 {student.violations.cameraBlocked}
                                                    </span>
                                                )}
                                                {student.violations?.phoneDetection > 0 && (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        background: 'rgba(239, 68, 68, 0.15)',
                                                        color: '#ef4444',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }} title="Phone Detected">
                                                        📱 {student.violations.phoneDetection}
                                                    </span>
                                                )}
                                                {student.violations?.copyPaste > 0 && (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        background: 'rgba(245, 158, 11, 0.15)',
                                                        color: '#f59e0b',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }} title="Copy/Paste Attempts">
                                                        📋 {student.violations.copyPaste}
                                                    </span>
                                                )}
                                                {student.violations?.plagiarism > 0 && (
                                                    <span style={{
                                                        fontSize: '0.7rem',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        background: 'rgba(239, 68, 68, 0.15)',
                                                        color: '#ef4444',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }} title="Plagiarism">
                                                        <AlertTriangle size={10} /> {student.violations.plagiarism}
                                                    </span>
                                                )}
                                                {!hasIssues && (
                                                    <span style={{ fontSize: '0.75rem', color: '#10b981' }}>
                                                        <CheckCircle size={14} />
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ width: '100px', height: '8px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '10px', overflow: 'hidden' }}>
                                                <div style={{ width: `${student.avgScore}%`, height: '100%', background: hasIssues ? 'var(--warning)' : 'var(--primary)' }}></div>
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
            </div>

            {/* Student Report Modal */}
            {reportStudent && (
                <StudentReportModal
                    studentId={reportStudent.id}
                    studentName={reportStudent.name}
                    onClose={() => setReportStudent(null)}
                    requestedBy="Administrator"
                    requestedByRole="admin"
                />
            )}
        </div>
    )
}

function MentorLeaderboard() {
    const [leaders, setLeaders] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        axios.get(`${API_BASE}/mentor-leaderboard`)
            .then(res => {
                setLeaders(res.data)
                setLoading(false)
            })
            .catch(err => setLoading(false))
    }, [])

    if (loading) return <div className="loading-spinner"></div>

    return (
        <div className="card animate-fadeIn" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                    <Award size={32} style={{ color: '#8b5cf6' }} />
                    <div>
                        <h2 style={{ margin: 0 }}>Global Mentor Leaderboard</h2>
                        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Ranking mentors by student success and platform engagement</p>
                    </div>
                </div>

                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Mentor</th>
                                <th>Students</th>
                                <th>Content Created</th>
                                <th>Total Submissions</th>
                                <th>Avg. Student Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leaders.map((mentor) => (
                                <tr key={mentor.mentorId}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div className="avatar-circle" style={{ background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)' }}>
                                                {mentor.name.charAt(0)}
                                            </div>
                                            <span>{mentor.name}</span>
                                        </div>
                                    </td>
                                    <td>{mentor.studentCount}</td>
                                    <td>{mentor.totalContent} items</td>
                                    <td>{mentor.totalSubmissions}</td>
                                    <td>
                                        <span style={{ fontWeight: 700, color: '#8b5cf6' }}>{mentor.avgStudentScore}%</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function AllSubmissions() {
    const [submissions, setSubmissions] = useState([])

    const [aptitudeSubmissions, setAptitudeSubmissions] = useState([])
    const [globalSubmissions, setGlobalSubmissions] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [activeTab, setActiveTab] = useState('all')
    const [viewReport, setViewReport] = useState(null)

    const [viewAptitudeResult, setViewAptitudeResult] = useState(null)
    const [viewGlobalReport, setViewGlobalReport] = useState(null)
    const [resetting, setResetting] = useState(false)

    const fetchSubmissions = () => {
        setLoading(true)
        Promise.all([
            axios.get(`${API_BASE}/submissions`),
            axios.get(`${API_BASE}/aptitude-submissions`),
            axios.get(`${API_BASE}/global-test-submissions`)
        ]).then(([codeRes, aptRes, globalRes]) => {
            const codeData = Array.isArray(codeRes.data) ? codeRes.data : (codeRes.data?.data || [])
            const codeSubs = codeData.map(s => ({ ...s, subType: 'code' }))
            const aptSubs = (aptRes.data || []).map(s => ({
                ...s,
                subType: 'aptitude',
                itemTitle: s.testTitle,
                language: 'Aptitude'
            }))
            const globalSubs = (globalRes.data || []).map(s => ({
                ...s,
                subType: 'global',
                itemTitle: s.testTitle,
                language: 'Mixed',
                score: s.overallPercentage
            }))
            setSubmissions(codeSubs)
            setAptitudeSubmissions(aptSubs)
            setGlobalSubmissions(globalSubs)
            setLoading(false)
        }).catch(err => {
            console.error('Fetch error:', err)
            setLoading(false)
        })
    }

    useEffect(() => {
        fetchSubmissions()
    }, [])

    // Download CSV functionality
    const downloadCSV = () => {
        const dataToExport = getFilteredSubmissions()

        if (dataToExport.length === 0) {
            alert('No submissions to download')
            return
        }

        // CSV headers
        const headers = [
            'Student Name',
            'Student Email',
            'Type',
            'Problem/Test Title',
            'Language',
            'Score',
            'Status',
            'Tab Switches',
            'Camera Blocked',
            'Phone Detected',
            'Plagiarism Detected',
            'Submitted At'
        ]

        // Convert data to CSV rows
        const rows = dataToExport.map(sub => [
            sub.studentName || '',
            sub.studentEmail || '',
            sub.subType === 'aptitude' ? 'Aptitude' : sub.subType === 'global' ? 'Global' : 'Code',
            sub.itemTitle || sub.testTitle || '',
            sub.subType === 'aptitude' ? 'N/A' : sub.subType === 'global' ? 'Mixed' : (sub.language || 'N/A'),
            sub.score || 0,
            sub.status || '',
            sub.integrity?.tabSwitches || sub.tabSwitches || 0,
            sub.cameraBlockedCount || 0,
            sub.phoneDetectionCount || 0,
            sub.plagiarism?.detected ? 'Yes' : 'No',
            sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : ''
        ])

        // Create CSV content
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => {
                // Escape quotes and wrap in quotes if contains comma or quotes
                const cellStr = String(cell)
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                    return `"${cellStr.replace(/"/g, '""')}"`
                }
                return cellStr
            }).join(','))
        ].join('\n')

        // Create and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `submissions_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleResetAllSubmissions = async () => {
        const confirmReset = window.confirm(
            '⚠️ WARNING: This will permanently delete ALL submissions from ALL students!\n\n' +
            'This includes:\n' +
            '• All code submissions\n' +
            '• All aptitude test submissions\n' +
            '• All problem completions\n' +
            'This action CANNOT be undone. Are you sure?'
        )

        if (!confirmReset) return

        // Double confirmation for safety
        const doubleConfirm = window.confirm(
            '🚨 FINAL CONFIRMATION 🚨\n\n' +
            'You are about to delete ALL submissions permanently.\n\n' +
            'Type OK to proceed.'
        )

        if (!doubleConfirm) return

        setResetting(true)
        try {
            const response = await axios.delete(`${API_BASE}/submissions`)
            alert(`✅ Reset Complete!\n\n` +
                `• Code submissions deleted: ${response.data.deletedCodeSubmissions}\n` +
                `• Aptitude submissions deleted: ${response.data.deletedAptitudeSubmissions}\n` +
                ``)
            fetchSubmissions() // Refresh the list
        } catch (err) {
            alert('❌ Failed to reset submissions: ' + (err.response?.data?.error || err.message))
        } finally {
            setResetting(false)
        }
    }

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

    if (loading) return <div className="loading-spinner"></div>

    return (
        <div className="animate-fadeIn">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>Submission Archives</h2>
                    <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Global audit trail of all submissions</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                        <button
                            onClick={() => setActiveTab('all')}
                            style={{
                                padding: '0.5rem 1rem',
                                background: activeTab === 'all' ? 'var(--primary)' : 'transparent',
                                border: 'none',
                                color: activeTab === 'all' ? 'white' : 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >All ({allSubmissions.length})</button>
                        <button
                            onClick={() => setActiveTab('code')}
                            style={{
                                padding: '0.5rem 1rem',
                                background: activeTab === 'code' ? 'var(--primary)' : 'transparent',
                                border: 'none',
                                color: activeTab === 'code' ? 'white' : 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >💻 Code ({submissions.length})</button>

                        <button
                            onClick={() => setActiveTab('aptitude')}
                            style={{
                                padding: '0.5rem 1rem',
                                background: activeTab === 'aptitude' ? '#8b5cf6' : 'transparent',
                                border: 'none',
                                color: activeTab === 'aptitude' ? 'white' : 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >📝 Aptitude ({aptitudeSubmissions.length})</button>
                        <button
                            onClick={() => setActiveTab('global')}
                            style={{
                                padding: '0.5rem 1rem',
                                background: activeTab === 'global' ? '#3b82f6' : 'transparent',
                                border: 'none',
                                color: activeTab === 'global' ? 'white' : 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >🌐 Global ({globalSubmissions.length})</button>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search student, problem or status..."
                            style={{ padding: '0.6rem 1rem 0.6rem 2.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'white', width: '300px' }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={downloadCSV}
                        disabled={filteredSubmissions.length === 0}
                        style={{
                            padding: '0.6rem 1rem',
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            borderRadius: '8px',
                            color: '#10b981',
                            cursor: filteredSubmissions.length === 0 ? 'not-allowed' : 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            opacity: filteredSubmissions.length === 0 ? 0.5 : 1,
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                            if (filteredSubmissions.length > 0) {
                                e.target.style.background = 'rgba(16, 185, 129, 0.2)'
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = 'rgba(16, 185, 129, 0.1)'
                        }}
                    >
                        <Download size={16} />
                        Download CSV
                    </button>
                    <button
                        onClick={handleResetAllSubmissions}
                        disabled={resetting || allSubmissions.length === 0}
                        style={{
                            padding: '0.6rem 1rem',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '8px',
                            color: '#ef4444',
                            cursor: resetting || allSubmissions.length === 0 ? 'not-allowed' : 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            opacity: resetting || allSubmissions.length === 0 ? 0.5 : 1,
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                            if (!resetting && allSubmissions.length > 0) {
                                e.target.style.background = 'rgba(239, 68, 68, 0.2)'
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.background = 'rgba(239, 68, 68, 0.1)'
                        }}
                    >
                        <Trash2 size={16} />
                        {resetting ? 'Resetting...' : 'Reset All'}
                    </button>
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
                                <td>
                                    <div style={{ fontWeight: 600 }}>{sub.studentName}</div>
                                </td>
                                <td>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        background: sub.subType === 'aptitude' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                        color: sub.subType === 'aptitude' ? '#8b5cf6' : 'var(--primary)'
                                    }}>
                                        {sub.subType === 'aptitude' ? '📝 Aptitude' : sub.subType === 'global' ? '🌐 Global' : '💻 Code'}
                                    </span>
                                </td>
                                <td>
                                    <div style={{ color: 'var(--primary)', fontWeight: 500 }}>{sub.itemTitle || sub.testTitle}</div>
                                </td>
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
                                    {sub.subType === 'aptitude' ? (
                                        <button
                                            onClick={() => setViewAptitudeResult(sub)}
                                            style={{
                                                background: 'rgba(139, 92, 246, 0.1)',
                                                border: 'none',
                                                color: '#8b5cf6',
                                                padding: '0.4rem 0.75rem',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '0.8rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Eye size={14} /> Results
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setViewReport(sub)}
                                            style={{
                                                background: 'rgba(59, 130, 246, 0.1)',
                                                border: 'none',
                                                color: '#3b82f6',
                                                padding: '0.4rem 0.75rem',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '0.8rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Eye size={14} /> Report
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Report Modal */}
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

            {viewReport && (
                <AdminSubmissionReportModal
                    submission={viewReport}
                    onClose={() => setViewReport(null)}
                />
            )}
        </div>
    )
}



// ==================== ADMIN SUBMISSION REPORT MODAL ====================
function AdminSubmissionReportModal({ submission, onClose }) {
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

                    {/* AI Explanation */}
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

                    {/* Detailed Analysis */}
                    {submission.analysis && (
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <BarChart2 size={18} color="var(--primary)" /> Detailed Analysis
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
                </div>
            </div>
        </div>
    )
}



// ==================== GLOBAL PROBLEMS COMPONENT ====================
function GlobalProblems() {
    const [problems, setProblems] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showAIChat, setShowAIChat] = useState(false)
    const [uploading, setUploading] = useState(false)
    const csvInputRef = useRef(null)
    const [activeTab, setActiveTab] = useState('coding') // 'coding' or 'sql'
    const [selectedProblemForTestCases, setSelectedProblemForTestCases] = useState(null)
    const [problem, setProblem] = useState({
        title: '',
        type: 'Coding',
        language: 'Python',
        difficulty: 'Medium',
        description: '',
        sampleInput: '',
        expectedOutput: '',
        deadline: '',
        status: 'live',
        // SQL specific fields
        sqlSchema: '',
        expectedQueryResult: '',
        enableProctoring: false,
        enableVideoAudio: false,
        disableCopyPaste: false,
        trackTabSwitches: false,
        maxTabSwitches: 3,
        enableFaceDetection: false,
        detectMultipleFaces: false,
        trackFaceLookaway: false
    })

    // Check if SQL is selected
    const isSQLProblem = problem.type === 'SQL' || problem.language === 'SQL'

    // AI Chatbot handler - auto-fills the form
    const handleAIGenerate = (generated) => {
        const isSQL = generated.type === 'SQL' || generated.language === 'SQL'
        setProblem({
            title: generated.title || '',
            type: generated.type || 'Coding',
            language: generated.language || 'Python',
            difficulty: generated.difficulty || 'Medium',
            description: generated.description || '',
            sampleInput: isSQL ? '' : (generated.sampleInput || ''),
            expectedOutput: isSQL ? '' : (generated.expectedOutput || ''),
            sqlSchema: isSQL ? (generated.sqlSchema || generated.schema || '') : '',
            expectedQueryResult: isSQL ? (generated.expectedQueryResult || generated.expectedResult || '') : '',
            deadline: problem.deadline,
            status: generated.status || 'live',
            enableProctoring: problem.enableProctoring,
            enableVideoAudio: problem.enableVideoAudio,
            disableCopyPaste: problem.disableCopyPaste,
            trackTabSwitches: problem.trackTabSwitches,
            maxTabSwitches: problem.maxTabSwitches,
            enableFaceDetection: problem.enableFaceDetection,
            detectMultipleFaces: problem.detectMultipleFaces,
            trackFaceLookaway: problem.trackFaceLookaway
        })
        setShowAIChat(false)
        setShowModal(true)
    }

    const fetchProblems = () => {
        axios.get(`${API_BASE}/problems?mentorId=${ADMIN_ID}`)
            .then(res => {
                setProblems(Array.isArray(res.data) ? res.data : (res.data?.data || []))
                setLoading(false)
            })
            .catch(err => setLoading(false))
    }

    useEffect(() => {
        fetchProblems()
    }, [])

    const handleSubmit = async (e) => {
        e.preventDefault()
        try {
            await axios.post(`${API_BASE}/problems`, { ...problem, mentorId: ADMIN_ID })
            setShowModal(false)
            setProblem({
                title: '', type: 'Coding', language: 'Python', difficulty: 'Medium',
                description: '', sampleInput: '', expectedOutput: '', deadline: '', status: 'live',
                sqlSchema: '', expectedQueryResult: '',
                enableProctoring: false, enableVideoAudio: false, disableCopyPaste: false, trackTabSwitches: false, maxTabSwitches: 3,
                enableFaceDetection: false, detectMultipleFaces: false, trackFaceLookaway: false
            })
            fetchProblems()
        } catch (error) {
            alert('Error creating global problem')
        }
    }

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this problem?')) {
            try {
                await axios.delete(`${API_BASE}/problems/${id}`)
                fetchProblems()
            } catch (error) {
                alert('Error deleting problem')
            }
        }
    }

    const handleCSVUpload = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        e.target.value = ''
        setUploading(true)
        try {
            const text = await file.text()
            const lines = text.split('\n').filter(l => l.trim()).map(l => l.trim())
            if (lines.length < 2) { alert('CSV must have a header row and at least one data row'); setUploading(false); return }

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
            const rows = lines.slice(1)
            let created = 0

            for (const row of rows) {
                if (!row.trim()) continue
                const vals = parseCSVLine(row)
                const obj = {}
                headers.forEach((h, i) => { obj[h] = vals[i] || '' })

                const isSQL = (obj.type || '').toUpperCase() === 'SQL' || (obj.language || '').toUpperCase() === 'SQL'

                // Map various column name variations
                const getSampleInput = () => {
                    return obj['sample_input'] || obj['sampleinput'] || obj['testinput'] || obj['test_input'] || obj['sample input'] || obj['test input'] || ''
                }

                const getExpectedOutput = () => {
                    return obj['expected_output'] || obj['expectedoutput'] || obj['expectedresult'] || obj['expected_result'] || obj['expected output'] || obj['expected result'] || ''
                }

                const getSQLSchema = () => {
                    return obj['sql_schema'] || obj['sqlschema'] || obj['schema'] || obj['sql schema'] || ''
                }

                const getExpectedQueryResult = () => {
                    return obj['expected_query_result'] || obj['expectedqueryresult'] || obj['expected_result'] || obj['expectedresult'] || obj['expected query result'] || ''
                }

                const probData = {
                    title: obj['title'] || obj['name'] || '',
                    type: isSQL ? 'SQL' : (obj['type'] || 'Coding'),
                    language: isSQL ? 'SQL' : (obj['language'] || 'Python'),
                    difficulty: (obj['difficulty'] || 'Medium').charAt(0).toUpperCase() + (obj['difficulty'] || 'Medium').slice(1).toLowerCase(),
                    description: obj['description'] || '',
                    sampleInput: getSampleInput(),
                    expectedOutput: getExpectedOutput(),
                    sqlSchema: isSQL ? getSQLSchema() : '',
                    expectedQueryResult: isSQL ? getExpectedQueryResult() : '',
                    status: obj['status'] || 'live',
                    mentorId: ADMIN_ID
                }

                if (!probData.title || !probData.description) continue
                await axios.post(`${API_BASE}/problems`, probData)
                created++
            }
            alert(`Successfully created ${created} problems from CSV!`)
            fetchProblems()
        } catch (err) { alert('Error parsing CSV: ' + err.message) }
        setUploading(false)
    }

    if (loading) return <div className="loading-spinner"></div>

    // Separate problems into Coding and SQL
    const codingProblems = problems.filter(p => p.language !== 'SQL' && p.type !== 'SQL')
    const sqlProblems = problems.filter(p => p.language === 'SQL' || p.type === 'SQL')
    const displayedProblems = activeTab === 'coding' ? codingProblems : sqlProblems

    return (
        <div className="animate-fadeIn">
            {/* Hero Section */}
            <div className="admin-hero-card glass" style={{
                background: 'var(--bg-card)',
                borderRadius: '1.5rem',
                padding: '2rem',
                marginBottom: '2rem',
                border: '1px solid var(--border-color)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '200px', height: '200px', background: 'radial-gradient(circle, var(--primary-alpha) 0%, transparent 70%)', borderRadius: '50%' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                            <div style={{
                                width: '50px', height: '50px', borderRadius: '1rem',
                                background: 'var(--primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 8px 32px var(--primary-alpha)'
                            }}>
                                <Code size={24} color="white" />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                    Global Problems Management
                                </h2>
                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                                    Create coding challenges visible to all students platform-wide
                                </p>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <input type="file" accept=".csv" ref={csvInputRef} style={{ display: 'none' }} onChange={handleCSVUpload} />
                        <button
                            onClick={() => csvInputRef.current?.click()}
                            disabled={uploading}
                            className="btn-create-new premium-btn"
                            style={{
                                padding: '0.75rem 1.25rem',
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                borderRadius: '1rem',
                                fontSize: '0.95rem',
                                fontWeight: 600,
                                transition: 'all 0.3s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <Upload size={18} /> {uploading ? 'Uploading...' : 'CSV Upload'}
                        </button>
                        <button
                            onClick={() => setShowAIChat(true)}
                            className="btn-create-new premium-btn"
                            style={{
                                padding: '0.75rem 1.25rem',
                                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                borderRadius: '1rem',
                                fontSize: '0.95rem',
                                fontWeight: 600,
                                transition: 'all 0.3s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <Sparkles size={20} /> AI Generate
                        </button>
                        <button
                            onClick={() => setShowModal(true)}
                            className="btn-create-new premium-btn"
                            style={{
                                padding: '0.75rem 1.25rem',
                                background: 'var(--primary)',
                                borderRadius: '1rem',
                                fontSize: '0.95rem',
                                fontWeight: 600,
                                transition: 'all 0.3s ease'
                            }}
                        >
                            <Plus size={20} /> Create Manually
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'var(--primary-alpha)', color: 'var(--primary)' }}>
                        <FileCode size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Total Problems</span>
                        <span className="stat-value">{problems.length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'var(--success-alpha)', color: 'var(--success)' }}>
                        <CheckCircle size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Active Problems</span>
                        <span className="stat-value">{problems.filter(p => p.status === 'live').length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'var(--warning-alpha)', color: 'var(--warning)' }}>
                        <Trophy size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Total Solutions</span>
                        <span className="stat-value">{problems.reduce((acc, p) => acc + (p.completedBy?.length || 0), 0)}</span>
                    </div>
                </div>
            </div>

            {/* Tab Buttons */}
            <div style={{
                display: 'flex',
                gap: '1rem',
                marginBottom: '1.5rem',
                padding: '0.5rem',
                background: 'var(--bg-card)',
                borderRadius: '12px',
                width: 'fit-content'
            }}>
                <button
                    onClick={() => setActiveTab('coding')}
                    style={{
                        padding: '0.75rem 1.5rem',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s ease',
                        background: activeTab === 'coding' ? 'var(--primary)' : 'transparent',
                        color: activeTab === 'coding' ? 'white' : 'var(--text-muted)'
                    }}
                >
                    <Code size={18} />
                    Coding Problems
                    <span style={{
                        background: activeTab === 'coding' ? 'rgba(255,255,255,0.2)' : 'var(--bg-dark)',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem'
                    }}>{codingProblems.length}</span>
                </button>
                <button
                    onClick={() => setActiveTab('sql')}
                    style={{
                        padding: '0.75rem 1.5rem',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s ease',
                        background: activeTab === 'sql' ? 'linear-gradient(135deg, #06b6d4, #0891b2)' : 'transparent',
                        color: activeTab === 'sql' ? 'white' : 'var(--text-muted)'
                    }}
                >
                    <FileText size={18} />
                    SQL Problems
                    <span style={{
                        background: activeTab === 'sql' ? 'rgba(255,255,255,0.2)' : 'var(--bg-dark)',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem'
                    }}>{sqlProblems.length}</span>
                </button>
            </div>

            {/* Problems Grid */}
            <div className="problem-list-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))' }}>
                {displayedProblems.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', opacity: 0.5 }}>
                        <Code size={64} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                        <h3>No {activeTab === 'sql' ? 'SQL' : 'Coding'} Problems Yet</h3>
                        <p>Create your first {activeTab === 'sql' ? 'SQL' : 'coding'} problem!</p>
                    </div>
                ) : (
                    displayedProblems.map(p => (
                        <div key={p.id} className="problem-card card glass" style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{
                                        fontSize: '0.65rem',
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2))',
                                        color: '#10b981',
                                        fontWeight: 700
                                    }}>GLOBAL</span>
                                    <span className="problem-badge">{p.type?.toUpperCase()}</span>
                                    <span className={`status-badge ${p.status || 'live'}`} style={{ fontSize: '0.65rem' }}>{p.status || 'Active'}</span>
                                    {p.proctoring?.enabled && (
                                        <span style={{
                                            fontSize: '0.6rem',
                                            padding: '3px 8px',
                                            borderRadius: '4px',
                                            background: 'rgba(239, 68, 68, 0.15)',
                                            color: '#ef4444',
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}>
                                            <Shield size={10} /> PROCTORED
                                        </span>
                                    )}
                                </div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(59, 130, 246, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>{p.language}</span>
                            </div>
                            <h3 style={{ margin: '0.75rem 0', fontSize: '1.2rem' }}>{p.title}</h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '1rem' }}>
                                {p.description}
                            </p>

                            {p.deadline && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#f87171', marginBottom: '1rem', background: 'rgba(248, 113, 113, 0.05)', padding: '4px 8px', borderRadius: '4px', width: 'fit-content' }}>
                                    <Clock size={12} /> Deadline: {new Date(p.deadline).toLocaleDateString()}
                                </div>
                            )}

                            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        color: p.difficulty === 'Easy' ? '#10b981' : p.difficulty === 'Medium' ? '#f59e0b' : '#ef4444',
                                        fontWeight: 700
                                    }}>
                                        {p.difficulty}
                                    </span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        • {p.completedBy?.length || 0} solved
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => setSelectedProblemForTestCases(p)}
                                        disabled={p.language === 'SQL' || p.type === 'SQL'}
                                        style={{
                                            background: (p.language === 'SQL' || p.type === 'SQL') ? 'rgba(100, 116, 139, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                            border: 'none',
                                            color: (p.language === 'SQL' || p.type === 'SQL') ? '#64748b' : '#10b981',
                                            padding: '0.5rem 0.75rem',
                                            borderRadius: '0.5rem',
                                            cursor: (p.language === 'SQL' || p.type === 'SQL') ? 'not-allowed' : 'pointer',
                                            fontSize: '0.8rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            opacity: (p.language === 'SQL' || p.type === 'SQL') ? 0.5 : 1
                                        }}
                                        title={(p.language === 'SQL' || p.type === 'SQL') ? 'Test cases not available for SQL problems' : 'Manage Test Cases'}
                                    >
                                        <ClipboardList size={14} /> Tests
                                    </button>
                                    <button
                                        onClick={() => handleDelete(p.id)}
                                        style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Create Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px' }}>
                        <div className="modal-header">
                            <div className="modal-title-with-icon">
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Code size={20} color="white" />
                                </div>
                                <h2>Create Global Coding Problem</h2>
                            </div>
                            <button onClick={() => setShowModal(false)} className="modal-close"><X size={20} /></button>
                        </div>
                        <div className="modal-body premium-form">
                            <form onSubmit={handleSubmit}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                    <div className="form-group">
                                        <label className="form-label">Problem Title</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., Two Sum Problem"
                                            value={problem.title}
                                            onChange={(e) => setProblem({ ...problem, title: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Problem Type</label>
                                        <select
                                            value={problem.type}
                                            onChange={(e) => {
                                                const newType = e.target.value
                                                setProblem({
                                                    ...problem,
                                                    type: newType,
                                                    language: newType === 'SQL' ? 'SQL' : problem.language === 'SQL' ? 'Python' : problem.language
                                                })
                                            }}
                                        >
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
                                            <option value="C++">C++</option>
                                            <option value="SQL">SQL</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Difficulty</label>
                                        <select
                                            value={problem.difficulty}
                                            onChange={(e) => setProblem({ ...problem, difficulty: e.target.value })}
                                        >
                                            <option value="Easy">Easy</option>
                                            <option value="Medium">Medium</option>
                                            <option value="Hard">Hard</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select
                                            value={problem.status}
                                            onChange={(e) => setProblem({ ...problem, status: e.target.value })}
                                        >
                                            <option value="live">Live</option>
                                            <option value="draft">Draft</option>
                                            <option value="closed">Closed</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label className="form-label">Problem Description</label>
                                    <textarea
                                        rows="5"
                                        placeholder="Describe the problem in detail..."
                                        value={problem.description}
                                        onChange={(e) => setProblem({ ...problem, description: e.target.value })}
                                        required
                                    ></textarea>
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
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                        <div className="form-group">
                                            <label className="form-label">Sample Input</label>
                                            <input
                                                type="text"
                                                placeholder="e.g., [2, 7, 11, 15], target = 9"
                                                value={problem.sampleInput}
                                                onChange={(e) => setProblem({ ...problem, sampleInput: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Expected Output</label>
                                            <input
                                                type="text"
                                                placeholder="e.g., [0, 1]"
                                                value={problem.expectedOutput}
                                                onChange={(e) => setProblem({ ...problem, expectedOutput: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label className="form-label">Deadline (Optional)</label>
                                    <input
                                        type="date"
                                        value={problem.deadline}
                                        onChange={(e) => setProblem({ ...problem, deadline: e.target.value })}
                                    />
                                </div>

                                {/* Proctoring Settings Section */}
                                <div style={{
                                    marginBottom: '1.5rem',
                                    padding: '1.25rem',
                                    background: 'rgba(239, 68, 68, 0.05)',
                                    borderRadius: '1rem',
                                    border: '1px solid rgba(239, 68, 68, 0.15)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                                        <Eye size={20} color="#ef4444" />
                                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#ef4444' }}>
                                            Proctoring Settings
                                        </h4>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            cursor: 'pointer',
                                            padding: '0.75rem',
                                            background: problem.enableProctoring ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                            borderRadius: '0.75rem',
                                            transition: 'all 0.2s'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={problem.enableProctoring}
                                                onChange={(e) => setProblem({ ...problem, enableProctoring: e.target.checked })}
                                                style={{ width: '18px', height: '18px', accentColor: '#ef4444' }}
                                            />
                                            <span style={{ fontSize: '0.9rem' }}>Enable Proctoring</span>
                                        </label>

                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            cursor: problem.enableProctoring ? 'pointer' : 'not-allowed',
                                            opacity: problem.enableProctoring ? 1 : 0.5,
                                            padding: '0.75rem',
                                            background: problem.enableVideoAudio ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                                            borderRadius: '0.75rem',
                                            transition: 'all 0.2s'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={problem.enableVideoAudio}
                                                onChange={(e) => setProblem({ ...problem, enableVideoAudio: e.target.checked })}
                                                disabled={!problem.enableProctoring}
                                                style={{ width: '18px', height: '18px', accentColor: '#8b5cf6' }}
                                            />
                                            <span style={{ fontSize: '0.9rem' }}>📹 Video/Audio Monitoring</span>
                                        </label>

                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            cursor: problem.enableProctoring ? 'pointer' : 'not-allowed',
                                            opacity: problem.enableProctoring ? 1 : 0.5,
                                            padding: '0.75rem',
                                            background: problem.disableCopyPaste ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                                            borderRadius: '0.75rem',
                                            transition: 'all 0.2s'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={problem.disableCopyPaste}
                                                onChange={(e) => setProblem({ ...problem, disableCopyPaste: e.target.checked })}
                                                disabled={!problem.enableProctoring}
                                                style={{ width: '18px', height: '18px', accentColor: '#f59e0b' }}
                                            />
                                            <span style={{ fontSize: '0.9rem' }}>📋 Disable Copy/Paste</span>
                                        </label>

                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            cursor: problem.enableProctoring ? 'pointer' : 'not-allowed',
                                            opacity: problem.enableProctoring ? 1 : 0.5,
                                            padding: '0.75rem',
                                            background: problem.trackTabSwitches ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                                            borderRadius: '0.75rem',
                                            transition: 'all 0.2s'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={problem.trackTabSwitches}
                                                onChange={(e) => setProblem({ ...problem, trackTabSwitches: e.target.checked })}
                                                disabled={!problem.enableProctoring}
                                                style={{ width: '18px', height: '18px', accentColor: '#10b981' }}
                                            />
                                            <span style={{ fontSize: '0.9rem' }}>🔒 Track Tab Switches</span>
                                        </label>

                                        <hr style={{ margin: '0.5rem 0', borderColor: 'var(--border-color)', opacity: 0.3 }} />

                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            cursor: problem.enableProctoring ? 'pointer' : 'not-allowed',
                                            opacity: problem.enableProctoring ? 1 : 0.5,
                                            padding: '0.75rem',
                                            background: problem.enableFaceDetection ? 'rgba(236, 72, 153, 0.1)' : 'transparent',
                                            borderRadius: '0.75rem',
                                            transition: 'all 0.2s'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={problem.enableFaceDetection}
                                                onChange={(e) => setProblem({ ...problem, enableFaceDetection: e.target.checked })}
                                                disabled={!problem.enableProctoring}
                                                style={{ width: '18px', height: '18px', accentColor: '#ec4899' }}
                                            />
                                            <span style={{ fontSize: '0.9rem' }}>👁️ Enable Face Detection</span>
                                        </label>

                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            cursor: problem.enableProctoring ? 'pointer' : 'not-allowed',
                                            opacity: problem.enableProctoring ? 1 : 0.5,
                                            padding: '0.75rem',
                                            background: problem.detectMultipleFaces ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                            borderRadius: '0.75rem',
                                            transition: 'all 0.2s'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={problem.detectMultipleFaces}
                                                onChange={(e) => setProblem({ ...problem, detectMultipleFaces: e.target.checked })}
                                                disabled={!problem.enableProctoring}
                                                style={{ width: '18px', height: '18px', accentColor: '#ef4444' }}
                                            />
                                            <span style={{ fontSize: '0.9rem' }}>👥 Detect Multiple Faces (Cheating)</span>
                                        </label>

                                        <label style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            cursor: problem.enableProctoring ? 'pointer' : 'not-allowed',
                                            opacity: problem.enableProctoring ? 1 : 0.5,
                                            padding: '0.75rem',
                                            background: problem.trackFaceLookaway ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                            borderRadius: '0.75rem',
                                            transition: 'all 0.2s'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={problem.trackFaceLookaway}
                                                onChange={(e) => setProblem({ ...problem, trackFaceLookaway: e.target.checked })}
                                                disabled={!problem.enableProctoring}
                                                style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }}
                                            />
                                            <span style={{ fontSize: '0.9rem' }}>👀 Track Face Lookaway</span>
                                        </label>
                                    </div>

                                    {problem.enableProctoring && problem.trackTabSwitches && (
                                        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Max Tab Switches:</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="10"
                                                value={problem.maxTabSwitches}
                                                onChange={(e) => setProblem({ ...problem, maxTabSwitches: parseInt(e.target.value) || 3 })}
                                                style={{ width: '80px', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--bg-dark)', color: 'var(--text-main)' }}
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="form-actions">
                                    <button type="button" className="btn-reset" onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit" className="btn-create-new" style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)' }}>
                                        <Plus size={18} /> Create Global Problem
                                    </button>
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
        </div>
    )
}

// ==================== GLOBAL COMPLETE TESTS ADMIN ====================
const GLOBAL_SECTIONS = [
    { id: 'aptitude', label: 'Aptitude', icon: '📊' },
    { id: 'verbal', label: 'Verbal', icon: '📝' },
    { id: 'logical', label: 'Logical', icon: '🧩' },
    { id: 'coding', label: 'Coding', icon: '💻' },
    { id: 'sql', label: 'SQL', icon: '🗄️' }
];

function GlobalTestsAdmin() {
    const [tests, setTests] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [modalStep, setModalStep] = useState(1)
    const [editingId, setEditingId] = useState(null)
    const [sectionTab, setSectionTab] = useState('aptitude')
    const [managingTestCases, setManagingTestCases] = useState(null)
    const [newTest, setNewTest] = useState({
        title: '',
        type: 'comprehensive',
        difficulty: 'Medium',
        duration: 180,
        passingScore: 60,
        description: '',
        startTime: '',
        deadline: '',
        maxAttempts: 1,
        maxTabSwitches: 3,
        status: 'live',
        sectionConfig: {
            sections: [
                { id: 'aptitude', enabled: true, order: 1, questionsCount: 20, timeMinutes: 30 },
                { id: 'verbal', enabled: true, order: 2, questionsCount: 25, timeMinutes: 25 },
                { id: 'logical', enabled: true, order: 3, questionsCount: 20, timeMinutes: 20 },
                { id: 'coding', enabled: true, order: 4, questionsCount: 2, timeMinutes: 50 },
                { id: 'sql', enabled: true, order: 5, questionsCount: 1, timeMinutes: 25 }
            ],
            totalDurationMinutes: 180,
            sectionTimeMode: 'fixed'
        }
    })
    const [questionsBySection, setQuestionsBySection] = useState({
        aptitude: [], verbal: [], logical: [], coding: [], sql: []
    })
    const [manualQuestion, setManualQuestion] = useState({
        question: '', options: ['', '', '', ''], correctAnswer: 0, category: 'general', explanation: ''
    })
    const [codingQuestion, setCodingQuestion] = useState({
        question: '', starterCode: '', language: 'Python', testCases: [{ input: '', expected_output: '' }]
    })
    const [sqlQuestion, setSqlQuestion] = useState({
        question: '', schema: '', expectedOutput: ''
    })
    const [submissions, setSubmissions] = useState([])
    const [aiPrompt, setAiPrompt] = useState({ topic: '', difficulty: 'Medium', count: 5 })
    const [generatedQuestions, setGeneratedQuestions] = useState([])
    const [isGenerating, setIsGenerating] = useState(false)
    // Enhanced Proctoring Settings
    const [proctoringSettings, setProctoringSettings] = useState({
        enabled: true,
        trackTabSwitches: true,
        maxTabSwitches: 3,
        enableVideoAudio: true,
        disableCopyPaste: true,
        detectCameraBlocking: true,
        detectPhoneUsage: true,
        enforceFullscreen: true,
        autoSubmitOnViolation: false
    })

    const defaultProctoringSettings = {
        enabled: true,
        trackTabSwitches: true,
        maxTabSwitches: 3,
        enableVideoAudio: true,
        disableCopyPaste: true,
        detectCameraBlocking: true,
        detectPhoneUsage: true,
        enforceFullscreen: true,
        autoSubmitOnViolation: false
    }
    // AI Generation for Coding/SQL
    const [codingAiPrompt, setCodingAiPrompt] = useState({ topic: '', difficulty: 'Medium', language: 'Python' })
    const [sqlAiPrompt, setSqlAiPrompt] = useState({ topic: '', difficulty: 'Medium' })
    const [generatedCodingProblems, setGeneratedCodingProblems] = useState([])
    const [generatedSqlProblems, setGeneratedSqlProblems] = useState([])
    const [isGeneratingCoding, setIsGeneratingCoding] = useState(false)
    const [isGeneratingSql, setIsGeneratingSql] = useState(false)
    const [enableProctoring, setEnableProctoring] = useState(true)
    const [uploading, setUploading] = useState(false)
    const csvInputRef = useRef(null)

    const handleCSVUpload = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        setUploading(true)
        try {
            const text = await file.text()
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
            if (lines.length < 2) { alert('CSV must have header + at least one row'); return }
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''))
            const questions = []
            for (let i = 1; i < lines.length; i++) {
                const vals = lines[i].match(/(".*?"|[^,]+)/g)?.map(v => v.trim().replace(/^"|"$/g, '')) || []
                const row = {}
                headers.forEach((h, idx) => row[h] = vals[idx] || '')
                const section = (row.section || 'aptitude').toLowerCase()
                if (!['aptitude', 'verbal', 'logical'].includes(section)) continue
                questions.push({
                    section,
                    question: row.question || '',
                    options: [row.option1 || row.option_1 || '', row.option2 || row.option_2 || '', row.option3 || row.option_3 || '', row.option4 || row.option_4 || ''],
                    correctAnswer: parseInt(row.correctanswer || row.correct_answer || row.answer || '0'),
                    category: row.category || 'general',
                    explanation: row.explanation || ''
                })
            }
            if (questions.length === 0) { alert('No valid MCQ rows found. CSV needs: section,question,option1,option2,option3,option4,correctAnswer'); setUploading(false); return }
            // Create a test with default config
            const testPayload = {
                title: file.name.replace('.csv', '') + ' - CSV Import',
                type: 'comprehensive', difficulty: 'Medium', duration: 180, passingScore: 60,
                status: 'draft', createdBy: ADMIN_ID,
                sectionConfig: {
                    sections: [
                        { id: 'aptitude', enabled: true, order: 1, questionsCount: questions.filter(q => q.section === 'aptitude').length, timeMinutes: 30 },
                        { id: 'verbal', enabled: true, order: 2, questionsCount: questions.filter(q => q.section === 'verbal').length, timeMinutes: 25 },
                        { id: 'logical', enabled: true, order: 3, questionsCount: questions.filter(q => q.section === 'logical').length, timeMinutes: 20 },
                        { id: 'coding', enabled: false, order: 4, questionsCount: 0, timeMinutes: 0 },
                        { id: 'sql', enabled: false, order: 5, questionsCount: 0, timeMinutes: 0 }
                    ],
                    totalDurationMinutes: 75, sectionTimeMode: 'fixed'
                }
            }
            const res = await axios.post(`${API_BASE}/global-tests`, testPayload)
            const testId = res.data.id
            // Group questions by section and post
            for (const sec of ['aptitude', 'verbal', 'logical']) {
                const secQs = questions.filter(q => q.section === sec)
                if (secQs.length === 0) continue
                await axios.post(`${API_BASE}/global-tests/${testId}/questions`, { section: sec, questions: secQs })
            }
            alert(`Created test with ${questions.length} questions from CSV!`)
            fetchTests()
        } catch (err) {
            alert('CSV upload failed: ' + (err.response?.data?.error || err.message))
        } finally {
            setUploading(false)
            e.target.value = ''
        }
    }

    const fetchTests = async () => {
        try {
            const res = await axios.get(`${API_BASE}/global-tests`)
            setTests(Array.isArray(res.data) ? res.data : [])
        } catch (e) {
            if (e.response?.status === 503) setTests([])
            else console.error(e)
        } finally {
            setLoading(false)
        }
    }
    const fetchSubmissions = async () => {
        try {
            const res = await axios.get(`${API_BASE}/global-test-submissions`)
            setSubmissions(Array.isArray(res.data) ? res.data : [])
        } catch (_) { setSubmissions([]) }
    }

    useEffect(() => { fetchTests(); fetchSubmissions() }, [])

    const updateSectionConfig = (sectionId, field, value) => {
        setNewTest(prev => ({
            ...prev,
            sectionConfig: {
                ...prev.sectionConfig,
                sections: prev.sectionConfig.sections.map(s =>
                    s.id === sectionId ? { ...s, [field]: value } : s
                )
            }
        }))
    }
    const toggleSection = (sectionId, enabled) => {
        updateSectionConfig(sectionId, 'enabled', enabled)
    }

    const addManualQuestion = () => {
        if (!manualQuestion.question.trim()) return
        const opt = manualQuestion.options.map(o => o.trim()).filter(Boolean)
        if (opt.length < 2) { alert('Add at least 2 options'); return }
        const correctAnswer = opt[manualQuestion.correctAnswer] ?? opt[0]
        setQuestionsBySection(prev => ({
            ...prev,
            [sectionTab]: [...(prev[sectionTab] || []), {
                question: manualQuestion.question,
                options: opt,
                correctAnswer,
                category: manualQuestion.category,
                explanation: manualQuestion.explanation
            }]
        }))
        setManualQuestion({ question: '', options: ['', '', '', ''], correctAnswer: 0, category: 'general', explanation: '' })
    }

    const removeQuestion = (section, index) => {
        setQuestionsBySection(prev => ({
            ...prev,
            [section]: (prev[section] || []).filter((_, i) => i !== index)
        }))
    }

    const buildQuestionPayload = (section, list) => {
        if (section === 'coding') {
            return list.map(q => ({
                questionType: 'coding',
                question: q.question,
                starterCode: q.starterCode || '',
                testCases: q.testCases || { language: 'Python', cases: [] },
                points: q.points ?? 10
            }))
        }
        if (section === 'sql') {
            return list.map(q => ({
                questionType: 'sql',
                question: q.question,
                starterCode: q.starterCode || '',
                testCases: q.testCases || { expectedOutput: '' },
                points: q.points ?? 10
            }))
        }
        return list.map(q => ({
            questionType: 'mcq',
            question: q.question,
            options: q.options || [q.option_1, q.option_2, q.option_3, q.option_4].filter(Boolean),
            correctAnswer: q.correctAnswer ?? q.options?.[q.correctAnswer],
            category: q.category || 'general',
            explanation: q.explanation || ''
        }))
    }

    // AI Generation for Coding Problems
    const generateCodingProblem = async () => {
        if (!codingAiPrompt.topic.trim()) {
            alert('Please enter a topic for the coding problem')
            return
        }
        setIsGeneratingCoding(true)
        try {
            const res = await axios.post(`${API_BASE}/ai/generate-coding-problem`, {
                topic: codingAiPrompt.topic,
                difficulty: codingAiPrompt.difficulty,
                language: codingAiPrompt.language
            })
            if (res.data.problem) {
                setGeneratedCodingProblems([res.data.problem])
            }
        } catch (e) {
            console.error('AI Generation error:', e)
            // Fallback problem
            setGeneratedCodingProblems([{
                question: `Write a ${codingAiPrompt.language} program to solve: ${codingAiPrompt.topic}`,
                starterCode: codingAiPrompt.language === 'Python'
                    ? '# Write your solution here\ndef solution():\n    pass\n\n# Test your code\nsolution()'
                    : '// Write your solution here',
                testCases: [{ input: '', expected_output: '' }],
                language: codingAiPrompt.language,
                difficulty: codingAiPrompt.difficulty
            }])
        } finally {
            setIsGeneratingCoding(false)
        }
    }

    const addGeneratedCodingToSection = () => {
        if (generatedCodingProblems.length === 0) return
        const newProblems = generatedCodingProblems.map(p => ({
            questionType: 'coding',
            question: p.question,
            starterCode: p.starterCode || '',
            solutionCode: p.solutionCode || '',
            language: p.language || codingAiPrompt.language,
            testCases: {
                language: p.language || codingAiPrompt.language,
                cases: Array.isArray(p.testCases) ? p.testCases : (p.testCases?.cases || [])
            },
            hints: p.hints || [],
            explanation: p.explanation || '',
            points: 10
        }))
        setQuestionsBySection(prev => ({
            ...prev,
            coding: [...(prev.coding || []), ...newProblems]
        }))
        setGeneratedCodingProblems([])
        setCodingAiPrompt({ topic: '', difficulty: 'Medium', language: 'Python' })
    }

    // AI Generation for SQL Problems
    const generateSqlProblem = async () => {
        if (!sqlAiPrompt.topic.trim()) {
            alert('Please enter a topic for the SQL problem')
            return
        }
        setIsGeneratingSql(true)
        try {
            const res = await axios.post(`${API_BASE}/ai/generate-sql-problem`, {
                topic: sqlAiPrompt.topic,
                difficulty: sqlAiPrompt.difficulty
            })
            if (res.data.problem) {
                setGeneratedSqlProblems([res.data.problem])
            }
        } catch (e) {
            console.error('AI Generation error:', e)
            // Fallback problem
            setGeneratedSqlProblems([{
                question: `Write a SQL query to: ${sqlAiPrompt.topic}`,
                schema: `-- Sample schema\nCREATE TABLE employees (\n    id INTEGER PRIMARY KEY,\n    name TEXT,\n    department TEXT,\n    salary INTEGER\n);\n\nINSERT INTO employees VALUES (1, 'John', 'Engineering', 50000);`,
                expectedOutput: 'id|name|department|salary\n1|John|Engineering|50000',
                difficulty: sqlAiPrompt.difficulty
            }])
        } finally {
            setIsGeneratingSql(false)
        }
    }

    const addGeneratedSqlToSection = () => {
        if (generatedSqlProblems.length === 0) return
        const newProblems = generatedSqlProblems.map(p => ({
            questionType: 'sql',
            question: p.question,
            starterCode: `${p.schema || ''}\n\n-- Your query here:`,
            testCases: { expectedOutput: p.expectedOutput || '' },
            solutionQuery: p.solutionQuery || '',
            hints: p.hints || [],
            explanation: p.explanation || '',
            points: 10
        }))
        setQuestionsBySection(prev => ({
            ...prev,
            sql: [...(prev.sql || []), ...newProblems]
        }))
        setGeneratedSqlProblems([])
        setSqlAiPrompt({ topic: '', difficulty: 'Medium' })
    }

    const handleCreateOrUpdate = async () => {
        if (!newTest.title.trim()) { alert('Enter test title'); return }
        const totalQ = Object.values(questionsBySection).reduce((sum, arr) => sum + arr.length, 0)
        if (totalQ === 0) { alert('Add questions in sections'); return }
        try {
            // Format dates correctly for backend
            let formattedStartTime = null;
            if (newTest.startTime) {
                const startD = new Date(newTest.startTime);
                if (!isNaN(startD.getTime())) formattedStartTime = startD.toISOString();
            }

            let formattedDeadline = null;
            if (newTest.deadline) {
                const endD = new Date(newTest.deadline);
                if (!isNaN(endD.getTime())) formattedDeadline = endD.toISOString();
            }

            const payload = {
                ...newTest,
                startTime: formattedStartTime,
                deadline: formattedDeadline,
                createdBy: editingId ? undefined : ADMIN_ID,
                // Include enhanced proctoring settings
                proctoring: proctoringSettings.enabled ? {
                    enabled: true,
                    trackTabSwitches: proctoringSettings.trackTabSwitches,
                    maxTabSwitches: proctoringSettings.maxTabSwitches,
                    enableVideoAudio: proctoringSettings.enableVideoAudio,
                    disableCopyPaste: proctoringSettings.disableCopyPaste,
                    detectCameraBlocking: proctoringSettings.detectCameraBlocking,
                    detectPhoneUsage: proctoringSettings.detectPhoneUsage,
                    enforceFullscreen: proctoringSettings.enforceFullscreen,
                    autoSubmitOnViolation: proctoringSettings.autoSubmitOnViolation
                } : { enabled: false },
                maxTabSwitches: proctoringSettings.enabled && proctoringSettings.trackTabSwitches ? proctoringSettings.maxTabSwitches : 0
            }
            let testId = editingId
            if (editingId) {
                await axios.put(`${API_BASE}/global-tests/${editingId}`, {
                    ...payload,
                    createdBy: undefined
                })
                await axios.delete(`${API_BASE}/global-tests/${editingId}/questions`)
            } else {
                const res = await axios.post(`${API_BASE}/global-tests`, payload)
                testId = res.data.id
            }
            for (const section of GLOBAL_SECTIONS) {
                const list = questionsBySection[section.id] || []
                if (list.length === 0) continue
                const payload = buildQuestionPayload(section.id, list)
                await axios.post(`${API_BASE}/global-tests/${testId}/questions`, { section: section.id, questions: payload })
            }
            setShowModal(false)
            setModalStep(1)
            setEditingId(null)
            setQuestionsBySection({ aptitude: [], verbal: [], logical: [], coding: [], sql: [] })
            setNewTest({
                title: '', type: 'comprehensive', difficulty: 'Medium', duration: 180, passingScore: 60,
                description: '', startTime: '', deadline: '', maxAttempts: 1, maxTabSwitches: 3, status: 'live',
                sectionConfig: newTest.sectionConfig
            })
            setProctoringSettings(defaultProctoringSettings)
            fetchTests()
        } catch (e) {
            alert(e.response?.data?.error || 'Failed to save test')
        }
    }

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this global test? This cannot be undone.')) return
        try {
            await axios.delete(`${API_BASE}/global-tests/${id}`)
            fetchTests()
        } catch (e) {
            alert(e.response?.data?.error || 'Delete failed')
        }
    }

    const handleUpdateStatus = async (testId, newStatus) => {
        try {
            await axios.put(`${API_BASE}/global-tests/${testId}`, { status: newStatus })
            fetchTests()
        } catch (e) {
            alert(e.response?.data?.error || 'Status update failed')
        }
    }

    const openEdit = async (test) => {
        try {
            const [testRes, qRes] = await Promise.all([
                axios.get(`${API_BASE}/global-tests/${test.id}`),
                axios.get(`${API_BASE}/global-tests/${test.id}/questions`)
            ])
            const t = testRes.data
            const qList = Array.isArray(qRes.data) ? qRes.data : []
            const bySection = { aptitude: [], verbal: [], logical: [], coding: [], sql: [] }
            qList.forEach(q => {
                const opts = q.options || []
                let correctAnswer = q.correctAnswer
                if (q.questionType !== 'coding' && q.questionType !== 'sql') {
                    if (typeof correctAnswer === 'number' && correctAnswer >= 0 && correctAnswer < 4) {
                        correctAnswer = correctAnswer
                    } else if (typeof correctAnswer === 'string' && opts.length) {
                        const idx = opts.indexOf(correctAnswer)
                        correctAnswer = idx >= 0 ? idx : (/^[0-3]$/.test(correctAnswer) ? parseInt(correctAnswer, 10) : 0)
                    } else {
                        correctAnswer = 0
                    }
                }
                const item = {
                    id: q.id,
                    question: q.question,
                    options: opts.length ? opts : ['', '', '', ''],
                    correctAnswer,
                    category: q.category,
                    explanation: q.explanation,
                    questionType: q.questionType || 'mcq',
                    starterCode: q.starterCode,
                    solutionCode: q.solutionCode,
                    testCases: q.testCases,
                    points: q.points
                }
                if (bySection[q.section]) bySection[q.section].push(item)
            })
            setEnableProctoring((t.maxTabSwitches ?? 0) > 0)
            const savedProctoring = t.proctoring || {}
            setProctoringSettings({
                enabled: savedProctoring.enabled ?? false,
                trackTabSwitches: savedProctoring.trackTabSwitches ?? false,
                maxTabSwitches: savedProctoring.maxTabSwitches ?? (t.maxTabSwitches ?? 3),
                enableVideoAudio: savedProctoring.enableVideoAudio ?? false,
                disableCopyPaste: savedProctoring.disableCopyPaste ?? false,
                detectCameraBlocking: savedProctoring.detectCameraBlocking ?? false,
                detectPhoneUsage: savedProctoring.detectPhoneUsage ?? false,
                enforceFullscreen: savedProctoring.enforceFullscreen ?? false,
                autoSubmitOnViolation: savedProctoring.autoSubmitOnViolation ?? false
            })
            setNewTest({
                title: t.title,
                type: t.type || 'comprehensive',
                difficulty: t.difficulty || 'Medium',
                duration: t.duration ?? 180,
                passingScore: t.passingScore ?? 60,
                description: t.description || '',
                startTime: t.startTime ? t.startTime.slice(0, 16) : '',
                deadline: t.deadline ? t.deadline.slice(0, 16) : '',
                maxAttempts: t.maxAttempts ?? 1,
                maxTabSwitches: t.maxTabSwitches ?? 3,
                status: t.status || 'draft',
                sectionConfig: t.sectionConfig || newTest.sectionConfig
            })
            setQuestionsBySection(bySection)
            setEditingId(t.id)
            setModalStep(1)
            setShowModal(true)
        } catch (e) {
            alert(e.response?.data?.error || 'Failed to load test')
        }
    }

    const handleGenerateQuestions = async () => {
        setIsGenerating(true)
        try {
            const res = await axios.post(`${API_BASE}/ai/generate-aptitude`, {
                ...aiPrompt,
                section: sectionTab,
            })
            if (res.data.questions) setGeneratedQuestions(res.data.questions)
        } catch (_) {
            alert('Error generating questions')
        } finally {
            setIsGenerating(false)
        }
    }
    const addGeneratedToSection = () => {
        if (generatedQuestions.length === 0) return
        setQuestionsBySection(prev => ({
            ...prev,
            [sectionTab]: [...(prev[sectionTab] || []), ...generatedQuestions.map(q => ({
                question: q.question,
                options: q.options || ['', '', '', ''],
                correctAnswer: q.correctAnswer ?? 0,
                category: q.category || sectionTab || 'general',
                explanation: q.explanation || ''
            }))]
        }))
        setGeneratedQuestions([])
    }
    const updateQuestionInSection = (section, index, field, value) => {
        setQuestionsBySection(prev => {
            const list = [...(prev[section] || [])]
            if (!list[index]) return prev
            if (field === 'options') {
                list[index] = { ...list[index], options: value }
            } else if (field === 'correctAnswer') {
                list[index] = { ...list[index], correctAnswer: value }
            } else {
                list[index] = { ...list[index], [field]: value }
            }
            return { ...prev, [section]: list }
        })
    }
    const addNewMcqToSection = () => {
        setQuestionsBySection(prev => ({
            ...prev,
            [sectionTab]: [...(prev[sectionTab] || []), { question: '', options: ['', '', '', ''], correctAnswer: 0, category: 'general', explanation: '' }]
        }))
    }

    const addCodingQuestion = () => {
        if (!codingQuestion.question.trim()) { alert('Enter problem description'); return }
        const cases = codingQuestion.testCases.filter(tc => tc.input !== undefined || tc.expected_output)
        if (cases.length === 0 || !cases.some(c => (c.expected_output || '').trim())) { alert('Add at least one test case with expected output'); return }
        setQuestionsBySection(prev => ({
            ...prev,
            coding: [...(prev.coding || []), {
                questionType: 'coding',
                question: codingQuestion.question,
                starterCode: codingQuestion.starterCode,
                testCases: { language: codingQuestion.language, cases: codingQuestion.testCases.map(c => ({ input: c.input || '', expected_output: c.expected_output || '' })) },
                points: 10
            }]
        }))
        setCodingQuestion({ question: '', starterCode: '', language: 'Python', testCases: [{ input: '', expected_output: '' }] })
    }

    const addSqlQuestion = () => {
        if (!sqlQuestion.question.trim()) { alert('Enter question text'); return }
        if (!sqlQuestion.schema.trim()) { alert('Enter database schema'); return }
        if (!sqlQuestion.expectedOutput.trim()) { alert('Enter expected query result'); return }
        setQuestionsBySection(prev => ({
            ...prev,
            sql: [...(prev.sql || []), {
                questionType: 'sql',
                question: sqlQuestion.question,
                starterCode: sqlQuestion.schema,
                testCases: { expectedOutput: sqlQuestion.expectedOutput },
                points: 10
            }]
        }))
        setSqlQuestion({ question: '', schema: '', expectedOutput: '' })
    }

    if (loading) return <div className="loading-spinner"></div>

    return (
        <div className="animate-fadeIn">
            {/* Hero – same style as Global Problems */}
            <div className="admin-hero-card glass" style={{
                background: 'var(--bg-card)',
                borderRadius: '1.5rem',
                padding: '2rem',
                marginBottom: '2rem',
                border: '1px solid var(--border-color)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '200px', height: '200px', background: 'radial-gradient(circle, var(--primary-alpha) 0%, transparent 70%)', borderRadius: '50%' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                            <div style={{ width: '50px', height: '50px', borderRadius: '1rem', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px var(--primary-alpha)' }}>
                                <ClipboardList size={24} color="white" />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)' }}>Global Complete Tests</h2>
                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>Aptitude, Verbal, Logical, Coding, SQL – create and manage</p>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <input type="file" accept=".csv" ref={csvInputRef} style={{ display: 'none' }} onChange={handleCSVUpload} />
                        <button
                            onClick={() => csvInputRef.current?.click()}
                            disabled={uploading}
                            className="btn-create-new premium-btn"
                            style={{ padding: '0.75rem 1.25rem', background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: '1rem', fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Upload size={18} /> {uploading ? 'Uploading...' : 'CSV Upload'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowModal(true); setModalStep(1); setEditingId(null); setQuestionsBySection({ aptitude: [], verbal: [], logical: [], coding: [], sql: [] }); setGeneratedQuestions([]); setAiPrompt({ topic: '', difficulty: 'Medium', count: 5 }); setProctoringSettings(defaultProctoringSettings); }}
                            className="btn-create-new premium-btn"
                            style={{ padding: '0.75rem 1.25rem', background: 'var(--primary)', borderRadius: '1rem', fontSize: '0.95rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Plus size={20} /> Create Global Test
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats grid – like Global Problems */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'var(--primary-alpha)', color: 'var(--primary)' }}><ClipboardList size={24} /></div>
                    <div className="stat-info">
                        <span className="stat-label">Total Tests</span>
                        <span className="stat-value">{tests.length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'var(--success-alpha)', color: 'var(--success)' }}><CheckCircle size={24} /></div>
                    <div className="stat-info">
                        <span className="stat-label">Live</span>
                        <span className="stat-value">{tests.filter(t => t.status === 'live').length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'var(--warning-alpha)', color: 'var(--warning)' }}><Target size={24} /></div>
                    <div className="stat-info">
                        <span className="stat-label">Submissions</span>
                        <span className="stat-value">{submissions.length}</span>
                    </div>
                </div>
            </div>

            {tests.length === 0 && !loading ? (
                <div style={{ textAlign: 'center', padding: '4rem', opacity: 0.7 }}>
                    <ClipboardList size={64} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                    <h3>No global tests yet</h3>
                    <p style={{ color: 'var(--text-muted)' }}>Create one to add Aptitude, Verbal, Logical, Coding, and SQL sections.</p>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>If you see 503, run: <code>node migrate_global_tests.js</code></p>
                </div>
            ) : (
                <div className="problem-list-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))' }}>
                    {tests.map(t => (
                        <div key={t.id} className="problem-card card glass" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <span style={{ fontSize: '0.65rem', padding: '3px 8px', borderRadius: '4px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2))', color: '#10b981', fontWeight: 700 }}>GLOBAL TEST</span>
                                <span style={{
                                    fontSize: '0.65rem',
                                    padding: '3px 8px',
                                    borderRadius: '4px',
                                    textTransform: 'uppercase',
                                    fontWeight: 700,
                                    background: t.status === 'live' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    color: t.status === 'live' ? '#10b981' : '#ef4444',
                                    border: t.status === 'live' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)'
                                }}>
                                    {t.status === 'live' ? 'LIVE' : 'ENDED'}
                                </span>
                            </div>
                            <h3 style={{ margin: '0.75rem 0', fontSize: '1.2rem' }}>{t.title}</h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '1rem' }}>
                                {t.description || 'Aptitude, Verbal, Logical, Coding, SQL'}
                            </p>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                {t.duration} min · {t.totalQuestions ?? 0} questions · Pass {t.passingScore}%
                            </div>
                            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.type}</span>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => openEdit(t)}
                                        style={{ background: '#1e3a8a', border: '1px solid #1d4ed8', color: '#93c5fd', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        <Eye size={14} /> View
                                    </button>

                                    {t.status === 'live' ? (
                                        <button
                                            type="button"
                                            onClick={() => handleUpdateStatus(t.id, 'draft')}
                                            style={{ background: '#451a03', border: '1px solid #b45309', color: '#fbbf24', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <XCircle size={14} /> End
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => handleUpdateStatus(t.id, 'live')}
                                            style={{ background: '#064e3b', border: '1px solid #059669', color: '#6ee7b7', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <CheckCircle size={14} /> Activate
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => handleDelete(t.id)}
                                        style={{ background: '#450a0a', border: '1px solid #991b1b', color: '#f87171', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        <Trash2 size={14} /> Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem',
                    zIndex: 1500,
                    backdropFilter: 'blur(5px)',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)'
                }}>
                    <div className="modal-content" style={{
                        width: '100%',
                        maxWidth: modalStep === 1 ? 'min(800px, calc(100vw - 2rem))' : 'min(900px, calc(100vw - 2rem))',
                        maxHeight: '80vh', // Reduced to 80vh to ensure it stays well within screen
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: '16px',
                        background: '#1e293b', // Solid background fallback
                        backgroundImage: 'linear-gradient(145deg, rgba(30,41,59,1), rgba(15,23,42,1))', // opaque gradient
                        border: '1px solid rgba(139,92,246,0.2)',
                        boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
                    }}>
                        {/* Modal Header - Fixed */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '1rem 1.5rem',
                            borderBottom: '1px solid rgba(139,92,246,0.15)',
                            background: 'rgba(15, 23, 42, 0.95)', // Nearly opaque background
                            backdropFilter: 'blur(10px)', // Blur for glass effect without text bleed
                            flexShrink: 0,
                            zIndex: 10
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ padding: '0.5rem', background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(6,182,212,0.2))', borderRadius: '10px' }}>
                                    <Globe size={22} color="#a78bfa" />
                                </div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{editingId ? 'Edit' : 'Create'} Global Test</h2>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                                        {modalStep === 1 ? 'Step 1: Basic Settings & Sections' : 'Step 2: Add Questions to Sections'}
                                    </p>
                                </div>
                            </div>
                            <button type="button" onClick={() => { setShowModal(false); setModalStep(1); setEditingId(null); }}
                                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '10px', padding: '0.5rem', cursor: 'pointer', color: 'white', transition: 'all 0.2s' }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Scrollable Content Area */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>

                            {modalStep === 1 && (
                                <>
                                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                                        <label className="form-label">Test Title</label>
                                        <input type="text" placeholder="e.g. Global Complete Assessment - Feb 2026" value={newTest.title} onChange={e => setNewTest({ ...newTest, title: e.target.value })} style={{ width: '100%' }} />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                                        <div className="form-group">
                                            <label className="form-label">Duration (min) — default 180 for Coding+SQL</label>
                                            <input type="number" min="30" max="300" value={newTest.duration} onChange={e => setNewTest({ ...newTest, duration: parseInt(e.target.value) || 180 })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Passing Score (%)</label>
                                            <input type="number" min="0" max="100" value={newTest.passingScore} onChange={e => setNewTest({ ...newTest, passingScore: parseInt(e.target.value) || 60 })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Status</label>
                                            <select value={newTest.status} onChange={e => setNewTest({ ...newTest, status: e.target.value })}>
                                                <option value="draft">Draft</option>
                                                <option value="live">Live</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                                        <label className="form-label">Max Attempts</label>
                                        <input type="number" min="1" max="10" value={newTest.maxAttempts} onChange={e => setNewTest({ ...newTest, maxAttempts: parseInt(e.target.value) || 1 })} />
                                    </div>
                                    {/* Enhanced Proctoring Settings */}
                                    <div style={{ marginBottom: '1.5rem', padding: '1.25rem', background: 'linear-gradient(135deg, rgba(239,68,68,0.05), rgba(251,191,36,0.05))', borderRadius: '16px', border: '1px solid rgba(239,68,68,0.2)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                                            <div style={{ padding: '0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: '8px' }}>
                                                <Shield size={20} color="#ef4444" />
                                            </div>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '1rem', color: '#ef4444' }}>Proctoring Settings</h4>
                                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Configure security measures for exam integrity</p>
                                            </div>
                                            <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <input type="checkbox" checked={proctoringSettings.enabled} onChange={e => setProctoringSettings({ ...proctoringSettings, enabled: e.target.checked })} />
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Enable Proctoring</span>
                                            </label>
                                        </div>

                                        {proctoringSettings.enabled && (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                                                {/* Tab Switches */}
                                                <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                                                        <input type="checkbox" checked={proctoringSettings.trackTabSwitches} onChange={e => setProctoringSettings({ ...proctoringSettings, trackTabSwitches: e.target.checked })} />
                                                        <Eye size={16} color="#f59e0b" />
                                                        Track Tab Switches
                                                    </label>
                                                    {proctoringSettings.trackTabSwitches && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1.5rem' }}>
                                                            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Max:</span>
                                                            <input type="number" min="1" max="10" value={proctoringSettings.maxTabSwitches} onChange={e => setProctoringSettings({ ...proctoringSettings, maxTabSwitches: parseInt(e.target.value) || 3 })} style={{ width: 50, padding: '0.25rem 0.5rem', fontSize: '0.85rem' }} />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Video/Audio Recording */}
                                                <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                                        <input type="checkbox" checked={proctoringSettings.enableVideoAudio} onChange={e => setProctoringSettings({ ...proctoringSettings, enableVideoAudio: e.target.checked })} />
                                                        <span style={{ fontSize: '1rem' }}>📹</span>
                                                        Video/Audio Recording
                                                    </label>
                                                    <p style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>Record student during test</p>
                                                </div>

                                                {/* Camera Blocking Detection */}
                                                <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                                        <input type="checkbox" checked={proctoringSettings.detectCameraBlocking} onChange={e => setProctoringSettings({ ...proctoringSettings, detectCameraBlocking: e.target.checked })} />
                                                        <span style={{ fontSize: '1rem' }}>🚫</span>
                                                        Detect Camera Blocking
                                                    </label>
                                                    <p style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>Flag covered/blocked camera</p>
                                                </div>

                                                {/* Phone Detection */}
                                                <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                                        <input type="checkbox" checked={proctoringSettings.detectPhoneUsage} onChange={e => setProctoringSettings({ ...proctoringSettings, detectPhoneUsage: e.target.checked })} />
                                                        <span style={{ fontSize: '1rem' }}>📱</span>
                                                        AI Phone Detection
                                                    </label>
                                                    <p style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>Detect mobile phones in view</p>
                                                </div>

                                                {/* Copy/Paste Blocking */}
                                                <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                                        <input type="checkbox" checked={proctoringSettings.disableCopyPaste} onChange={e => setProctoringSettings({ ...proctoringSettings, disableCopyPaste: e.target.checked })} />
                                                        <span style={{ fontSize: '1rem' }}>📋</span>
                                                        Disable Copy/Paste
                                                    </label>
                                                    <p style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>Block clipboard actions</p>
                                                </div>

                                                {/* Fullscreen Enforcement */}
                                                <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                                        <input type="checkbox" checked={proctoringSettings.enforceFullscreen} onChange={e => setProctoringSettings({ ...proctoringSettings, enforceFullscreen: e.target.checked })} />
                                                        <span style={{ fontSize: '1rem' }}>🖥️</span>
                                                        Enforce Fullscreen
                                                    </label>
                                                    <p style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>Required during test</p>
                                                </div>

                                                {/* Auto Submit on Violation */}
                                                <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.2)' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                                        <input type="checkbox" checked={proctoringSettings.autoSubmitOnViolation} onChange={e => setProctoringSettings({ ...proctoringSettings, autoSubmitOnViolation: e.target.checked })} />
                                                        <AlertTriangle size={16} color="#ef4444" />
                                                        Auto-Submit on Max Violations
                                                    </label>
                                                    <p style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.7rem', color: 'rgba(239,68,68,0.7)' }}>Submit test when violations exceed limit</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                                        <label className="form-label">Description (optional)</label>
                                        <textarea placeholder="Instructions for students" value={newTest.description} onChange={e => setNewTest({ ...newTest, description: e.target.value })} rows={2} style={{ width: '100%', resize: 'vertical' }} />
                                    </div>
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <h4 style={{ margin: '0 0 0.75rem' }}>Sections — Coding min 2, SQL min 1 (max set by you)</h4>
                                        {(newTest.sectionConfig?.sections || []).map(s => (
                                            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 120 }}>
                                                    <input type="checkbox" checked={!!s.enabled} onChange={e => toggleSection(s.id, e.target.checked)} />
                                                    {GLOBAL_SECTIONS.find(g => g.id === s.id)?.icon} {GLOBAL_SECTIONS.find(g => g.id === s.id)?.label}
                                                    {s.id === 'coding' && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(min 2)</span>}
                                                    {s.id === 'sql' && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(min 1)</span>}
                                                </label>
                                                <input type="number" min={s.id === 'coding' ? 2 : s.id === 'sql' ? 1 : 0} placeholder="Count" value={s.questionsCount ?? ''} onChange={e => updateSectionConfig(s.id, 'questionsCount', parseInt(e.target.value) || 0)} style={{ width: 70 }} />
                                                <input type="number" min="0" placeholder="Min" value={s.timeMinutes ?? ''} onChange={e => updateSectionConfig(s.id, 'timeMinutes', parseInt(e.target.value) || 0)} style={{ width: 70 }} />
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                        <button type="button" className="btn-reset" onClick={() => setShowModal(false)}>Cancel</button>
                                        <button type="button" className="btn-create-new" onClick={() => setModalStep(2)}>Next: Add Questions</button>
                                    </div>
                                </>
                            )}

                            {modalStep === 2 && (
                                <>
                                    {/* Modern Section Tabs */}
                                    <div style={{
                                        display: 'flex',
                                        gap: '0.5rem',
                                        marginBottom: '1.5rem',
                                        flexWrap: 'wrap',
                                        padding: '0.5rem',
                                        background: 'rgba(0,0,0,0.2)',
                                        borderRadius: '14px',
                                        border: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        {GLOBAL_SECTIONS.map(s => {
                                            const isActive = sectionTab === s.id
                                            const count = (questionsBySection[s.id] || []).length
                                            const sectionColors = {
                                                aptitude: { bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.4)', color: '#a78bfa' },
                                                verbal: { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.4)', color: '#60a5fa' },
                                                logical: { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', color: '#fbbf24' },
                                                coding: { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)', color: '#34d399' },
                                                sql: { bg: 'rgba(6,182,212,0.15)', border: 'rgba(6,182,212,0.4)', color: '#22d3ee' }
                                            }
                                            const colors = sectionColors[s.id] || sectionColors.aptitude
                                            return (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() => setSectionTab(s.id)}
                                                    style={{
                                                        padding: '0.75rem 1.25rem',
                                                        borderRadius: '10px',
                                                        border: isActive ? `2px solid ${colors.border}` : '2px solid transparent',
                                                        background: isActive ? colors.bg : 'transparent',
                                                        color: isActive ? colors.color : 'rgba(255,255,255,0.6)',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem',
                                                        fontSize: '0.9rem',
                                                        fontWeight: isActive ? 600 : 400,
                                                        transition: 'all 0.2s ease',
                                                        flex: '1 1 auto',
                                                        justifyContent: 'center',
                                                        minWidth: '120px'
                                                    }}
                                                >
                                                    <span style={{ fontSize: '1.1rem' }}>{s.icon}</span>
                                                    <span>{s.label}</span>
                                                    <span style={{
                                                        background: count > 0
                                                            ? (isActive ? colors.color : 'rgba(255,255,255,0.2)')
                                                            : 'rgba(255,255,255,0.1)',
                                                        color: count > 0 ? (isActive ? '#0f172a' : 'rgba(255,255,255,0.8)') : 'rgba(255,255,255,0.4)',
                                                        padding: '0.15rem 0.5rem',
                                                        borderRadius: '6px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        minWidth: '24px',
                                                        textAlign: 'center'
                                                    }}>
                                                        {count}
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>

                                    {sectionTab === 'coding' && (
                                        <>
                                            {/* AI Coding Problem Generator */}
                                            <div className="card glass" style={{ marginBottom: '1.5rem', padding: '1.5rem', background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(6,182,212,0.05))', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '16px' }}>
                                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem', fontSize: '1.1rem', color: '#10b981' }}>
                                                    <Bot size={20} /> AI Coding Problem Generator
                                                </h4>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
                                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                                        <label className="form-label" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>TOPIC / CONCEPT</label>
                                                        <input type="text" placeholder="e.g., Two Sum, Binary Search, Linked Lists" value={codingAiPrompt.topic} onChange={e => setCodingAiPrompt({ ...codingAiPrompt, topic: e.target.value })} style={{ width: '100%' }} />
                                                    </div>
                                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                                        <label className="form-label" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>DIFFICULTY</label>
                                                        <select value={codingAiPrompt.difficulty} onChange={e => setCodingAiPrompt({ ...codingAiPrompt, difficulty: e.target.value })}>
                                                            <option value="Easy">Easy</option>
                                                            <option value="Medium">Medium</option>
                                                            <option value="Hard">Hard</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                                        <label className="form-label" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>LANGUAGE</label>
                                                        <select value={codingAiPrompt.language} onChange={e => setCodingAiPrompt({ ...codingAiPrompt, language: e.target.value })}>
                                                            <option value="Python">Python</option>
                                                            <option value="JavaScript">JavaScript</option>
                                                            <option value="Java">Java</option>
                                                            <option value="C++">C++</option>
                                                        </select>
                                                    </div>
                                                    <button type="button" className="btn-create-new" onClick={generateCodingProblem} disabled={isGeneratingCoding} style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)' }}>
                                                        {isGeneratingCoding ? <><RefreshCw size={16} className="spin" /> Generating...</> : <><Wand2 size={16} /> Generate</>}
                                                    </button>
                                                </div>
                                                {generatedCodingProblems.length > 0 && (
                                                    <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(16,185,129,0.1)', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.2)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                            <span style={{ fontWeight: 600, color: '#10b981' }}>✓ Generated {generatedCodingProblems.length} Problem(s)</span>
                                                            <button type="button" className="btn-create-new" onClick={addGeneratedCodingToSection} style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                                                                <Plus size={16} /> Add to Section
                                                            </button>
                                                        </div>
                                                        {generatedCodingProblems.map((p, i) => (
                                                            <div key={i} style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginTop: '0.5rem' }}>
                                                                <p style={{ margin: '0 0 0.5rem', fontWeight: 500, color: 'white' }}>{p.question?.substring(0, 150)}...</p>
                                                                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>{p.testCases?.length || 0} test cases</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Manual Entry Section */}
                                            <div style={{ padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem', fontSize: '1rem', color: 'var(--text)' }}>
                                                    <Code size={18} /> Manual Entry
                                                </h4>
                                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                                    <label className="form-label">Problem description</label>
                                                    <textarea value={codingQuestion.question} onChange={e => setCodingQuestion({ ...codingQuestion, question: e.target.value })} placeholder="Describe the coding problem..." rows={3} style={{ width: '100%', resize: 'vertical' }} />
                                                </div>
                                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                                    <label className="form-label">Starter code (optional)</label>
                                                    <textarea value={codingQuestion.starterCode} onChange={e => setCodingQuestion({ ...codingQuestion, starterCode: e.target.value })} placeholder="def solution():\n    pass" rows={4} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical' }} />
                                                </div>
                                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                                    <label className="form-label">Language</label>
                                                    <select value={codingQuestion.language} onChange={e => setCodingQuestion({ ...codingQuestion, language: e.target.value })}>
                                                        <option value="Python">Python</option>
                                                        <option value="JavaScript">JavaScript</option>
                                                        <option value="Java">Java</option>
                                                        <option value="C++">C++</option>
                                                    </select>
                                                </div>
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <label className="form-label">Test cases (input → expected output)</label>
                                                    {codingQuestion.testCases.map((tc, idx) => (
                                                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                                                            <input type="text" placeholder="Sample Input" value={tc.input || ''} onChange={e => {
                                                                const t = [...codingQuestion.testCases]; t[idx] = { ...t[idx], input: e.target.value }; setCodingQuestion({ ...codingQuestion, testCases: t })
                                                            }} />
                                                            <input type="text" placeholder="Sample Output" value={tc.expected_output || ''} onChange={e => {
                                                                const t = [...codingQuestion.testCases]; t[idx] = { ...t[idx], expected_output: e.target.value }; setCodingQuestion({ ...codingQuestion, testCases: t })
                                                            }} />
                                                            <button type="button" onClick={() => setCodingQuestion({ ...codingQuestion, testCases: codingQuestion.testCases.filter((_, i) => i !== idx) })} className="btn-reset" style={{ color: 'var(--danger)' }}><X size={18} /></button>
                                                        </div>
                                                    ))}
                                                    <button type="button" className="btn-reset" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }} onClick={() => setCodingQuestion({ ...codingQuestion, testCases: [...codingQuestion.testCases, { input: '', expected_output: '' }] })}>+ Add test case</button>
                                                </div>
                                                <button type="button" className="btn-create-new" onClick={addCodingQuestion}>Add this coding problem</button>
                                            </div>

                                            {/* Added Coding Questions List */}
                                            <div style={{ marginTop: '2rem' }}>
                                                {questionsBySection.coding?.length > 0 && <h4 style={{ color: 'white', marginBottom: '1rem', fontSize: '1rem' }}>Added Coding Problems ({questionsBySection.coding.length})</h4>}
                                                {questionsBySection.coding?.map((q, idx) => (
                                                    <div key={idx} className="card glass" style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '12px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                            <div>
                                                                <h5 style={{ margin: '0 0 0.5rem', color: '#60a5fa', fontSize: '1rem' }}>{q.question?.substring(0, 100)}...</h5>
                                                                <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                                                                    {q.testCases?.language || (q.testCases?.cases || Array.isArray(q.testCases) ? 'Coding' : 'Python')} • {(Array.isArray(q.testCases) ? q.testCases : (q.testCases?.cases || [])).length} test cases
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                <button type="button" onClick={() => setManagingTestCases({ index: idx, section: 'coding' })} style={{ padding: '0.5rem 0.75rem', background: '#3b82f6', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                                                    <ClipboardList size={16} /> Manage Test Cases
                                                                </button>
                                                                <button type="button" onClick={() => {
                                                                    setQuestionsBySection(prev => ({ ...prev, coding: prev.coding.filter((_, i) => i !== idx) }))
                                                                }} style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.2)', border: 'none', borderRadius: '8px', color: '#ef4444', cursor: 'pointer' }}>
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Local Test Cases Manager Modal */}
                                            {managingTestCases && questionsBySection[managingTestCases.section]?.[managingTestCases.index] && (
                                                <LocalTestCasesManager
                                                    title={questionsBySection[managingTestCases.section][managingTestCases.index].question?.substring(0, 50)}
                                                    inputLabel={managingTestCases.section === 'sql' ? 'Database Schema (SQL)' : 'Sample Input'}
                                                    outputLabel={managingTestCases.section === 'sql' ? 'Expected Result (Table/Text)' : 'Sample Output'}
                                                    initialTestCases={(() => {
                                                        const q = questionsBySection[managingTestCases.section][managingTestCases.index]
                                                        if (Array.isArray(q.testCases)) {
                                                            return q.testCases.map(c => ({
                                                                ...c,
                                                                expectedOutput: c.expected_output || c.expectedOutput,
                                                                isHidden: c.isHidden || false,
                                                                points: c.points || 10,
                                                                description: c.description || ''
                                                            }))
                                                        } else if (managingTestCases.section === 'sql') {
                                                            // Handle SQL specific formats
                                                            // Format 1: schema/expectedOutput properties
                                                            // Format 2: starterCode (schema) and testCases.expectedOutput
                                                            const schema = q.schema || q.starterCode || ''
                                                            const output = q.expectedOutput || q.testCases?.expectedOutput || ''
                                                            if (schema || output) {
                                                                return [{
                                                                    input: schema,
                                                                    expectedOutput: output,
                                                                    isHidden: false,
                                                                    points: q.points || 10,
                                                                    description: 'Default Case'
                                                                }]
                                                            }
                                                        }

                                                        if (q.testCases?.cases) {
                                                            return q.testCases.cases.map(c => ({
                                                                ...c,
                                                                expectedOutput: c.expected_output || c.expectedOutput,
                                                                isHidden: c.isHidden || false,
                                                                points: c.points || 10,
                                                                description: c.description || ''
                                                            }))
                                                        }
                                                        return []
                                                    })()}
                                                    onClose={() => setManagingTestCases(null)}
                                                    onUpdate={(newCases) => {
                                                        const denormalized = newCases.map(c => ({
                                                            input: c.input,
                                                            expected_output: c.expectedOutput,
                                                            isHidden: c.isHidden,
                                                            points: c.points,
                                                            description: c.description
                                                        }))
                                                        setQuestionsBySection(prev => {
                                                            const section = managingTestCases.section
                                                            const list = [...(prev[section] || [])]
                                                            if (list[managingTestCases.index]) {
                                                                const q = list[managingTestCases.index]
                                                                if (section === 'sql') {
                                                                    // For SQL, update root schema/expectedOutput AND starterCode
                                                                    const first = newCases[0] || { input: '', expectedOutput: '' }
                                                                    list[managingTestCases.index] = {
                                                                        ...q,
                                                                        schema: first.input,
                                                                        starterCode: first.input, // Critical: GlobalTestInterface uses this for schema if sqlSchema missing
                                                                        expectedOutput: first.expectedOutput,
                                                                        testCases: denormalized // Store as array for future
                                                                    }
                                                                } else {
                                                                    // For Coding
                                                                    const currentLang = q.testCases?.language || 'Python'
                                                                    if (q.testCases?.language || !Array.isArray(q.testCases)) {
                                                                        list[managingTestCases.index] = {
                                                                            ...q,
                                                                            testCases: {
                                                                                language: currentLang,
                                                                                cases: denormalized
                                                                            }
                                                                        }
                                                                    } else {
                                                                        list[managingTestCases.index] = {
                                                                            ...q,
                                                                            testCases: denormalized
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                            return { ...prev, [section]: list }
                                                        })
                                                    }}
                                                />
                                            )}
                                        </>
                                    )}

                                    {sectionTab === 'sql' && (
                                        <>
                                            {/* AI SQL Problem Generator */}
                                            <div className="card glass" style={{ marginBottom: '1.5rem', padding: '1.5rem', background: 'linear-gradient(135deg, rgba(6,182,212,0.1), rgba(139,92,246,0.05))', border: '1px solid rgba(6,182,212,0.3)', borderRadius: '16px' }}>
                                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem', fontSize: '1.1rem', color: '#06b6d4' }}>
                                                    <Bot size={20} /> AI SQL Problem Generator
                                                </h4>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
                                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                                        <label className="form-label" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>TOPIC / CONCEPT</label>
                                                        <input type="text" placeholder="e.g., JOINs, Aggregate Functions, Subqueries" value={sqlAiPrompt.topic} onChange={e => setSqlAiPrompt({ ...sqlAiPrompt, topic: e.target.value })} style={{ width: '100%' }} />
                                                    </div>
                                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                                        <label className="form-label" style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>DIFFICULTY</label>
                                                        <select value={sqlAiPrompt.difficulty} onChange={e => setSqlAiPrompt({ ...sqlAiPrompt, difficulty: e.target.value })}>
                                                            <option value="Easy">Easy</option>
                                                            <option value="Medium">Medium</option>
                                                            <option value="Hard">Hard</option>
                                                        </select>
                                                    </div>
                                                    <button type="button" className="btn-create-new" onClick={generateSqlProblem} disabled={isGeneratingSql} style={{ background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)' }}>
                                                        {isGeneratingSql ? <><RefreshCw size={16} className="spin" /> Generating...</> : <><Wand2 size={16} /> Generate</>}
                                                    </button>
                                                </div>
                                                {generatedSqlProblems.length > 0 && (
                                                    <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(6,182,212,0.1)', borderRadius: '12px', border: '1px solid rgba(6,182,212,0.2)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                            <span style={{ fontWeight: 600, color: '#06b6d4' }}>✓ Generated {generatedSqlProblems.length} Problem(s)</span>
                                                            <button type="button" className="btn-create-new" onClick={addGeneratedSqlToSection} style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)' }}>
                                                                <Plus size={16} /> Add to Section
                                                            </button>
                                                        </div>
                                                        {generatedSqlProblems.map((p, i) => (
                                                            <div key={i} style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginTop: '0.5rem' }}>
                                                                <p style={{ margin: '0 0 0.5rem', fontWeight: 500, color: 'white' }}>{p.question?.substring(0, 150)}...</p>
                                                                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Schema included</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Manual Entry Section */}
                                            <div style={{ padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem', fontSize: '1rem', color: 'var(--text)' }}>
                                                    <Database size={18} /> Manual Entry
                                                </h4>
                                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                                    <label className="form-label">Question / instruction</label>
                                                    <textarea value={sqlQuestion.question} onChange={e => setSqlQuestion({ ...sqlQuestion, question: e.target.value })} placeholder="e.g. Write a query to return the top 5 employees by salary" rows={2} style={{ width: '100%', resize: 'vertical' }} />
                                                </div>
                                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                                    <label className="form-label">Database schema (CREATE TABLE + INSERT)</label>
                                                    <textarea value={sqlQuestion.schema} onChange={e => setSqlQuestion({ ...sqlQuestion, schema: e.target.value })} placeholder="CREATE TABLE employees (id INT, name TEXT, salary INT);&#10;INSERT INTO employees VALUES (1,'A',100);" rows={6} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical' }} />
                                                </div>
                                                <div className="form-group" style={{ marginBottom: '1rem' }}>
                                                    <label className="form-label">Expected query result (exact output to match)</label>
                                                    <textarea value={sqlQuestion.expectedOutput} onChange={e => setSqlQuestion({ ...sqlQuestion, expectedOutput: e.target.value })} placeholder="Paste the expected result as shown by SQLite" rows={4} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical' }} />
                                                </div>
                                                <button type="button" className="btn-create-new" onClick={addSqlQuestion}>Add this SQL question</button>
                                            </div>

                                            {/* Added SQL Questions List */}
                                            <div style={{ marginTop: '2rem' }}>
                                                {questionsBySection.sql?.length > 0 && <h4 style={{ color: 'white', marginBottom: '1rem', fontSize: '1rem' }}>Added SQL Problems ({questionsBySection.sql.length})</h4>}
                                                {questionsBySection.sql?.map((q, idx) => (
                                                    <div key={idx} className="card glass" style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.2)', borderRadius: '12px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                            <div>
                                                                <h5 style={{ margin: '0 0 0.5rem', color: '#60a5fa', fontSize: '1rem' }}>{q.question?.substring(0, 100)}...</h5>
                                                                <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                                                                    SQL Problem • {(Array.isArray(q.testCases) ? q.testCases : (q.schema ? 1 : 0))} test case(s)
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                <button type="button" onClick={() => setManagingTestCases({ index: idx, section: 'sql' })} style={{ padding: '0.5rem 0.75rem', background: '#06b6d4', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                                                    <ClipboardList size={16} /> Manage Data
                                                                </button>
                                                                <button type="button" onClick={() => {
                                                                    setQuestionsBySection(prev => ({ ...prev, sql: prev.sql.filter((_, i) => i !== idx) }))
                                                                }} style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.2)', border: 'none', borderRadius: '8px', color: '#ef4444', cursor: 'pointer' }}>
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}

                                    {sectionTab !== 'coding' && sectionTab !== 'sql' && (
                                        <>
                                            {/* AI Question Generator - same as Aptitude Tests */}
                                            <div className="card glass" style={{ marginBottom: '1.5rem', padding: '1.25rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem', fontSize: '1rem' }}>
                                                    <Sparkles size={18} style={{ color: 'var(--primary)' }} /> AI Question Generator
                                                </h4>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '0.75rem', alignItems: 'end', flexWrap: 'wrap' }}>
                                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                                        <label className="form-label">TOPIC</label>
                                                        <input type="text" placeholder="e.g., Number Series, Logical Reasoning" value={aiPrompt.topic} onChange={e => setAiPrompt({ ...aiPrompt, topic: e.target.value })} style={{ width: '100%' }} />
                                                    </div>
                                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                                        <label className="form-label">DIFFICULTY</label>
                                                        <select value={aiPrompt.difficulty} onChange={e => setAiPrompt({ ...aiPrompt, difficulty: e.target.value })}>
                                                            <option value="Easy">Easy</option>
                                                            <option value="Medium">Medium</option>
                                                            <option value="Hard">Hard</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                                        <label className="form-label">COUNT</label>
                                                        <input type="number" min="1" max="20" value={aiPrompt.count} onChange={e => setAiPrompt({ ...aiPrompt, count: parseInt(e.target.value) || 1 })} style={{ width: 70 }} />
                                                    </div>
                                                    <button type="button" className="btn-create-new" onClick={handleGenerateQuestions} disabled={isGenerating} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <Sparkles size={16} /> {isGenerating ? 'Generating…' : 'Generate'}
                                                    </button>
                                                </div>
                                                {generatedQuestions.length > 0 && (
                                                    <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{generatedQuestions.length} question(s) generated.</span>
                                                        <button type="button" className="btn-create-new" onClick={addGeneratedToSection} style={{ fontSize: '0.9rem' }}>Add All to Test</button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Questions - card UI like Aptitude */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0, fontSize: '1rem' }}>
                                                    <HelpCircle size={18} style={{ color: 'var(--text-muted)' }} /> Questions
                                                </h4>
                                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{(questionsBySection[sectionTab] || []).length} questions</span>
                                            </div>

                                            <div style={{ maxHeight: '50vh', overflowY: 'auto', marginBottom: '1rem' }}>
                                                {(questionsBySection[sectionTab] || []).map((q, idx) => (
                                                    <div key={idx} className="card glass" style={{ marginBottom: '1rem', padding: '1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                                            <span style={{ background: 'var(--primary)', color: 'white', padding: '0.25rem 0.6rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.85rem' }}>Q{idx + 1}</span>
                                                            <button type="button" onClick={() => removeQuestion(sectionTab, idx)} className="btn-reset" style={{ color: 'var(--danger)', padding: '0.25rem' }} title="Delete question"><Trash2 size={18} /></button>
                                                        </div>
                                                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                                                            <label className="form-label">QUESTION TEXT</label>
                                                            <textarea value={q.question || ''} onChange={e => updateQuestionInSection(sectionTab, idx, 'question', e.target.value)} placeholder="Enter question text..." rows={2} style={{ width: '100%', resize: 'vertical' }} />
                                                        </div>
                                                        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                                            <label className="form-label">ANSWER OPTIONS</label>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                                {[0, 1, 2, 3].map(i => {
                                                                    const opts = q.options || ['', '', '', '']
                                                                    const isCorrect = (q.correctAnswer ?? 0) === i
                                                                    return (
                                                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                            <button type="button" onClick={() => updateQuestionInSection(sectionTab, idx, 'correctAnswer', i)} style={{ minWidth: 36, height: 36, borderRadius: '8px', border: '2px solid ' + (isCorrect ? 'var(--success)' : 'var(--border-color)'), background: isCorrect ? 'var(--success-alpha)' : 'var(--bg-secondary)', color: isCorrect ? 'var(--success)' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                                                                                {String.fromCharCode(65 + i)}
                                                                            </button>
                                                                            <input type="text" value={opts[i] || ''} onChange={e => { const o = [...opts]; o[i] = e.target.value; updateQuestionInSection(sectionTab, idx, 'options', o); }} placeholder={`Option ${String.fromCharCode(65 + i)}`} style={{ flex: 1 }} />
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--success-alpha)', borderRadius: '8px', border: '1px solid var(--success)' }}>
                                                            <Check size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
                                                            <span style={{ fontSize: '0.9rem', color: 'var(--success)', fontWeight: 500 }}>Correct Answer:</span>
                                                            <span style={{ background: 'var(--success)', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.85rem' }}>Option {String.fromCharCode(65 + (q.correctAnswer ?? 0))}</span>
                                                            <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Click any option badge to change</span>
                                                        </div>
                                                    </div>
                                                ))}
                                                <button type="button" onClick={addNewMcqToSection} style={{ width: '100%', padding: '1.25rem', border: '2px dashed var(--border-color)', borderRadius: '12px', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '1rem' }}>
                                                    <Plus size={20} /> Add New Question
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    {(sectionTab === 'coding' || sectionTab === 'sql') && (
                                        <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                                            <strong>Added in {GLOBAL_SECTIONS.find(s => s.id === sectionTab)?.label}:</strong>
                                            <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem', maxHeight: 200, overflow: 'auto' }}>
                                                {(questionsBySection[sectionTab] || []).map((q, i) => (
                                                    <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>{q.question}</span>
                                                        <button type="button" onClick={() => removeQuestion(sectionTab, i)} className="btn-reset" style={{ color: 'var(--danger)' }}><X size={16} /></button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
                                        <button type="button" className="btn-reset" onClick={() => setModalStep(1)}>Back</button>
                                        <button type="button" className="btn-create-new" onClick={handleCreateOrUpdate}>{editingId ? 'Update' : 'Create'} Test</button>
                                    </div>
                                </>
                            )}
                        </div> {/* End Scrollable Content Area */}
                    </div>
                </div>
            )}
        </div>
    )
}

// ==================== APTITUDE TESTS ADMIN ====================
function AptitudeTestsAdmin() {
    const [tests, setTests] = useState([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [showQuestionsModal, setShowQuestionsModal] = useState(false)
    const [selectedTest, setSelectedTest] = useState(null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [generatedQuestions, setGeneratedQuestions] = useState([])
    const [aiPrompt, setAiPrompt] = useState({ topic: '', difficulty: 'Medium', count: 5 })
    const [submissions, setSubmissions] = useState([])
    const [uploading, setUploading] = useState(false)
    const csvInputRef = useRef(null)

    const [newTest, setNewTest] = useState({
        title: '',
        difficulty: 'Medium',
        duration: 30,
        passingScore: 60,
        maxTabSwitches: 3,
        maxAttempts: 1,
        startTime: '',
        deadline: '',
        description: '',
        status: 'live',
        questions: []
    })
    const [manualQuestion, setManualQuestion] = useState({
        question: '',
        options: ['', '', '', ''],
        correctAnswer: 0,
        category: 'general',
        explanation: ''
    })

    useEffect(() => {
        fetchTests()
        fetchSubmissions()
    }, [])

    const fetchTests = async () => {
        try {
            const response = await axios.get(`${API_BASE}/aptitude`)
            setTests(response.data)
            setLoading(false)
        } catch (error) {
            console.error('Error fetching tests:', error)
            setLoading(false)
        }
    }

    const fetchSubmissions = async () => {
        try {
            const response = await axios.get(`${API_BASE}/aptitude-submissions`)
            setSubmissions(response.data)
        } catch (error) {
            console.error('Error fetching submissions:', error)
        }
    }

    const handleGenerateQuestions = async () => {
        setIsGenerating(true)
        try {
            const response = await axios.post(`${API_BASE}/ai/generate-aptitude`, {
                ...aiPrompt,
                section: 'aptitude',
            })
            if (response.data.questions) {
                setGeneratedQuestions(response.data.questions)
            }
        } catch (error) {
            alert('Error generating questions')
        } finally {
            setIsGenerating(false)
        }
    }

    const addGeneratedQuestions = () => {
        setNewTest(prev => ({
            ...prev,
            questions: [...prev.questions, ...generatedQuestions]
        }))
        setGeneratedQuestions([])
    }

    const handleCreateTest = async (e) => {
        if (e) e.preventDefault()

        if (newTest.questions.length === 0) {
            alert('Please add at least one question')
            return
        }

        // Validate that all questions have content and options
        const invalidQuestions = newTest.questions.filter(q => {
            return !q.question.trim() || q.options.some(opt => !opt.trim())
        })

        if (invalidQuestions.length > 0) {
            alert('Please fill in all questions and options')
            return
        }

        try {
            // Convert dates to ISO strings without timezone conversion
            // because datetime-local input is already in local time
            const testPayload = { ...newTest, createdBy: ADMIN_ID }
            if (testPayload.startTime) {
                const date = new Date(testPayload.startTime)
                if (!isNaN(date.getTime())) testPayload.startTime = date.toISOString()
            }
            if (testPayload.deadline) {
                const date = new Date(testPayload.deadline)
                if (!isNaN(date.getTime())) testPayload.deadline = date.toISOString()
            }

            await axios.post(`${API_BASE}/aptitude`, testPayload)
            setShowModal(false)
            setNewTest({
                title: '',
                difficulty: 'Medium',
                duration: 30,
                passingScore: 60,
                maxTabSwitches: 3,
                maxAttempts: 1,
                startTime: '',
                deadline: '',
                description: '',
                status: 'live',
                questions: []
            })
            fetchTests()
        } catch (error) {
            console.error(error)
            alert(error.response?.data?.error || 'Error creating test')
        }
    }

    const handleCSVUpload = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        setUploading(true)
        try {
            const text = await file.text()
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
            if (lines.length < 2) { alert('CSV must have header + at least one row'); return }
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''))
            const questions = []
            for (let i = 1; i < lines.length; i++) {
                const vals = lines[i].match(/(".*?"|[^,]+)/g)?.map(v => v.trim().replace(/^"|"$/g, '')) || []
                const row = {}
                headers.forEach((h, idx) => row[h] = vals[idx] || '')
                if (!row.question) continue
                questions.push({
                    question: row.question,
                    options: [row.option1 || row.option_1 || '', row.option2 || row.option_2 || '', row.option3 || row.option_3 || '', row.option4 || row.option_4 || ''],
                    correctAnswer: parseInt(row.correctanswer || row.correct_answer || row.answer || '0'),
                    category: row.category || 'general',
                    explanation: row.explanation || ''
                })
            }
            if (questions.length === 0) { alert('No valid rows. CSV needs: question,option1,option2,option3,option4,correctAnswer'); setUploading(false); return }
            const payload = {
                title: file.name.replace('.csv', '') + ' - CSV Import',
                difficulty: 'Medium', duration: Math.max(30, questions.length * 2),
                passingScore: 60, maxTabSwitches: 3, maxAttempts: 1,
                status: 'draft', createdBy: ADMIN_ID, questions
            }
            await axios.post(`${API_BASE}/aptitude`, payload)
            alert(`Created aptitude test with ${questions.length} questions from CSV!`)
            fetchTests()
        } catch (err) {
            alert('CSV upload failed: ' + (err.response?.data?.error || err.message))
        } finally {
            setUploading(false)
            e.target.value = ''
        }
    }

    const handleToggleStatus = async (test) => {
        const newStatus = test.status === 'live' ? 'ended' : 'live';
        const action = newStatus === 'live' ? 'make this test visible to students' : 'hide this test from students';

        if (window.confirm(`Are you sure you want to ${action}?`)) {
            try {
                await axios.patch(`${API_BASE}/aptitude/${test.id}/status`, { status: newStatus })
                fetchTests()
            } catch (error) {
                alert('Error updating test status')
            }
        }
    }

    const handleDeleteTest = async (id) => {
        if (!window.confirm('Delete this aptitude test?')) {
            return
        }

        try {
            await axios.delete(`${API_BASE}/aptitude/${id}`)
            fetchTests()
        } catch (error) {
            console.error(error)
            alert('Error deleting test')
        }
    }

    const removeQuestion = (index) => {
        setNewTest(prev => ({
            ...prev,
            questions: prev.questions.filter((_, i) => i !== index)
        }))
    }

    if (loading) return <div className="loading-spinner"></div>

    return (
        <div className="animate-fadeIn">
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '2rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Target size={28} color="white" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                            Aptitude Tests
                        </h2>
                        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                            Create and manage aptitude tests for students
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <input type="file" accept=".csv" ref={csvInputRef} style={{ display: 'none' }} onChange={handleCSVUpload} />
                    <button
                        onClick={() => csvInputRef.current?.click()}
                        disabled={uploading}
                        className="btn-create-new premium-btn"
                        style={{
                            padding: '0.75rem 1.25rem',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            borderRadius: '1rem',
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        <Upload size={18} /> {uploading ? 'Uploading...' : 'CSV Upload'}
                    </button>
                    <button
                        onClick={() => setShowModal(true)}
                        className="btn-create-new premium-btn"
                        style={{
                            padding: '0.75rem 1.25rem',
                            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                            borderRadius: '1rem',
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        <Plus size={20} /> Create New Test
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '1rem',
                marginBottom: '2rem'
            }}>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                        <Target size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Total Tests</span>
                        <span className="stat-value">{tests.length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                        <CheckCircle size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Live Tests</span>
                        <span className="stat-value">{tests.filter(t => t.status === 'live').length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                        <Send size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Submissions</span>
                        <span className="stat-value">{submissions.length}</span>
                    </div>
                </div>
                <div className="stat-card glass">
                    <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                        <Trophy size={24} />
                    </div>
                    <div className="stat-info">
                        <span className="stat-label">Pass Rate</span>
                        <span className="stat-value">
                            {submissions.length > 0
                                ? Math.round((submissions.filter(s => s.status === 'passed').length / submissions.length) * 100)
                                : 0}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Tests Table */}
            <div className="card glass">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                    <Target size={20} style={{ color: '#8b5cf6' }} /> All Aptitude Tests
                </h3>
                <div className="table-container" style={{ border: 'none' }}>
                    <table className="modern-table">
                        <thead>
                            <tr>
                                <th>Test Title</th>
                                <th>Difficulty</th>
                                <th>Questions</th>
                                <th>Duration</th>
                                <th>Pass %</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tests.map(test => (
                                <tr key={test.id}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{
                                                width: '36px',
                                                height: '36px',
                                                borderRadius: '8px',
                                                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <Target size={16} color="white" />
                                            </div>
                                            <span style={{ fontWeight: 500 }}>{test.title}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`difficulty-badge ${test.difficulty?.toLowerCase()}`}>
                                            {test.difficulty}
                                        </span>
                                    </td>
                                    <td>{test.questionCount || test.totalQuestions}</td>
                                    <td>{test.duration} min</td>
                                    <td>{test.passingScore}%</td>
                                    <td>
                                        <span style={{
                                            padding: '0.25rem 0.75rem',
                                            borderRadius: '20px',
                                            background: test.status === 'live'
                                                ? 'rgba(16, 185, 129, 0.15)'
                                                : test.status === 'ended'
                                                    ? 'rgba(239, 68, 68, 0.15)'
                                                    : 'rgba(107, 114, 128, 0.15)',
                                            color: test.status === 'live'
                                                ? '#10b981'
                                                : test.status === 'ended'
                                                    ? '#ef4444'
                                                    : '#6b7280',
                                            fontSize: '0.8rem',
                                            fontWeight: 500
                                        }}>
                                            {test.status}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => {
                                                    setSelectedTest(test)
                                                    setShowQuestionsModal(true)
                                                }}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    background: 'rgba(59, 130, 246, 0.1)',
                                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                                    borderRadius: '6px',
                                                    color: '#3b82f6',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem'
                                                }}
                                            >
                                                View
                                            </button>
                                            <button
                                                onClick={() => handleToggleStatus(test)}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    background: test.status === 'live'
                                                        ? 'rgba(245, 158, 11, 0.1)'
                                                        : 'rgba(16, 185, 129, 0.1)',
                                                    border: test.status === 'live'
                                                        ? '1px solid rgba(245, 158, 11, 0.3)'
                                                        : '1px solid rgba(16, 185, 129, 0.3)',
                                                    borderRadius: '6px',
                                                    color: test.status === 'live' ? '#f59e0b' : '#10b981',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem'
                                                }}
                                                title={test.status === 'live' ? 'End test (hide from students)' : 'Make test live (show to students)'}
                                            >
                                                {test.status === 'live' ? 'End' : 'Activate'}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTest(test.id)}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    background: 'rgba(239, 68, 68, 0.1)',
                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                    borderRadius: '6px',
                                                    color: '#ef4444',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem'
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Test Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div
                        className="modal-content"
                        onClick={e => e.stopPropagation()}
                        style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}
                    >
                        <div className="modal-header">
                            <div className="modal-title-with-icon">
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Target size={20} color="white" />
                                </div>
                                <h2>Create Aptitude Test</h2>
                            </div>
                            <button onClick={() => setShowModal(false)} className="modal-close">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateTest} className="modal-body">
                            {/* Test Details */}
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label"><FileText size={14} style={{ marginRight: '0.5rem' }} /> Test Title</label>
                                    <input
                                        type="text"
                                        placeholder="Enter test title..."
                                        value={newTest.title}
                                        onChange={e => setNewTest({ ...newTest, title: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label"><Clock size={14} style={{ marginRight: '0.5rem' }} /> Duration (mins)</label>
                                    <input
                                        type="number"
                                        min="5"
                                        max="180"
                                        value={newTest.duration}
                                        onChange={e => setNewTest({ ...newTest, duration: parseInt(e.target.value) })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label"><RefreshCw size={14} style={{ marginRight: '0.5rem' }} /> Attempts</label>
                                    <select
                                        value={newTest.maxAttempts}
                                        onChange={e => setNewTest({ ...newTest, maxAttempts: parseInt(e.target.value) })}
                                    >
                                        <option value={1}>1 Attempt</option>
                                        <option value={2}>2 Attempts</option>
                                        <option value={3}>3 Attempts</option>
                                        <option value={5}>5 Attempts</option>
                                        <option value={-1}>Unlimited</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label"><AlertTriangle size={14} style={{ marginRight: '0.5rem' }} /> Max Tab Switches (Violations)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="20"
                                        value={newTest.maxTabSwitches}
                                        onChange={e => setNewTest({ ...newTest, maxTabSwitches: parseInt(e.target.value) })}
                                    />
                                    <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Test auto-submits if exceeded</small>
                                </div>
                                <div className="form-group">
                                    <label className="form-label"><Calendar size={14} style={{ marginRight: '0.5rem' }} /> Start Time</label>
                                    <input
                                        type="datetime-local"
                                        value={newTest.startTime}
                                        onChange={e => setNewTest({ ...newTest, startTime: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label"><Calendar size={14} style={{ marginRight: '0.5rem' }} /> End Time (Deadline)</label>
                                    <input
                                        type="datetime-local"
                                        value={newTest.deadline}
                                        onChange={e => setNewTest({ ...newTest, deadline: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Difficulty</label>
                                    <select
                                        value={newTest.difficulty}
                                        onChange={e => setNewTest({ ...newTest, difficulty: e.target.value })}
                                    >
                                        <option value="Easy">Easy</option>
                                        <option value="Medium">Medium</option>
                                        <option value="Hard">Hard</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Passing Score (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={newTest.passingScore}
                                        onChange={e => setNewTest({ ...newTest, passingScore: parseInt(e.target.value) })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label"><Settings size={14} style={{ marginRight: '0.5rem' }} /> Test Status</label>
                                    <select
                                        value={newTest.status}
                                        onChange={e => setNewTest({ ...newTest, status: e.target.value })}
                                    >
                                        <option value="live">Live - Visible to students</option>
                                        <option value="ended">Ended - Hidden from students</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <label className="form-label"><FileText size={14} style={{ marginRight: '0.5rem' }} /> Description (Optional)</label>
                                <textarea
                                    placeholder="Brief description of the test..."
                                    value={newTest.description}
                                    onChange={e => setNewTest({ ...newTest, description: e.target.value })}
                                    rows={3}
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
                            </div>

                            {/* AI Question Generation */}
                            <div style={{
                                background: 'var(--secondary-alpha)',
                                border: '1px solid var(--secondary)',
                                borderRadius: '12px',
                                padding: '1.5rem',
                                marginBottom: '1.5rem'
                            }}>
                                <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem', color: 'var(--text-primary)' }}>
                                    <Sparkles size={18} color="var(--secondary)" /> AI Question Generator
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '1rem', alignItems: 'end' }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">TOPIC</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., Number Series, Logical Reasoning..."
                                            value={aiPrompt.topic}
                                            onChange={e => setAiPrompt({ ...aiPrompt, topic: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">DIFFICULTY</label>
                                        <select
                                            value={aiPrompt.difficulty}
                                            onChange={e => setAiPrompt({ ...aiPrompt, difficulty: e.target.value })}
                                        >
                                            <option value="Easy">Easy</option>
                                            <option value="Medium">Medium</option>
                                            <option value="Hard">Hard</option>
                                        </select>
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">COUNT</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="20"
                                            value={aiPrompt.count}
                                            onChange={e => setAiPrompt({ ...aiPrompt, count: parseInt(e.target.value) })}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleGenerateQuestions}
                                        disabled={isGenerating}
                                        style={{
                                            padding: '0.75rem 1.5rem',
                                            background: 'var(--primary)',
                                            border: 'none',
                                            borderRadius: '8px',
                                            color: 'white',
                                            fontWeight: 600,
                                            cursor: isGenerating ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem'
                                        }}
                                    >
                                        <Sparkles size={16} />
                                        {isGenerating ? 'Generating...' : 'Generate'}
                                    </button>
                                </div>

                                {/* Generated Questions Preview */}
                                {generatedQuestions.length > 0 && (
                                    <div style={{ marginTop: '1rem' }}>
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: '0.5rem'
                                        }}>
                                            <span style={{ fontSize: '0.9rem', color: 'var(--secondary)', fontWeight: 600 }}>
                                                ✨ Generated {generatedQuestions.length} questions
                                            </span>
                                            <button
                                                type="button"
                                                onClick={addGeneratedQuestions}
                                                style={{
                                                    padding: '0.5rem 1rem',
                                                    background: 'var(--success-alpha)',
                                                    border: '1px solid var(--success)',
                                                    borderRadius: '6px',
                                                    color: 'var(--success)',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Add All to Test
                                            </button>
                                        </div>
                                        <div style={{
                                            maxHeight: '150px',
                                            overflowY: 'auto',
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: '8px',
                                            padding: '0.75rem'
                                        }}>
                                            {generatedQuestions.map((q, idx) => (
                                                <div key={idx} style={{
                                                    padding: '0.5rem',
                                                    borderBottom: idx < generatedQuestions.length - 1 ? '1px solid var(--border-color)' : 'none',
                                                    fontSize: '0.85rem',
                                                    color: 'var(--text-primary)'
                                                }}>
                                                    Q{idx + 1}: {q.question.substring(0, 80)}...
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Questions Section */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: '1.25rem',
                                    paddingBottom: '0.75rem',
                                    borderBottom: '1px solid var(--border-color)'
                                }}>
                                    <h4 style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        margin: 0,
                                        color: 'var(--text-primary)',
                                        fontSize: '1rem',
                                        fontWeight: 600
                                    }}>
                                        <HelpCircle size={18} style={{ color: 'var(--primary)' }} /> Questions
                                    </h4>
                                    <span style={{
                                        fontSize: '0.8rem',
                                        color: 'var(--primary)',
                                        background: 'var(--primary-alpha)',
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '20px',
                                        fontWeight: 500
                                    }}>
                                        {newTest.questions.length} question{newTest.questions.length !== 1 ? 's' : ''}
                                    </span>
                                </div>

                                {/* Questions List - Each as editable card */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    {newTest.questions.map((q, idx) => (
                                        <div key={idx} style={{
                                            background: 'var(--bg-card)',
                                            borderRadius: '16px',
                                            padding: '1.5rem',
                                            border: '1px solid var(--border-color)',
                                            boxShadow: 'var(--card-shadow)',
                                            transition: 'all 0.2s ease'
                                        }}>
                                            {/* Question Header */}
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                marginBottom: '1.25rem'
                                            }}>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.75rem'
                                                }}>
                                                    <span style={{
                                                        background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                                                        color: 'white',
                                                        padding: '0.4rem 0.8rem',
                                                        borderRadius: '8px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        letterSpacing: '0.5px',
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        Q{idx + 1}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeQuestion(idx)}
                                                    style={{
                                                        background: 'var(--danger-alpha)',
                                                        border: '1px solid var(--danger)',
                                                        borderRadius: '8px',
                                                        padding: '0.5rem',
                                                        cursor: 'pointer',
                                                        color: 'var(--danger)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseOver={e => {
                                                        e.currentTarget.style.background = 'var(--danger)';
                                                        e.currentTarget.style.color = 'white';
                                                    }}
                                                    onMouseOut={e => {
                                                        e.currentTarget.style.background = 'var(--danger-alpha)';
                                                        e.currentTarget.style.color = 'var(--danger)';
                                                    }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>

                                            {/* Question Input */}
                                            <div style={{ marginBottom: '1.25rem' }}>
                                                <label style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    color: 'var(--text-muted)',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px',
                                                    marginBottom: '0.5rem',
                                                    display: 'block'
                                                }}>
                                                    Question Text
                                                </label>
                                                <input
                                                    type="text"
                                                    value={q.question}
                                                    onChange={e => {
                                                        const updated = [...newTest.questions];
                                                        updated[idx] = { ...updated[idx], question: e.target.value };
                                                        setNewTest({ ...newTest, questions: updated });
                                                    }}
                                                    placeholder="Enter your question here..."
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.875rem 1rem',
                                                        fontSize: '0.95rem',
                                                        borderRadius: '10px',
                                                        border: '2px solid var(--border-color)',
                                                        background: 'var(--bg-primary)',
                                                        color: 'var(--text-primary)',
                                                        transition: 'border-color 0.2s'
                                                    }}
                                                />
                                            </div>

                                            {/* Options Grid */}
                                            <div style={{ marginBottom: '1.25rem' }}>
                                                <label style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    color: 'var(--text-muted)',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px',
                                                    marginBottom: '0.75rem',
                                                    display: 'block'
                                                }}>
                                                    Answer Options
                                                </label>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                                                    {['A', 'B', 'C', 'D'].map((letter, optIdx) => (
                                                        <div
                                                            key={optIdx}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.75rem',
                                                                background: q.correctAnswer === optIdx ? 'var(--success-alpha)' : 'var(--bg-primary)',
                                                                padding: '0.5rem',
                                                                borderRadius: '10px',
                                                                border: q.correctAnswer === optIdx ? '2px solid var(--success)' : '2px solid var(--border-color)',
                                                                transition: 'all 0.2s'
                                                            }}
                                                        >
                                                            <span
                                                                onClick={() => {
                                                                    const updated = [...newTest.questions];
                                                                    updated[idx] = { ...updated[idx], correctAnswer: optIdx };
                                                                    setNewTest({ ...newTest, questions: updated });
                                                                }}
                                                                style={{
                                                                    width: '32px',
                                                                    height: '32px',
                                                                    borderRadius: '8px',
                                                                    background: q.correctAnswer === optIdx
                                                                        ? 'var(--success)'
                                                                        : 'var(--bg-tertiary)',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontWeight: 700,
                                                                    fontSize: '0.85rem',
                                                                    color: q.correctAnswer === optIdx ? 'white' : 'var(--text-muted)',
                                                                    flexShrink: 0,
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s',
                                                                    border: q.correctAnswer === optIdx ? 'none' : '1px solid var(--border-color)'
                                                                }}
                                                                title="Click to set as correct answer"
                                                            >{letter}</span>
                                                            <input
                                                                type="text"
                                                                value={q.options[optIdx] || ''}
                                                                onChange={e => {
                                                                    const updated = [...newTest.questions];
                                                                    const newOptions = [...updated[idx].options];
                                                                    newOptions[optIdx] = e.target.value;
                                                                    updated[idx] = { ...updated[idx], options: newOptions };
                                                                    setNewTest({ ...newTest, questions: updated });
                                                                }}
                                                                placeholder={`Option ${letter}`}
                                                                style={{
                                                                    flex: 1,
                                                                    padding: '0.625rem 0.875rem',
                                                                    borderRadius: '8px',
                                                                    border: 'none',
                                                                    background: 'transparent',
                                                                    color: 'var(--text-primary)',
                                                                    fontSize: '0.9rem'
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Correct Answer Indicator */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.75rem',
                                                padding: '0.875rem 1rem',
                                                background: 'var(--success-alpha)',
                                                borderRadius: '10px',
                                                border: '1px solid var(--success)'
                                            }}>
                                                <CheckCircle size={18} color="var(--success)" />
                                                <span style={{
                                                    fontSize: '0.875rem',
                                                    fontWeight: 500,
                                                    color: 'var(--text-primary)'
                                                }}>
                                                    Correct Answer:
                                                </span>
                                                <span style={{
                                                    background: 'var(--success)',
                                                    color: 'white',
                                                    padding: '0.375rem 0.875rem',
                                                    borderRadius: '6px',
                                                    fontWeight: 600,
                                                    fontSize: '0.85rem'
                                                }}>
                                                    Option {['A', 'B', 'C', 'D'][q.correctAnswer]}
                                                </span>
                                                <span style={{
                                                    marginLeft: 'auto',
                                                    fontSize: '0.75rem',
                                                    color: 'var(--text-muted)'
                                                }}>
                                                    Click any option badge to change
                                                </span>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Add New Question Button */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNewTest(prev => ({
                                                ...prev,
                                                questions: [...prev.questions, {
                                                    question: '',
                                                    options: ['', '', '', ''],
                                                    correctAnswer: 0,
                                                    category: 'general',
                                                    explanation: ''
                                                }]
                                            }));
                                        }}
                                        style={{
                                            padding: '1.25rem',
                                            background: 'var(--bg-card)',
                                            border: '2px dashed var(--border-color)',
                                            borderRadius: '16px',
                                            color: 'var(--text-muted)',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '0.75rem',
                                            transition: 'all 0.2s',
                                            fontSize: '0.95rem'
                                        }}
                                        onMouseOver={e => {
                                            e.currentTarget.style.borderColor = 'var(--primary)';
                                            e.currentTarget.style.color = 'var(--primary)';
                                            e.currentTarget.style.background = 'var(--primary-alpha)';
                                        }}
                                        onMouseOut={e => {
                                            e.currentTarget.style.borderColor = 'var(--border-color)';
                                            e.currentTarget.style.color = 'var(--text-muted)';
                                            e.currentTarget.style.background = 'var(--bg-card)';
                                        }}
                                    >
                                        <Plus size={20} /> Add New Question
                                    </button>
                                </div>
                            </div>

                            <div className="form-actions" style={{
                                borderTop: '1px solid var(--border-color)',
                                paddingTop: '1.5rem',
                                marginTop: '0.5rem'
                            }}>
                                <button type="button" className="btn-reset" onClick={() => setShowModal(false)}>
                                    <X size={16} /> Cancel
                                </button>
                                <button type="submit" className="btn-create-new" disabled={newTest.questions.length === 0}>
                                    <Save size={16} /> Create Test
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View Questions Modal */}
            {showQuestionsModal && selectedTest && (
                <div className="modal-overlay" onClick={() => setShowQuestionsModal(false)}>
                    <div
                        className="modal-content"
                        onClick={e => e.stopPropagation()}
                        style={{ maxWidth: '700px', maxHeight: '80vh', overflowY: 'auto' }}
                    >
                        <div className="modal-header">
                            <div className="modal-title-with-icon">
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Target size={20} color="white" />
                                </div>
                                <h2>{selectedTest.title}</h2>
                            </div>
                            <button onClick={() => setShowQuestionsModal(false)} className="modal-close">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                                {selectedTest.questionCount || selectedTest.totalQuestions} Questions • {selectedTest.duration} minutes • Pass: {selectedTest.passingScore}%
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {selectedTest.questions?.map((q, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: '12px',
                                            padding: '1.25rem',
                                            border: '1px solid var(--border-color)'
                                        }}
                                    >
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '0.75rem',
                                            marginBottom: '0.75rem'
                                        }}>
                                            <span style={{
                                                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                                color: 'white',
                                                padding: '0.25rem 0.5rem',
                                                borderRadius: '6px',
                                                fontSize: '0.8rem',
                                                fontWeight: 600
                                            }}>
                                                Q{idx + 1}
                                            </span>
                                            <span style={{ fontWeight: 500 }}>{q.question}</span>
                                        </div>
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: '1fr 1fr',
                                            gap: '0.5rem',
                                            marginLeft: '2.5rem'
                                        }}>
                                            {q.options?.map((opt, optIdx) => (
                                                <div
                                                    key={optIdx}
                                                    style={{
                                                        padding: '0.5rem 0.75rem',
                                                        background: opt === q.correctAnswer
                                                            ? 'rgba(16, 185, 129, 0.2)'
                                                            : 'rgba(71, 85, 105, 0.3)',
                                                        borderRadius: '8px',
                                                        fontSize: '0.85rem',
                                                        border: opt === q.correctAnswer
                                                            ? '1px solid #10b981'
                                                            : '1px solid transparent'
                                                    }}
                                                >
                                                    {['A', 'B', 'C', 'D'][optIdx]}. {opt}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ==================== FEATURES 39-43: ADMIN ANALYTICS DASHBOARD ====================
function AdminAnalyticsDashboard() {
    const { t } = useI18n()
    const [activeTab, setActiveTab] = useState('overview')
    const [plagiarism, setPlagiarism] = useState(null)
    const [timeToSolve, setTimeToSolve] = useState(null)
    const [topicAnalysis, setTopicAnalysis] = useState(null)
    const [loading, setLoading] = useState(true)
    const [exporting, setExporting] = useState(false)

    useEffect(() => {
        setLoading(true)
        Promise.all([
            axios.get(`${API_BASE}/analytics/plagiarism`),
            axios.get(`${API_BASE}/analytics/time-to-solve`),
            axios.get(`${API_BASE}/analytics/topics`)
        ]).then(([pRes, tRes, taRes]) => {
            setPlagiarism(pRes.data)
            setTimeToSolve(tRes.data)
            setTopicAnalysis(taRes.data)
            setLoading(false)
        }).catch(err => { console.error(err); setLoading(false) })
    }, [])

    const handleExport = async (format) => {
        setExporting(true)
        try {
            if (format === 'csv') {
                const res = await axios.get(`${API_BASE}/analytics/export/csv`, { responseType: 'blob' })
                const url = window.URL.createObjectURL(new Blob([res.data]))
                const a = document.createElement('a'); a.href = url; a.download = `platform_analytics_${new Date().toISOString().split('T')[0]}.csv`; a.click()
            } else {
                const res = await axios.get(`${API_BASE}/analytics/export/json`)
                const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = `platform_analytics_${new Date().toISOString().split('T')[0]}.json`; a.click()
            }
        } catch (err) { console.error(err) }
        setExporting(false)
    }

    if (loading) return <div className="loading-spinner"></div>

    const tabs = [
        { id: 'overview', label: t('topic_analysis'), icon: <BarChart2 size={16} /> },
        { id: 'plagiarism', label: t('plagiarism_detection'), icon: <Shield size={16} /> },
        { id: 'time-to-solve', label: t('time_to_solve'), icon: <Clock size={16} /> },
        { id: 'export', label: t('export_report'), icon: <Download size={16} /> }
    ]

    return (
        <div className="animate-fadeIn">
            {/* Tabs */}
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

            {/* TOPIC OVERVIEW TAB */}
            {activeTab === 'overview' && topicAnalysis && (
                <div>
                    {/* By Type Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        {topicAnalysis.byType.map((item, i) => (
                            <div key={i} style={{ padding: '1.5rem', borderRadius: '16px', background: 'var(--card-bg)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid var(--border-color)' }}>
                                <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem', textTransform: 'capitalize' }}>{item.type}</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', textAlign: 'center' }}>
                                    <div><div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{item.submissions}</div><div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('submissions')}</div></div>
                                    <div><div style={{ fontSize: '1.5rem', fontWeight: 800, color: item.avgScore >= 70 ? '#10b981' : '#f59e0b' }}>{item.avgScore}%</div><div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('avg_score')}</div></div>
                                    <div><div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3b82f6' }}>{item.uniqueStudents}</div><div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t('students')}</div></div>
                                </div>
                                <div style={{ marginTop: '1rem', height: '8px', borderRadius: '4px', background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${item.passRate}%`, borderRadius: '4px', background: 'linear-gradient(90deg, #10b981, #34d399)', transition: 'width 0.5s' }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    <span>{item.passRate}% {t('pass_rate')}</span>
                                    <span>{item.failRate}% {t('fail_rate')}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Difficulty + Language side by side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div className="dashboard-panel">
                            <h3 className="panel-title"><Target size={18} color="#f59e0b" /> {t('by_difficulty')}</h3>
                            {topicAnalysis.byDifficulty.map((d, i) => {
                                const colors = { easy: '#10b981', medium: '#f59e0b', hard: '#ef4444' }
                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', borderRadius: '10px', background: 'var(--bg-secondary)', marginBottom: '0.5rem' }}>
                                        <span style={{ fontWeight: 700, width: '70px', textTransform: 'capitalize', color: colors[d.difficulty] || '#3b82f6' }}>{d.difficulty}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${d.passRate}%`, borderRadius: '4px', background: colors[d.difficulty] || '#3b82f6' }} />
                                            </div>
                                        </div>
                                        <span style={{ fontWeight: 700, fontSize: '0.85rem', width: '45px', textAlign: 'right' }}>{d.avgScore}%</span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: '40px' }}>{d.submissions}</span>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="dashboard-panel">
                            <h3 className="panel-title"><Code size={18} color="#8b5cf6" /> {t('by_language')}</h3>
                            {topicAnalysis.byLanguage.map((l, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', borderRadius: '10px', background: 'var(--bg-secondary)', marginBottom: '0.5rem' }}>
                                    <span style={{ fontWeight: 700, width: '90px' }}>{l.language}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ height: '8px', borderRadius: '4px', background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${l.passRate}%`, borderRadius: '4px', background: COLORS[i % COLORS.length] }} />
                                        </div>
                                    </div>
                                    <span style={{ fontWeight: 700, fontSize: '0.85rem', width: '45px', textAlign: 'right' }}>{l.avgScore}%</span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: '40px' }}>{l.submissions}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Top Problems Table */}
                    {topicAnalysis.topProblems.length > 0 && (
                        <div className="dashboard-panel">
                            <h3 className="panel-title"><Zap size={18} color="#ef4444" /> {t('most_attempted_problems')}</h3>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead><tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                        <th style={{ textAlign: 'left', padding: '0.6rem' }}>#</th>
                                        <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('problem')}</th>
                                        <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('type')}</th>
                                        <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('difficulty')}</th>
                                        <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('attempts')}</th>
                                        <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('avg_score')}</th>
                                        <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('pass_rate')}</th>
                                    </tr></thead>
                                    <tbody>
                                        {topicAnalysis.topProblems.map((p, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '0.6rem', fontWeight: 700, color: '#3b82f6' }}>{i + 1}</td>
                                                <td style={{ padding: '0.6rem', fontWeight: 600 }}>{p.title}</td>
                                                <td style={{ padding: '0.6rem', textAlign: 'center', textTransform: 'capitalize' }}>{p.type}</td>
                                                <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                                                    <span style={{ padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600, background: p.difficulty === 'easy' ? 'rgba(16,185,129,0.12)' : p.difficulty === 'medium' ? 'rgba(251,191,36,0.12)' : 'rgba(239,68,68,0.12)', color: p.difficulty === 'easy' ? '#10b981' : p.difficulty === 'medium' ? '#f59e0b' : '#ef4444' }}>{p.difficulty}</span>
                                                </td>
                                                <td style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 600 }}>{p.attempts}</td>
                                                <td style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 700, color: p.avgScore >= 70 ? '#10b981' : '#f59e0b' }}>{p.avgScore}%</td>
                                                <td style={{ padding: '0.6rem', textAlign: 'center' }}>{p.passRate}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* PLAGIARISM TAB */}
            {activeTab === 'plagiarism' && plagiarism && (
                <div>
                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ padding: '1.25rem', borderRadius: '14px', background: 'var(--card-bg)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #3b82f6' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{t('total_submissions')}</div>
                            <div style={{ fontSize: '2rem', fontWeight: 800 }}>{plagiarism.stats.totalSubmissions}</div>
                        </div>
                        <div style={{ padding: '1.25rem', borderRadius: '14px', background: 'var(--card-bg)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #ef4444' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{t('plagiarism_flags')}</div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ef4444' }}>{plagiarism.stats.plagiarismCount}</div>
                        </div>
                        <div style={{ padding: '1.25rem', borderRadius: '14px', background: 'var(--card-bg)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #f59e0b' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{t('plagiarism_rate')}</div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f59e0b' }}>{plagiarism.stats.plagiarismRate}%</div>
                        </div>
                        <div style={{ padding: '1.25rem', borderRadius: '14px', background: 'var(--card-bg)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #8b5cf6' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{t('repeat_offenders')}</div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#8b5cf6' }}>{plagiarism.repeatOffenders.length}</div>
                        </div>
                    </div>

                    {/* Offenders + Problems side by side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div className="dashboard-panel">
                            <h3 className="panel-title" style={{ color: '#ef4444' }}><AlertTriangle size={18} /> {t('repeat_offenders')}</h3>
                            {plagiarism.repeatOffenders.length > 0 ? plagiarism.repeatOffenders.map((o, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '8px', background: 'rgba(239,68,68,0.05)', marginBottom: '0.5rem' }}>
                                    <div><div style={{ fontWeight: 600 }}>{o.name}</div><div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{o.copiedFrom.slice(0, 3).join(', ')}</div></div>
                                    <span style={{ background: '#ef4444', color: '#fff', padding: '0.2rem 0.6rem', borderRadius: '20px', fontWeight: 700, fontSize: '0.8rem' }}>{o.count}x</span>
                                </div>
                            )) : <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>{t('no_offenders')}</div>}
                        </div>
                        <div className="dashboard-panel">
                            <h3 className="panel-title"><FileCode size={18} color="#f59e0b" /> {t('most_copied_problems')}</h3>
                            {plagiarism.byProblem.length > 0 ? plagiarism.byProblem.map((p, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-secondary)', marginBottom: '0.5rem' }}>
                                    <div><div style={{ fontWeight: 600 }}>{p.title}</div><div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{p.difficulty}</div></div>
                                    <span style={{ fontWeight: 700, color: '#f59e0b' }}>{p.flaggedCount} flags</span>
                                </div>
                            )) : <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>{t('no_data')}</div>}
                        </div>
                    </div>

                    {/* Flagged Table */}
                    <div className="dashboard-panel">
                        <h3 className="panel-title"><Shield size={18} color="#ef4444" /> {t('all_flagged_submissions')}</h3>
                        {plagiarism.flaggedSubmissions.length > 0 ? (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead><tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                        <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('student')}</th>
                                        <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('problem')}</th>
                                        <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('language')}</th>
                                        <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('score')}</th>
                                        <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('copied_from')}</th>
                                        <th style={{ textAlign: 'right', padding: '0.6rem' }}>{t('date')}</th>
                                    </tr></thead>
                                    <tbody>
                                        {plagiarism.flaggedSubmissions.slice(0, 30).map((s, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '0.6rem', fontWeight: 600 }}>{s.studentName}</td>
                                                <td style={{ padding: '0.6rem' }}>{s.problemTitle}</td>
                                                <td style={{ padding: '0.6rem', textAlign: 'center' }}>{s.language}</td>
                                                <td style={{ padding: '0.6rem', textAlign: 'center' }}>{s.score}</td>
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
                    {/* Difficulty Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        {timeToSolve.difficultySummary.map((d, i) => {
                            const colors = { easy: { bg: 'rgba(16,185,129,0.08)', border: '#10b981' }, medium: { bg: 'rgba(251,191,36,0.08)', border: '#f59e0b' }, hard: { bg: 'rgba(239,68,68,0.08)', border: '#ef4444' } }
                            const c = colors[d.difficulty] || { bg: 'rgba(59,130,246,0.08)', border: '#3b82f6' }
                            return (
                                <div key={i} style={{ padding: '1.5rem', borderRadius: '16px', background: c.bg, border: `2px solid ${c.border}` }}>
                                    <div style={{ fontWeight: 800, fontSize: '1.2rem', textTransform: 'capitalize', color: c.border, marginBottom: '1rem' }}>{d.difficulty}</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('problems')}</div><div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{d.problems}</div></div>
                                        <div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('avg_time')}</div><div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{d.avgTimeMinutes}m</div></div>
                                        <div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('avg_attempts')}</div><div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{d.avgAttempts}</div></div>
                                        <div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('solve_rate')}</div><div style={{ fontSize: '1.5rem', fontWeight: 800, color: c.border }}>{d.avgSolveRate}%</div></div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Problem Table */}
                    <div className="dashboard-panel">
                        <h3 className="panel-title"><Clock size={18} color="#3b82f6" /> {t('all_problems_metrics')}</h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead><tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                    <th style={{ textAlign: 'left', padding: '0.6rem' }}>{t('problem')}</th>
                                    <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('type')}</th>
                                    <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('difficulty')}</th>
                                    <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('students')}</th>
                                    <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('total_attempts')}</th>
                                    <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('avg_attempts')}</th>
                                    <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('avg_time')}</th>
                                    <th style={{ textAlign: 'center', padding: '0.6rem' }}>{t('solve_rate')}</th>
                                </tr></thead>
                                <tbody>
                                    {timeToSolve.problems.map((p, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={{ padding: '0.6rem', fontWeight: 600 }}>{p.title}</td>
                                            <td style={{ padding: '0.6rem', textAlign: 'center', textTransform: 'capitalize' }}>{p.type}</td>
                                            <td style={{ padding: '0.6rem', textAlign: 'center' }}>
                                                <span style={{ padding: '0.15rem 0.5rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600, background: p.difficulty === 'easy' ? 'rgba(16,185,129,0.12)' : p.difficulty === 'medium' ? 'rgba(251,191,36,0.12)' : 'rgba(239,68,68,0.12)', color: p.difficulty === 'easy' ? '#10b981' : p.difficulty === 'medium' ? '#f59e0b' : '#ef4444' }}>{p.difficulty}</span>
                                            </td>
                                            <td style={{ padding: '0.6rem', textAlign: 'center' }}>{p.studentCount}</td>
                                            <td style={{ padding: '0.6rem', textAlign: 'center' }}>{p.totalAttempts}</td>
                                            <td style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 600 }}>{p.avgAttempts}</td>
                                            <td style={{ padding: '0.6rem', textAlign: 'center' }}>{p.avgTimeMinutes ? `${p.avgTimeMinutes}m` : '-'}</td>
                                            <td style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 700, color: p.solveRate >= 70 ? '#10b981' : p.solveRate >= 40 ? '#f59e0b' : '#ef4444' }}>{p.solveRate}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* EXPORT TAB */}
            {activeTab === 'export' && (
                <div>
                    <div className="dashboard-panel" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                        <Download size={56} color="var(--primary)" style={{ marginBottom: '1rem' }} />
                        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem' }}>{t('export_platform_analytics')}</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', maxWidth: '600px', margin: '0 auto 2rem' }}>{t('export_platform_description')}</p>
                        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <button onClick={() => handleExport('csv')} disabled={exporting} style={{
                                padding: '1rem 2.5rem', borderRadius: '14px', border: 'none', cursor: 'pointer',
                                background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 700, fontSize: '1rem',
                                opacity: exporting ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 15px rgba(16,185,129,0.3)'
                            }}>
                                <FileText size={20} /> {t('download_csv')}
                            </button>
                            <button onClick={() => handleExport('json')} disabled={exporting} style={{
                                padding: '1rem 2.5rem', borderRadius: '14px', border: 'none', cursor: 'pointer',
                                background: 'linear-gradient(135deg, #1e40af, #3b82f6)', color: '#fff', fontWeight: 700, fontSize: '1rem',
                                opacity: exporting ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 15px rgba(59,130,246,0.3)'
                            }}>
                                <Code size={20} /> {t('download_json')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default AdminPortal

