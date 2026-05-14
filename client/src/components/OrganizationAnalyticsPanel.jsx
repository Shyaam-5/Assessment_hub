import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

export default function OrganizationAnalyticsPanel({ user }) {
    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const headers = useMemo(() => ({ 'x-user-id': user?.id || '' }), [user?.id])

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)
                const res = await axios.get(`${API_BASE}/platform/organizations/analytics`, { headers })
                setRows(res.data || [])
            } catch (e) {
                setError(e?.response?.data?.detail || 'Failed to load organization analytics')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [headers])

    if (loading) return <div>Loading organization analytics...</div>
    if (error) return <div>{error}</div>

    const totalOrgs = rows.length
    const activeOrgs = rows.filter((r) => !!r.is_active).length
    const inactiveOrgs = totalOrgs - activeOrgs

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                <div style={kpiCard}>
                    <div style={kpiLabel}>Total Organizations</div>
                    <div style={kpiValue}>{totalOrgs}</div>
                </div>
                <div style={kpiCard}>
                    <div style={kpiLabel}>Active Organizations</div>
                    <div style={{ ...kpiValue, color: '#16a34a' }}>{activeOrgs}</div>
                </div>
                <div style={kpiCard}>
                    <div style={kpiLabel}>Inactive Organizations</div>
                    <div style={{ ...kpiValue, color: '#dc2626' }}>{inactiveOrgs}</div>
                </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 16 }}>
                <h3 style={{ marginTop: 0 }}>Organization Analytics (Count Only)</h3>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={th}>Organization</th>
                            <th style={th}>Code</th>
                            <th style={th}>Status</th>
                            <th style={th}>Total Users</th>
                            <th style={th}>Total Tests Conducted</th>
                            <th style={th}>API Requests Used</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.id}>
                                <td style={td}>{r.name}</td>
                                <td style={td}>{r.code || '-'}</td>
                                <td style={td}>{r.is_active ? 'Active' : 'Inactive'}</td>
                                <td style={td}>{r.total_users ?? 0}</td>
                                <td style={td}>{r.total_tests_conducted ?? 0}</td>
                                <td style={td}>{r.total_api_requests_used ?? 0}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            </div>
        </div>
    )
}

const kpiCard = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 12,
    padding: 14,
}

const kpiLabel = {
    fontSize: 12,
    opacity: 0.8,
}

const kpiValue = {
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 1.2,
    marginTop: 6,
}

const th = {
    textAlign: 'left',
    borderBottom: '1px solid var(--border-color)',
    padding: '10px 8px',
    fontSize: 13,
}

const td = {
    borderBottom: '1px solid var(--border-color)',
    padding: '10px 8px',
    fontSize: 14,
}
