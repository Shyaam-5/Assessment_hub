import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

const card = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 16 }
const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text)' }
const btn = { padding: '10px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', background: '#2563eb', color: '#fff', fontWeight: 600 }

export default function TenantRBACManager({ user }) {
    const [orgs, setOrgs] = useState([])
    const [selectedOrg, setSelectedOrg] = useState('')
    const [permissionCatalog, setPermissionCatalog] = useState({})
    const [roles, setRoles] = useState([])
    const [message, setMessage] = useState('')

    const [orgForm, setOrgForm] = useState({
        name: '',
        code: '',
        type: 'institutional',
        dbUrl: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
    })
    const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [] })
    const [userForm, setUserForm] = useState({ name: '', email: '', password: '', roleId: '', phone: '', batch: '' })

    const headers = useMemo(() => ({ 'x-user-id': user?.id || '' }), [user?.id])

    const flatPermissions = useMemo(
        () => Object.values(permissionCatalog || {}).flatMap((arr) => arr || []),
        [permissionCatalog]
    )

    const fetchOrgs = async () => {
        const res = await axios.get(`${API_BASE}/platform/organizations`, { headers })
        setOrgs(res.data || [])
        if (!selectedOrg && res.data?.length) setSelectedOrg(res.data[0].id)
    }

    const toggleOrgStatus = async (org) => {
        try {
            await axios.patch(
                `${API_BASE}/platform/organizations/${org.id}/status`,
                { isActive: !org.is_active },
                { headers }
            )
            setMessage(`Organization ${org.name} is now ${!org.is_active ? 'active' : 'inactive'}`)
            await fetchOrgs()
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'Failed to update organization status')
        }
    }

    const fetchRoles = async (orgId) => {
        if (!orgId) return
        const res = await axios.get(`${API_BASE}/orgs/${orgId}/roles`, { headers })
        setRoles(res.data || [])
    }

    useEffect(() => {
        const boot = async () => {
            try {
                const [permRes] = await Promise.all([
                    axios.get(`${API_BASE}/rbac/permissions`),
                ])
                setPermissionCatalog(permRes.data || {})
                await fetchOrgs()
            } catch (e) {
                setMessage(e?.response?.data?.detail || 'Failed to load RBAC management')
            }
        }
        boot()
    }, [])

    useEffect(() => {
        fetchRoles(selectedOrg)
    }, [selectedOrg])

    const togglePerm = (perm) => {
        setRoleForm((p) => ({
            ...p,
            permissions: p.permissions.includes(perm)
                ? p.permissions.filter((x) => x !== perm)
                : [...p.permissions, perm],
        }))
    }

    const createOrganization = async () => {
        if (!orgForm.dbUrl.trim()) {
            setMessage('DB URL is required')
            return
        }
        try {
            await axios.post(`${API_BASE}/platform/organizations`, orgForm, { headers })
            setMessage('Organization created')
            setOrgForm({ name: '', code: '', type: 'institutional', dbUrl: '', adminName: '', adminEmail: '', adminPassword: '' })
            await fetchOrgs()
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'Organization creation failed')
        }
    }

    const createRole = async () => {
        if (!selectedOrg) return
        try {
            await axios.post(`${API_BASE}/orgs/${selectedOrg}/roles`, roleForm, { headers })
            setMessage('Role created')
            setRoleForm({ name: '', description: '', permissions: [] })
            await fetchRoles(selectedOrg)
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'Role creation failed')
        }
    }

    const createUser = async () => {
        if (!selectedOrg) return
        try {
            await axios.post(`${API_BASE}/orgs/${selectedOrg}/users`, userForm, { headers })
            setMessage('User created and assigned role')
            setUserForm({ name: '', email: '', password: '', roleId: '', phone: '', batch: '' })
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'User creation failed')
        }
    }

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            {message && <div style={{ ...card, borderColor: '#334155' }}>{message}</div>}

            <div style={card}>
                <h3 style={{ marginTop: 0 }}>1. Create Organization (Tenant)</h3>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                    <input style={input} placeholder="Organization name" value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} />
                    <input style={input} placeholder="Code (unique)" value={orgForm.code} onChange={(e) => setOrgForm({ ...orgForm, code: e.target.value })} />
                    <select style={input} value={orgForm.type} onChange={(e) => setOrgForm({ ...orgForm, type: e.target.value })}>
                        <option value="institutional">Institutional</option>
                        <option value="corporate">Corporate</option>
                    </select>
                    <input style={input} placeholder="Tenant DB URL (required)" value={orgForm.dbUrl} onChange={(e) => setOrgForm({ ...orgForm, dbUrl: e.target.value })} />
                    <input style={input} placeholder="Org Admin Name" value={orgForm.adminName} onChange={(e) => setOrgForm({ ...orgForm, adminName: e.target.value })} />
                    <input style={input} placeholder="Org Admin Email" value={orgForm.adminEmail} onChange={(e) => setOrgForm({ ...orgForm, adminEmail: e.target.value })} />
                    <input style={input} type="password" placeholder="Org Admin Password" value={orgForm.adminPassword} onChange={(e) => setOrgForm({ ...orgForm, adminPassword: e.target.value })} />
                </div>
                <div style={{ marginTop: 12 }}>
                    <button style={btn} onClick={createOrganization}>Create Organization</button>
                </div>
            </div>

            <div style={card}>
                <h3 style={{ marginTop: 0 }}>2. Select Organization</h3>
                <select style={input} value={selectedOrg} onChange={(e) => setSelectedOrg(e.target.value)}>
                    <option value="">Select organization</option>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}
                </select>
                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                    {orgs.map((o) => (
                        <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 10px' }}>
                            <div>
                                <div style={{ fontWeight: 600 }}>{o.name} ({o.code})</div>
                                <div style={{ fontSize: 12, opacity: 0.8 }}>{o.type} - {o.is_active ? 'Active' : 'Inactive'}</div>
                            </div>
                            <button
                                style={{ ...btn, background: o.is_active ? '#dc2626' : '#16a34a' }}
                                onClick={() => toggleOrgStatus(o)}
                            >
                                {o.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div style={card}>
                <h3 style={{ marginTop: 0 }}>3. Create Role with Checkbox Permissions</h3>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                    <input style={input} placeholder="Role name" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} />
                    <input style={input} placeholder="Description" value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} />
                </div>
                <div style={{ marginTop: 12, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                    {flatPermissions.map((perm) => (
                        <label key={perm} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="checkbox" checked={roleForm.permissions.includes(perm)} onChange={() => togglePerm(perm)} />
                            <span>{perm}</span>
                        </label>
                    ))}
                </div>
                <div style={{ marginTop: 12 }}>
                    <button style={btn} onClick={createRole} disabled={!selectedOrg}>Create Role</button>
                </div>
            </div>

            <div style={card}>
                <h3 style={{ marginTop: 0 }}>4. Create User and Assign Role</h3>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                    <input style={input} placeholder="User name" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
                    <input style={input} placeholder="Email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
                    <input style={input} type="password" placeholder="Password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
                    <select style={input} value={userForm.roleId} onChange={(e) => setUserForm({ ...userForm, roleId: e.target.value })}>
                        <option value="">Select role</option>
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <input style={input} placeholder="Phone (optional)" value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} />
                    <input style={input} placeholder="Batch/Dept (optional)" value={userForm.batch} onChange={(e) => setUserForm({ ...userForm, batch: e.target.value })} />
                </div>
                <div style={{ marginTop: 12 }}>
                    <button style={btn} onClick={createUser} disabled={!selectedOrg}>Create User</button>
                </div>
            </div>
        </div>
    )
}
