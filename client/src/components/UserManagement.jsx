import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { Users, Plus, Search, Edit, Trash2, X, Save, RefreshCw, Shield, Eye, EyeOff, Key, ChevronLeft, ChevronRight, UserPlus, UserX, Filter, Mail, Phone, Hash, CheckCircle, XCircle, AlertTriangle, Download } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

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
                <div className={`um-toast ${message.type}`}>
                    {message.type === 'error' ? <XCircle size={18} /> : <CheckCircle size={18} />} {message.text}
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)' }}>User Management</h2>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{pagination.total} total users</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={() => fetchUsers(pagination.page)} className="um-btn-secondary"><RefreshCw size={16} /> Refresh</button>
                    <button onClick={openCreate} className="um-btn-primary"><UserPlus size={16} /> Add User</button>
                </div>
            </div>

            {/* Filters */}
            <div className="um-card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '2', minWidth: '200px', position: 'relative' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        placeholder="Search name, email, or ID..."
                        value={filters.search}
                        onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
                        className="um-input"
                        style={{ paddingLeft: '36px' }}
                    />
                </div>
                <select value={filters.role} onChange={e => setFilters(p => ({ ...p, role: e.target.value }))} className="um-select" style={{ flex: '1', minWidth: '130px' }}>
                    <option value="">All Roles</option>
                    <option value="student">Student</option>
                    <option value="mentor">Mentor</option>
                    <option value="admin">Admin</option>
                </select>
                <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} className="um-select" style={{ flex: '1', minWidth: '130px' }}>
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                </select>
                <input
                    placeholder="Filter batch..."
                    value={filters.batch}
                    onChange={e => setFilters(p => ({ ...p, batch: e.target.value }))}
                    className="um-input"
                    style={{ flex: '1', minWidth: '120px' }}
                />
            </div>

            {/* Users Table */}
            <div className="um-card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div className="page-loading"><div className="loading-spinner" /></div>
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
                                    <tr key={user.id} className="um-table-row">
                                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{user.id}</td>
                                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-main)' }}>{user.name}</td>
                                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{user.email}</td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <span style={{ padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600, background: `${roleColors[user.role]}20`, color: roleColors[user.role] }}>{user.role}</span>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{user.mentor_id || user.mentorId || '—'}</td>
                                        <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{user.batch || '—'}</td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <span
                                                onClick={() => handleToggleStatus(user.id, user.status || 'active')}
                                                style={{ padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 600, background: `${statusColors[user.status || 'active']}20`, color: statusColors[user.status || 'active'], cursor: 'pointer' }}
                                            >
                                                {user.status || 'active'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                <button onClick={() => openEdit(user)} title="Edit" className="um-icon-btn edit"><Edit size={14} /></button>
                                                <button onClick={() => setShowResetPassword(user.id)} title="Reset Password" className="um-icon-btn key"><Key size={14} /></button>
                                                <button onClick={() => setDeleteConfirm(user.id)} title="Delete" className="um-icon-btn delete"><Trash2 size={14} /></button>
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
                            <button disabled={pagination.page <= 1} onClick={() => fetchUsers(pagination.page - 1)} className="um-btn-secondary"><ChevronLeft size={16} /></button>
                            <button disabled={pagination.page >= pagination.pages} onClick={() => fetchUsers(pagination.page + 1)} className="um-btn-secondary"><ChevronRight size={16} /></button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="um-overlay" onClick={() => setShowModal(false)}>
                    <div className="um-card um-modal" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{editUser ? 'Edit User' : 'Create New User'}</h3>
                            <button onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label className="um-form-label">Name *</label>
                                <input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="Full Name" className="um-input" />
                            </div>
                            <div>
                                <label className="um-form-label">Email *</label>
                                <input type="email" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" className="um-input" />
                            </div>
                            {!editUser && (
                                <div>
                                    <label className="um-form-label">Password *</label>
                                    <div style={{ position: 'relative' }}>
                                        <input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={e => setFormData(p => ({ ...p, password: e.target.value }))} placeholder="Password" className="um-input" style={{ paddingRight: '40px' }} />
                                        <button onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                                    </div>
                                </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label className="um-form-label">Role *</label>
                                    <select value={formData.role} onChange={e => setFormData(p => ({ ...p, role: e.target.value }))} className="um-select">
                                        <option value="student">Student</option>
                                        <option value="mentor">Mentor</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="um-form-label">Batch</label>
                                    <input value={formData.batch} onChange={e => setFormData(p => ({ ...p, batch: e.target.value }))} placeholder="e.g. 2025-A" className="um-input" />
                                </div>
                            </div>
                            {formData.role === 'student' && (
                                <div>
                                    <label className="um-form-label">Assign Mentor</label>
                                    <select value={formData.mentorId} onChange={e => setFormData(p => ({ ...p, mentorId: e.target.value }))} className="um-select">
                                        <option value="">No Mentor</option>
                                        {mentors.map(m => <option key={m.id} value={m.id}>{m.name} ({m.id})</option>)}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="um-form-label">Phone</label>
                                <input value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} placeholder="+91 9876543210" className="um-input" />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowModal(false)} className="um-btn-secondary">Cancel</button>
                            <button onClick={editUser ? handleUpdate : handleCreate} className="um-btn-primary"><Save size={16} /> {editUser ? 'Update' : 'Create'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {showResetPassword && (
                <div className="um-overlay" onClick={() => setShowResetPassword(null)}>
                    <div className="um-card um-modal-sm" onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 1rem', fontWeight: 700 }}>Reset Password</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.85rem' }}>User: <strong>{showResetPassword}</strong></p>
                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password" className="um-input" />
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowResetPassword(null)} className="um-btn-secondary">Cancel</button>
                            <button onClick={() => handleResetPassword(showResetPassword)} className="um-btn-primary"><Key size={16} /> Reset</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="um-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="um-card um-modal-sm" style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '1rem' }} />
                        <h3 style={{ margin: '0 0 0.5rem', fontWeight: 700 }}>Delete User?</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>This will permanently delete <strong>{deleteConfirm}</strong> and all their data. This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button onClick={() => setDeleteConfirm(null)} className="um-btn-secondary">Cancel</button>
                            <button onClick={() => handleDelete(deleteConfirm)} className="um-btn-danger"><Trash2 size={16} /> Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
