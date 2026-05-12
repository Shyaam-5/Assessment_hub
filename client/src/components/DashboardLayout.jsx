import { NavLink } from 'react-router-dom'
import { useAuth, useTheme } from '../App'
import { useI18n } from '../services/i18n.jsx'
import { Sun, Moon, LogOut, Menu, X, Brain, User, Globe, Wifi, WifiOff, ChevronDown } from 'lucide-react'
import { useState, useEffect } from 'react'
import './DashboardLayout.css'

function DashboardLayout({ children, navItems, title, subtitle }) {
    const { user, logout } = useAuth()
    const { theme, toggleTheme } = useTheme()
    const { t, locale, setLocale, languages } = useI18n()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [isOnline, setIsOnline] = useState(navigator.onLine)
    const [showLangMenu, setShowLangMenu] = useState(false)
    const [expandedGroups, setExpandedGroups] = useState({})

    useEffect(() => {
        const goOnline = () => setIsOnline(true)
        const goOffline = () => setIsOnline(false)
        window.addEventListener('online', goOnline)
        window.addEventListener('offline', goOffline)
        return () => {
            window.removeEventListener('online', goOnline)
            window.removeEventListener('offline', goOffline)
        }
    }, [])

    // Close sidebar on escape
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && sidebarOpen) setSidebarOpen(false)
        }
        document.addEventListener('keydown', handleEsc)
        return () => document.removeEventListener('keydown', handleEsc)
    }, [sidebarOpen])

    const toggleGroup = (groupLabel) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupLabel]: !prev[groupLabel]
        }))
    }

    return (
        <div className="dashboard-layout">
            {/* Skip to content - Accessibility */}
            <a href="#main-content" className="skip-to-content">
                {t('skip_to_content')}
            </a>

            {/* Offline Indicator */}
            {!isOnline && (
                <div role="alert" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#fff', textAlign: 'center', padding: '0.5rem 1rem',
                    fontSize: '0.85rem', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                }}>
                    <WifiOff size={16} /> {t('offline_message')}
                </div>
            )}

            {/* Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="sidebar-overlay"
                    onClick={() => setSidebarOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* Sidebar */}
            <aside
                className={`sidebar ${sidebarOpen ? 'open' : ''}`}
                role="navigation"
                aria-label={t('navigation')}
            >
                <div className="sidebar-header">
                    <div className="logo">
                        <div className="logo-icon"><Brain size={18} /></div>
                        <span className="logo-text">{t('app_name')}</span>
                    </div>
                    <button
                        className="close-sidebar"
                        onClick={() => setSidebarOpen(false)}
                        aria-label={t('close_menu')}
                    >
                        <X size={24} />
                    </button>
                </div>

                <nav className="sidebar-nav" aria-label={t('navigation')}>
                    {navItems.map((item) => {
                        // Group with children (collapsible)
                        if (item.children && item.children.length > 0) {
                            const isExpanded = expandedGroups[item.label] || item.defaultExpanded || false
                            return (
                                <div key={item.label} className="nav-group">
                                    <button
                                        className="nav-group-header"
                                        onClick={() => toggleGroup(item.label)}
                                        aria-expanded={isExpanded}
                                    >
                                        <span className="nav-group-left">
                                            {item.icon}
                                            <span>{item.label}</span>
                                        </span>
                                        <ChevronDown 
                                            size={18} 
                                            style={{
                                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                                transition: 'transform 0.2s ease'
                                            }}
                                        />
                                    </button>
                                    {isExpanded && (
                                        <div className="nav-group-items">
                                            {item.children.map((child, idx) => (
                                                <NavLink
                                                    key={idx}
                                                    to={child.path}
                                                    className={({ isActive }) => `nav-item nav-sub-item ${isActive ? 'active' : ''}`}
                                                    onClick={() => setSidebarOpen(false)}
                                                    aria-current={({ isActive }) => isActive ? 'page' : undefined}
                                                >
                                                    {child.icon}
                                                    <span>{child.label}</span>
                                                </NavLink>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        }
                        
                        // Regular item (no children)
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                                onClick={() => setSidebarOpen(false)}
                                aria-current={({ isActive }) => isActive ? 'page' : undefined}
                            >
                                {item.icon}
                                <span>{item.label}</span>
                                {item.badge > 0 && (
                                    <span style={{
                                        marginLeft: 'auto',
                                        background: '#ef4444',
                                        color: 'white',
                                        borderRadius: '50%',
                                        minWidth: '20px',
                                        height: '20px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.65rem',
                                        fontWeight: 700,
                                        padding: '0 4px',
                                        animation: 'pulse 2s infinite'
                                    }}>
                                        {item.badge > 99 ? '99+' : item.badge}
                                    </span>
                                )}
                            </NavLink>
                        )
                    })}
                </nav>

                <div className="sidebar-footer">
                    {/* Language Picker */}
                    <div style={{ position: 'relative' }}>
                        <button
                            className="theme-btn"
                            onClick={() => setShowLangMenu(!showLangMenu)}
                            aria-label="Change language"
                            aria-expanded={showLangMenu}
                        >
                            <Globe size={18} />
                            <span>{languages.find(l => l.code === locale)?.nativeName || 'English'}</span>
                        </button>
                        {showLangMenu && (
                            <div style={{
                                position: 'absolute', bottom: '100%', left: 0, right: 0,
                                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                                borderRadius: '8px', marginBottom: '4px', overflow: 'hidden',
                                boxShadow: '0 -4px 12px rgba(0,0,0,0.15)', zIndex: 100
                            }} role="listbox" aria-label="Select language">
                                {languages.map(lang => (
                                    <button
                                        key={lang.code}
                                        role="option"
                                        aria-selected={locale === lang.code}
                                        onClick={() => { setLocale(lang.code); setShowLangMenu(false) }}
                                        style={{
                                            width: '100%', padding: '0.6rem 1rem', border: 'none',
                                            background: locale === lang.code ? 'var(--primary-alpha)' : 'transparent',
                                            color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            fontSize: '0.85rem', fontWeight: locale === lang.code ? 600 : 400
                                        }}
                                    >
                                        <span>{lang.flag}</span>
                                        <span>{lang.nativeName}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        className="theme-btn"
                        onClick={toggleTheme}
                        aria-label={theme === 'light' ? t('dark_mode') : t('light_mode')}
                    >
                        {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                        <span>{theme === 'light' ? t('dark_mode') : t('light_mode')}</span>
                    </button>

                    <div className="user-info">
                        <div className="user-avatar" aria-hidden="true"><User size={18} /></div>
                        <div className="user-details">
                            <span className="user-name">{user?.name}</span>
                            <span className="user-role">{user?.role}</span>
                        </div>
                        <button
                            className="logout-btn"
                            onClick={logout}
                            title={t('logout')}
                            aria-label={t('logout')}
                        >
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content" role="main">
                <header className="content-header" role="banner">
                    <div className="header-left">
                        <button
                            className="menu-toggle"
                            onClick={() => setSidebarOpen(true)}
                            aria-label={t('open_menu')}
                            aria-expanded={sidebarOpen}
                        >
                            <Menu size={24} />
                        </button>
                        <div className="page-title">
                            <h1>{title}</h1>
                            <p>{subtitle}</p>
                        </div>
                    </div>
                    <div className="header-right">
                        {/* Online Status */}
                        <div
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.35rem',
                                fontSize: '0.8rem', color: isOnline ? 'var(--success)' : 'var(--warning)',
                                fontWeight: 500
                            }}
                            role="status"
                            aria-live="polite"
                        >
                            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
                            <span className="sr-only">{isOnline ? 'Online' : 'Offline'}</span>
                        </div>
                    </div>
                </header>

                <div className="content-body" id="main-content" tabIndex="-1">
                    {children}
                </div>
            </main>
        </div>
    )
}

export default DashboardLayout
