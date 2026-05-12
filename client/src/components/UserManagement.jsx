import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { Users, Plus, Search, Edit, Trash2, X, Save, RefreshCw, Shield, Eye, EyeOff, Key, ChevronLeft, ChevronRight, UserPlus, UserX, Filter, Mail, Phone, Hash, CheckCircle, XCircle, AlertTriangle, Download } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '1.5rem', transition: 'all 0.3s ease' }
const inputStyle = { width: '100%', padding: '0.7rem 1rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }
const selectStyle = { ...inputStyle, cursor: 'pointer' }
const buttonPrimary = { padding: '0.6rem 1.2rem', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }
const buttonDanger = { ...buttonPrimary, background: 'linear-gradient(135deg, #ef4444, #dc2626)' }
const buttonSecondary = { ...buttonPrimary, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)' }

const statusColors = { active: '#10b981', inactive: '#f59e0b', suspended: '#ef4444' }
const roleColors = { admin: '#8b5cf6', mentor: '#3b82f6', student: '#10b981' }

export default function UserManagement() {
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [mentors, setMentors] = useState([])
    const [filters, setFilters] = useState({ role: '', status: '', search: '', batch: '' })
    const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, pages: 0 })
    const [showModal, setShowModal] = useState(false)
    const [editUser, setEditUser] = useState(null)
    const [showResetPassword, setShowResetPassword] = useState(null)
    const [newPassword, setNewPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState(null)
    const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'student', mentorId: '', batch: '', phone: '' })
    const [message, setMessage] = useState(null)

    const fetchUsers = useCallback(async (page = 1) => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ page, limit: pagination.limit })
            if (filters.role) params.set('role', filters.role)
            if (filters.status) params.set('status', filters.status)
            if (filters.search) params.set('search', filters.search)
            if (filters.batch) params.set('batch', filters.batch)

            const res = await axios.get(`${API_BASE}/admin/users?${params}`)
            setUsers(res.data.data)
            setPagination(prev => ({ ...prev, page, total: res.data.pagination.total, pages: res.data.pagination.pages }))
        } catch (err) { console.error(err) }
        setLoading(false)
    }, [filters, pagination.limit])

    const fetchMentors = async () => {
        try {
            const res = await axios.get(`${API_BASE}/users?role=mentor`)
            setMentors(Array.isArray(res.data) ? res.data : res.data.data || [])
        } catch (err) { console.error(err) }
    }

    useEffect(() => { fetchUsers(); fetchMentors() }, [])
    useEffect(() => { const timeout = setTimeout(() => fetchUsers(1), 300); return () => clearTimeout(timeout) }, [filters])

    const showMsg = (text, type = 'success') => { setMessage({ text, type }); setTimeout(() => setMessage(null), 3000) }

    const handleCreate = async () => {
        if (!formData.name || !formData.email || !formData.password) return showMsg('Name, email, and password are required', 'error')
        try {
            await axios.post(`${API_BASE}/admin/users`, formData)
            showMsg(`User ${formData.name} created successfully`)
            setShowModal(false)
            setFormData({ name: '', email: '', password: '', role: 'student', mentorId: '', batch: '', phone: '' })
            fetchUsers(pagination.page)
        } catch (err) { showMsg(err.response?.data?.error || 'Failed to create user', 'error') }
    }

    const handleUpdate = async () => {
        try {
            await axios.put(`${API_BASE}/admin/users/${editUser.id}`, formData)
            showMsg(`User ${editUser.id} updated successfully`)
            setEditUser(null); setShowModal(false)
            fetchUsers(pagination.page)
        } catch (err) { showMsg(err.response?.data?.error || 'Failed to update user', 'error') }
    }

    const handleDelete = async (userId) => {
        try {
            await axios.delete(`${API_BASE}/admin/users/${userId}`)
            showMsg(`User ${userId} deleted`)
            setDeleteConfirm(null)
            fetchUsers(pagination.page)
        } catch (err) { showMsg(err.response?.data?.error || 'Failed to delete user', 'error') }
    }

    const handleResetPassword = async (userId) => {
        if (!newPassword) return showMsg('Password cannot be empty', 'error')
        try {
            await axios.post(`${API_BASE}/admin/users/${userId}/reset-password`, { newPassword })
            showMsg('Password reset successfully')
            setShowResetPassword(null); setNewPassword('')
        } catch (err) { showMsg('Failed to reset password', 'error') }
    }

    const handleToggleStatus = async (userId, currentStatus) => {
        const next = currentStatus === 'active' ? 'suspended' : 'active'
        try {
            await axios.patch(`${API_BASE}/admin/users/${userId}/status`, { status: next })
            showMsg(`User status changed to ${next}`)
            fetchUsers(pagination.page)
        } catch (err) { showMsg('Failed to change status', 'error') }
    }

    const openEdit = (user) => {
        setEditUser(user)
        setFormData({ name: user.name, email: user.email, password: '', role: user.role, mentorId: user.mentor_id || user.mentorId || '', batch: user.batch || '', phone: user.phone || '' })
        setShowModal(true)
    }

    const openCreate = () => {
        setEditUser(null)
        setFormData({ name: '', email: '', password: '', role: 'student', mentorId: '', batch: '', phone: '' })
        setShowModal(true)
    }

    return (
        <div className="animate-fadeIn">
            {message && (
                <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999, padding: '1rem 1.5rem', borderRadius: '12px', background: message.type === 'error' ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {message.type === 'error' ? <XCircle size={18} /> : <CheckCircle size={18} />} {message.text}
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>User Management</h2>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{pagination.total} total users</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={() => fetchUsers(pagination.page)} style={buttonSecondary}><RefreshCw size={16} /> Refresh</button>
                    <button onClick={openCreate} style={buttonPrimary}><UserPlus size={16} /> Add User</button>
                </div>
            </div>

            {/* Filters */}
            <div style={{ ...cardStyle, marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '2', minWidth: '200px', position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input placeholder="Search name, email, or ID..." value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} style={{ ...inputStyle, paddingLeft: '36px' }} />
                </div>
                <select value={filters.role} onChange={e => setFilters(p => ({ ...p, role: e.target.value }))} style={{ ...selectStyle, flex: '1', minWidth: '130px' }}>
                    <option value="">All Roles</option>
                    <option value="student">Student</option>
                    <option value="mentor">Mentor</option>
                    <option value="admin">Admin</option>
                </select>
                <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} style={{ ...selectStyle, flex: '1', minWidth: '130px' }}>
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                </select>
                <input placeholder="Filter batch..." value={filters.batch} onChange={e => setFilters(p => ({ ...p, batch: e.target.value }))} style={{ ...inputStyle, flex: '1', minWidth: '120px' }} />
            </div>

            {/* Users Table */}
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center' }}><div className="loading-spinner" /></div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(59,130,246,0.05)' }}>
                                    {['ID', 'Name', 'Email', 'Role', 'Mentor', 'Batch', 'Status', 'Actions'].map(h => (
                                        <th key={h} style={{ padding: '0.8rem 1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {users.length === 0 ? (
                                    <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No users found</td></tr>
                                ) : users.map(user => (
                                    <tr key={user.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.03)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{user.id}</td>
                                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text)' }}>{user.name}</td>
                                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{user.email}</td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <span style={{ padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600, background: `${roleColors[user.role]}20`, color: roleColors[user.role] }}>{user.role}</span>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{user.mentor_id || user.mentorId || '—'}</td>
                                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{user.batch || '—'}</td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <span onClick={() => handleToggleStatus(user.id, user.status || 'active')} style={{ padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600, background: `${statusColors[user.status || 'active']}20`, color: statusColors[user.status || 'active'], cursor: 'pointer' }}>
                                                {user.status || 'active'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                <button onClick={() => openEdit(user)} title="Edit" style={{ padding: '0.4rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: '#3b82f6', cursor: 'pointer' }}><Edit size={14} /></button>
                                                <button onClick={() => setShowResetPassword(user.id)} title="Reset Password" style={{ padding: '0.4rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: '#f59e0b', cursor: 'pointer' }}><Key size={14} /></button>
                                                <button onClick={() => setDeleteConfirm(user.id)} title="Delete" style={{ padding: '0.4rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {pagination.pages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Page {pagination.page} of {pagination.pages} ({pagination.total} users)</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button disabled={pagination.page <= 1} onClick={() => fetchUsers(pagination.page - 1)} style={{ ...buttonSecondary, opacity: pagination.page <= 1 ? 0.5 : 1 }}><ChevronLeft size={16} /></button>
                            <button disabled={pagination.page >= pagination.pages} onClick={() => fetchUsers(pagination.page + 1)} style={{ ...buttonSecondary, opacity: pagination.page >= pagination.pages ? 0.5 : 1 }}><ChevronRight size={16} /></button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowModal(false)}>
                    <div style={{ ...cardStyle, width: '500px', maxHeight: '85vh', overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{editUser ? 'Edit User' : 'Create New User'}</h3>
                            <button onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Name *</label>
                                <input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="Full Name" style={inputStyle} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Email *</label>
                                <input type="email" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" style={inputStyle} />
                            </div>
                            {!editUser && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Password *</label>
                                    <div style={{ position: 'relative' }}>
                                        <input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={e => setFormData(p => ({ ...p, password: e.target.value }))} placeholder="Password" style={{ ...inputStyle, paddingRight: '40px' }} />
                                        <button onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                                    </div>
                                </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Role *</label>
                                    <select value={formData.role} onChange={e => setFormData(p => ({ ...p, role: e.target.value }))} style={selectStyle}>
                                        <option value="student">Student</option>
                                        <option value="mentor">Mentor</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Batch</label>
                                    <input value={formData.batch} onChange={e => setFormData(p => ({ ...p, batch: e.target.value }))} placeholder="e.g. 2025-A" style={inputStyle} />
                                </div>
                            </div>
                            {formData.role === 'student' && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Assign Mentor</label>
                                    <select value={formData.mentorId} onChange={e => setFormData(p => ({ ...p, mentorId: e.target.value }))} style={selectStyle}>
                                        <option value="">No Mentor</option>
                                        {mentors.map(m => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Phone</label>
                                <input value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} placeholder="+91 9876543210" style={inputStyle} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowModal(false)} style={buttonSecondary}>Cancel</button>
                            <button onClick={editUser ? handleUpdate : handleCreate} style={buttonPrimary}><Save size={16} /> {editUser ? 'Update' : 'Create'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {showResetPassword && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowResetPassword(null)}>
                    <div style={{ ...cardStyle, width: '400px' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 1rem', fontWeight: 700 }}>Reset Password</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.85rem' }}>User: <strong>{showResetPassword}</strong></p>
                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password" style={inputStyle} />
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowResetPassword(null)} style={buttonSecondary}>Cancel</button>
                            <button onClick={() => handleResetPassword(showResetPassword)} style={buttonPrimary}><Key size={16} /> Reset</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDeleteConfirm(null)}>
                    <div style={{ ...cardStyle, width: '400px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '1rem' }} />
                        <h3 style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>Delete User?</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>This will permanently delete <strong>{deleteConfirm}</strong> and all their data. This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button onClick={() => setDeleteConfirm(null)} style={buttonSecondary}>Cancel</button>
                            <button onClick={() => handleDelete(deleteConfirm)} style={buttonDanger}><Trash2 size={16} /> Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
