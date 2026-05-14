import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

const card = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 12,
    padding: 14,
}

export default function OrgTenantAnalyticsPanel({ user }) {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const headers = useMemo(() => ({ 'x-user-id': user?.id || '' }), [user?.id])
    const orgId = user?.organizationId || ''

    useEffect(() => {
        const load = async () => {
            if (!orgId) {
                setError('No organization context found for this user')
                setLoading(false)
                return
            }
            try {
                setLoading(true)
                const res = await axios.get(`${API_BASE}/orgs/${orgId}/analytics`, { headers })
                setData(res.data || null)
            } catch (e) {
                setError(e?.response?.data?.detail || 'Failed to load organization analytics')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [orgId, headers])

    if (loading) return <div>Loading organization analytics...</div>
    if (error) return <div>{error}</div>
    if (!data) return <div>No analytics data found.</div>

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            <div style={card}>
                <h3 style={{ marginTop: 0, marginBottom: 4 }}>{data.name}</h3>
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                    Code: {data.code || '-'} | Status: {data.is_active ? 'Active' : 'Inactive'}
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                <div style={card}><div>Total Active Users</div><div style={num}>{data.total_active_users ?? 0}</div></div>
                <div style={card}><div>Total Users</div><div style={num}>{data.total_users ?? 0}</div></div>
                <div style={card}><div>Total Tests Conducted</div><div style={num}>{data.total_tests_conducted ?? 0}</div></div>
                <div style={card}><div>API Requests Used</div><div style={num}>{data.total_api_requests_used ?? 0}</div></div>
            </div>
            <div style={card}>
                <h3 style={{ marginTop: 0, marginBottom: 8 }}>Recently Created Users</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={th}>Name</th>
                                <th style={th}>Role</th>
                                <th style={th}>Status</th>
                                <th style={th}>Created At</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(data.recent_users || []).map((u) => (
                                <tr key={u.id}>
                                    <td style={td}>{u.name || '-'}</td>
                                    <td style={td}>{u.role || '-'}</td>
                                    <td style={td}>{u.status || '-'}</td>
                                    <td style={td}>{u.created_at ? new Date(u.created_at).toLocaleString() : '-'}</td>
                                </tr>
                            ))}
                            {(data.recent_users || []).length === 0 && (
                                <tr>
                                    <td style={td} colSpan={4}>No users found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

const num = { fontSize: 28, fontWeight: 800, marginTop: 6 }
const th = { textAlign: 'left', borderBottom: '1px solid var(--border-color)', padding: '10px 8px', fontSize: 13 }
const td = { borderBottom: '1px solid var(--border-color)', padding: '10px 8px', fontSize: 14 }
