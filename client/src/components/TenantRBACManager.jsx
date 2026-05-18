import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import readXlsxFile from 'read-excel-file/browser'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

const card = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: 16 }
const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text)' }
const btn = { padding: '10px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', background: '#2563eb', color: '#fff', fontWeight: 600 }
const muted = { color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }
const usageMetricLabels = {
    users: 'Users',
    activeUsers: 'Active users',
    tests: 'Assessments',
    submissions: 'Submissions',
    apiRequestsMonthly: 'API requests/month',
    storageMb: 'Storage MB',
}
const usageLimitFields = [
    ['maxUsers', 'Max users'],
    ['maxActiveUsers', 'Max active users'],
    ['maxTests', 'Max assessments'],
    ['maxSubmissions', 'Max submissions'],
    ['maxApiRequestsMonthly', 'Max API requests/month'],
    ['maxStorageMb', 'Max storage MB'],
]
const dangerousPermissions = new Set([
    'users.create',
    'users.update',
    'users.delete',
    'roles.create',
    'roles.update',
    'roles.delete',
    'tests.delete',
    'tests.assign',
    'proctoring.manage',
    'proctoring.override',
    'submissions.manage',
])
const normalizeHeader = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
const parseCsvRows = (text) => {
    const rows = []
    let row = []
    let cell = ''
    let inQuotes = false
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i]
        const next = text[i + 1]
        if (char === '"') {
            if (inQuotes && next === '"') {
                cell += '"'
                i += 1
            } else {
                inQuotes = !inQuotes
            }
        } else if (char === ',' && !inQuotes) {
            row.push(cell)
            cell = ''
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') i += 1
            row.push(cell)
            rows.push(row)
            row = []
            cell = ''
        } else {
            cell += char
        }
    }
    if (cell || row.length) rows.push([...row, cell])
    return rows.filter((r) => r.some((c) => String(c || '').trim()))
}

export default function TenantRBACManager({ user, superAdminOnly = false, orgAdminOnly = false }) {
    const [orgs, setOrgs] = useState([])
    const [selectedOrg, setSelectedOrg] = useState('')
    const [permissionCatalog, setPermissionCatalog] = useState({})
    const [subscriptionPlans, setSubscriptionPlans] = useState({})
    const [roles, setRoles] = useState([])
    const [orgUsers, setOrgUsers] = useState([])
    const [tenantHealth, setTenantHealth] = useState([])
    const [tenantDbHistory, setTenantDbHistory] = useState([])
    const [usageSummary, setUsageSummary] = useState([])
    const [usageLimits, setUsageLimits] = useState(null)
    const [auditEvents, setAuditEvents] = useState([])
    const [message, setMessage] = useState('')
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState('')

    const [orgForm, setOrgForm] = useState({
        name: '',
        code: '',
        subscriptionType: 'free_trial',
        dbUrl: '',
        dbSecretRef: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
    })
    const [tenantDbForm, setTenantDbForm] = useState({ dbUrl: '', dbSecretRef: '', activate: true })
    const [usageLimitForm, setUsageLimitForm] = useState({
        maxUsers: '',
        maxActiveUsers: '',
        maxTests: '',
        maxSubmissions: '',
        maxApiRequestsMonthly: '',
        maxStorageMb: '',
    })
    const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [] })
    const [editingRoleId, setEditingRoleId] = useState('')
    const [roleEditForm, setRoleEditForm] = useState({ name: '', description: '', permissions: [] })
    const [userForm, setUserForm] = useState({ name: '', email: '', password: '', roleId: '', phone: '', batch: '' })
    const [editingUserId, setEditingUserId] = useState('')
    const [userEditForm, setUserEditForm] = useState({ name: '', email: '', roleId: '', phone: '', batch: '', status: 'active' })
    const [bulkUsersText, setBulkUsersText] = useState('')
    const [bulkUsersFileName, setBulkUsersFileName] = useState('')
    const [resetPasswordFor, setResetPasswordFor] = useState(null)
    const [resetPassword, setResetPassword] = useState('')
    const [creatingOrg, setCreatingOrg] = useState(false)

    const headers = useMemo(() => {
        const h = { 'x-user-id': user?.id || '' }
        const token = localStorage.getItem('authToken') || ''
        if (token) h.Authorization = `Bearer ${token}`
        return h
    }, [user?.id])

    const modulePermissions = useMemo(() => permissionCatalog || {}, [permissionCatalog])
    const selectedOrgRecord = useMemo(
        () => orgs.find((org) => org.id === selectedOrg) || null,
        [orgs, selectedOrg],
    )
    const selectedOrgPlan = (selectedOrgRecord?.subscription_type || 'free_trial').toLowerCase()
    const allowedPermissionsForSelectedPlan = useMemo(() => {
        const perms = subscriptionPlans?.[selectedOrgPlan]?.allowedPermissions
        return new Set(Array.isArray(perms) ? perms : Object.values(modulePermissions).flatMap((arr) => arr || []))
    }, [subscriptionPlans, selectedOrgPlan, modulePermissions])
    const activeCount = orgs.filter((org) => org.is_active).length
    const inactiveCount = Math.max(0, orgs.length - activeCount)
    const pendingInvites = orgUsers.filter((orgUser) => !!orgUser.must_change_password).length
    const acceptedInvites = Math.max(0, orgUsers.length - pendingInvites)
    const inactiveUsers = orgUsers.filter((orgUser) => (orgUser.status || '').toLowerCase() === 'inactive').length
    const suspendedUsers = orgUsers.filter((orgUser) => (orgUser.status || '').toLowerCase() === 'suspended').length
    const activeUsers = Math.max(0, orgUsers.length - inactiveUsers - suspendedUsers)
    const selectedHealth = useMemo(
        () => tenantHealth.find((org) => org.id === selectedOrg) || null,
        [tenantHealth, selectedOrg],
    )
    const selectedUsage = useMemo(
        () => usageSummary.find((org) => org.id === selectedOrg || org.organizationId === selectedOrg) || null,
        [usageSummary, selectedOrg],
    )
    const recentAccessEvents = [
        ...roles.slice(0, 5).map((role) => ({
            id: `role-${role.id}`,
            label: `Role created: ${role.name}`,
            meta: `${(role.permissions || []).length} permissions enabled`,
            time: role.created_at,
        })),
        ...orgUsers.slice(0, 8).map((orgUser) => ({
            id: `user-${orgUser.id}`,
            label: `User onboarded: ${orgUser.name}`,
            meta: `${orgUser.role_name || 'Unassigned role'} - ${orgUser.must_change_password ? 'invite pending' : 'active login'}`,
            time: orgUser.created_at,
        })),
    ]
        .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0))
        .slice(0, 6)

    const fetchOrgs = async () => {
        if (orgAdminOnly) {
            const orgId = user?.organizationId || ''
            if (!orgId) {
                setOrgs([])
                setSelectedOrg('')
                setMessage('No organization is mapped to this admin account')
                return
            }
            try {
                const res = await axios.get(`${API_BASE}/orgs/${orgId}/analytics`, { headers })
                const org = res.data
                    ? {
                        id: orgId,
                        name: res.data.name || 'Organization',
                        code: res.data.code || '',
                        subscription_type: (res.data.subscription_type || 'free_trial').toLowerCase(),
                        is_active: !!res.data.is_active,
                    }
                    : null
                const scoped = org ? [org] : []
                setOrgs(scoped)
                setSelectedOrg(orgId)
                setMessage('')
            } catch (e) {
                setOrgs([])
                setSelectedOrg('')
                setMessage(e?.response?.data?.detail || 'Failed to load your organization')
            }
            return
        }

        try {
            const res = await axios.get(`${API_BASE}/platform/organizations`, { headers })
            const allOrgs = res.data || []
            setOrgs(allOrgs)
            if (!selectedOrg && allOrgs.length) setSelectedOrg(allOrgs[0].id)
        } catch (e) {
            setOrgs([])
            setMessage(e?.response?.data?.detail || 'Failed to load organizations')
        }
    }

    const fetchTenantHealth = async () => {
        if (!superAdminOnly) return
        try {
            const res = await axios.get(`${API_BASE}/platform/organizations/health`, { headers })
            setTenantHealth(res.data || [])
        } catch (e) {
            setTenantHealth([])
            if (superAdminOnly) setMessage(e?.response?.data?.detail || 'Failed to load tenant health')
        }
    }

    const fetchUsageSummary = async () => {
        if (!superAdminOnly) return
        try {
            const res = await axios.get(`${API_BASE}/platform/organizations/usage-summary`, { headers })
            setUsageSummary(res.data || [])
        } catch (e) {
            setUsageSummary([])
            setMessage(e?.response?.data?.detail || 'Failed to load usage summary')
        }
    }

    const fetchTenantDbHistory = async (orgId) => {
        if (!superAdminOnly || !orgId) return
        try {
            const res = await axios.get(`${API_BASE}/platform/organizations/${orgId}/tenant-db/history`, { headers, params: { limit: 20 } })
            setTenantDbHistory(res.data || [])
        } catch (_) {
            setTenantDbHistory([])
        }
    }

    const fetchUsageLimits = async (orgId) => {
        if (!superAdminOnly || !orgId) return
        try {
            const res = await axios.get(`${API_BASE}/platform/organizations/${orgId}/usage-limits`, { headers })
            setUsageLimits(res.data || null)
            const limits = res.data?.limits || {}
            setUsageLimitForm({
                maxUsers: limits.maxUsers ?? '',
                maxActiveUsers: limits.maxActiveUsers ?? '',
                maxTests: limits.maxTests ?? '',
                maxSubmissions: limits.maxSubmissions ?? '',
                maxApiRequestsMonthly: limits.maxApiRequestsMonthly ?? '',
                maxStorageMb: limits.maxStorageMb ?? '',
            })
        } catch (_) {
            setUsageLimits(null)
            setUsageLimitForm({ maxUsers: '', maxActiveUsers: '', maxTests: '', maxSubmissions: '', maxApiRequestsMonthly: '', maxStorageMb: '' })
        }
    }

    const retryTenantDbConnection = async () => {
        if (!selectedOrg) return
        try {
            setActionLoading('tenant-db-retry')
            const res = await axios.post(`${API_BASE}/platform/organizations/${selectedOrg}/tenant-db/retry`, {}, { headers })
            setMessage(res.data?.success ? 'Tenant DB retry succeeded' : (res.data?.readiness?.reason || 'Tenant DB retry failed'))
            await Promise.all([fetchTenantHealth(), fetchTenantDbHistory(selectedOrg)])
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'Tenant DB retry failed')
        } finally {
            setActionLoading('')
        }
    }

    const saveUsageLimits = async () => {
        if (!selectedOrg) return
        const toNumberOrNull = (value) => {
            if (value === '' || value === null || value === undefined) return null
            return Number(value)
        }
        try {
            setActionLoading('usage-limits')
            const payload = Object.fromEntries(
                Object.entries(usageLimitForm).map(([key, value]) => [key, toNumberOrNull(value)])
            )
            const res = await axios.put(`${API_BASE}/platform/organizations/${selectedOrg}/usage-limits`, payload, { headers })
            setUsageLimits(res.data || null)
            setMessage('Usage limits saved')
            await fetchUsageSummary()
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'Failed to save usage limits')
        } finally {
            setActionLoading('')
        }
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

    const fetchOrgUsers = async (orgId) => {
        if (!orgId || superAdminOnly) return
        const res = await axios.get(`${API_BASE}/orgs/${orgId}/users`, { headers })
        setOrgUsers(res.data || [])
    }

    const fetchAuditEvents = async (orgId) => {
        if (!orgId || superAdminOnly) return
        try {
            const res = await axios.get(`${API_BASE}/orgs/${orgId}/audit-events`, { headers, params: { limit: 30 } })
            setAuditEvents(res.data || [])
        } catch (_) {
            setAuditEvents([])
        }
    }

    useEffect(() => {
        const boot = async () => {
            setLoading(true)
            try {
                const [permRes, plansRes] = await Promise.all([
                    axios.get(`${API_BASE}/rbac/permissions`, { headers }),
                    axios.get(`${API_BASE}/rbac/subscription-plans`, { headers }),
                ])
                setPermissionCatalog(permRes.data || {})
                setSubscriptionPlans(plansRes.data || {})
                await fetchOrgs()
                if (superAdminOnly) await Promise.all([fetchTenantHealth(), fetchUsageSummary()])
            } catch (e) {
                setMessage(e?.response?.data?.detail || 'Failed to load RBAC management')
            } finally {
                setLoading(false)
            }
        }
        boot()
    }, [])

    useEffect(() => {
        if (superAdminOnly) return
        if (!selectedOrg) {
            setRoles([])
            setOrgUsers([])
            return
        }
        Promise.all([fetchRoles(selectedOrg), fetchOrgUsers(selectedOrg), fetchAuditEvents(selectedOrg)]).catch((e) => {
            setMessage(e?.response?.data?.detail || 'Failed to load selected organization access data')
        })
    }, [selectedOrg, superAdminOnly])

    useEffect(() => {
        if (!superAdminOnly || !selectedOrg) return
        Promise.all([fetchTenantDbHistory(selectedOrg), fetchUsageLimits(selectedOrg)]).catch(() => { })
    }, [selectedOrg, superAdminOnly])

    useEffect(() => {
        setRoleForm((prev) => ({
            ...prev,
            permissions: (prev.permissions || []).filter((perm) => allowedPermissionsForSelectedPlan.has(perm)),
        }))
        setRoleEditForm((prev) => ({
            ...prev,
            permissions: (prev.permissions || []).filter((perm) => allowedPermissionsForSelectedPlan.has(perm)),
        }))
    }, [allowedPermissionsForSelectedPlan])

    const togglePerm = (perm) => {
        if (!allowedPermissionsForSelectedPlan.has(perm)) return
        setRoleForm((p) => ({
            ...p,
            permissions: p.permissions.includes(perm)
                ? p.permissions.filter((x) => x !== perm)
                : [...p.permissions, perm],
        }))
    }

    const toggleModulePerms = (moduleKey) => {
        const perms = (modulePermissions[moduleKey] || []).filter((perm) => allowedPermissionsForSelectedPlan.has(perm))
        setRoleForm((p) => {
            const allEnabled = perms.every((perm) => p.permissions.includes(perm))
            if (allEnabled) {
                return { ...p, permissions: p.permissions.filter((perm) => !perms.includes(perm)) }
            }
            const merged = Array.from(new Set([...p.permissions, ...perms]))
            return { ...p, permissions: merged }
        })
    }

    const toggleEditPerm = (perm) => {
        if (!allowedPermissionsForSelectedPlan.has(perm)) return
        setRoleEditForm((p) => ({
            ...p,
            permissions: p.permissions.includes(perm)
                ? p.permissions.filter((x) => x !== perm)
                : [...p.permissions, perm],
        }))
    }

    const toggleEditModulePerms = (moduleKey) => {
        const perms = (modulePermissions[moduleKey] || []).filter((perm) => allowedPermissionsForSelectedPlan.has(perm))
        setRoleEditForm((p) => {
            const allEnabled = perms.every((perm) => p.permissions.includes(perm))
            if (allEnabled) {
                return { ...p, permissions: p.permissions.filter((perm) => !perms.includes(perm)) }
            }
            return { ...p, permissions: Array.from(new Set([...p.permissions, ...perms])) }
        })
    }

    const createOrganization = async () => {
        if (!orgForm.name.trim() || !orgForm.code.trim() || !orgForm.adminName.trim() || !orgForm.adminEmail.trim() || !orgForm.adminPassword.trim()) {
            setMessage('Organization name, code, admin name, admin email, and admin password are required')
            return
        }
        setCreatingOrg(true)
        try {
            const payload = {
                name: orgForm.name,
                code: orgForm.code,
                subscriptionType: orgForm.subscriptionType,
                adminName: orgForm.adminName,
                adminEmail: orgForm.adminEmail,
                adminPassword: orgForm.adminPassword,
                dbUrl: orgForm.dbUrl.trim() || null,
                dbSecretRef: orgForm.dbSecretRef.trim() || null,
            }
            const res = await axios.post(`${API_BASE}/platform/organizations`, payload, { headers })
            const configured = !!res?.data?.tenantDbConfigured
            setMessage(
                configured
                    ? 'Organization created and tenant DB configured'
                    : 'Organization created. Configure tenant DB from Tenant DB Setup before creating tenant users.'
            )
            setOrgForm({ name: '', code: '', subscriptionType: 'free_trial', dbUrl: '', dbSecretRef: '', adminName: '', adminEmail: '', adminPassword: '' })
            await fetchOrgs()
            if (superAdminOnly) await Promise.all([fetchTenantHealth(), fetchUsageSummary()])
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'Organization creation failed')
        } finally {
            setCreatingOrg(false)
        }
    }

    const configureTenantDb = async () => {
        if (!selectedOrg) return
        if (!tenantDbForm.dbUrl.trim() && !tenantDbForm.dbSecretRef.trim()) {
            setMessage('Tenant DB URL or secret reference is required for configuration')
            return
        }
        try {
            setActionLoading('tenant-db')
            await axios.post(
                `${API_BASE}/orgs/${selectedOrg}/tenant-db`,
                {
                    dbUrl: tenantDbForm.dbUrl.trim() || null,
                    dbSecretRef: tenantDbForm.dbSecretRef.trim() || null,
                    activate: tenantDbForm.activate
                },
                { headers }
            )
            setMessage('Tenant DB configured successfully')
            setTenantDbForm({ dbUrl: '', dbSecretRef: '', activate: true })
            await fetchOrgs()
            if (superAdminOnly) await Promise.all([fetchTenantHealth(), fetchTenantDbHistory(selectedOrg)])
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'Tenant DB configuration failed')
        } finally {
            setActionLoading('')
        }
    }

    const createRole = async () => {
        if (!selectedOrg) return
        if (!roleForm.name.trim()) {
            setMessage('Role name is required')
            return
        }
        if (roleForm.permissions.length === 0) {
            setMessage('Select at least one permission for this role')
            return
        }
        try {
            setActionLoading('role')
            await axios.post(`${API_BASE}/orgs/${selectedOrg}/roles`, roleForm, { headers })
            setMessage('Role created')
            setRoleForm({ name: '', description: '', permissions: [] })
            await fetchRoles(selectedOrg)
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'Role creation failed')
        } finally {
            setActionLoading('')
        }
    }

    const beginEditRole = (role) => {
        setEditingRoleId(role.id)
        setRoleEditForm({
            name: role.name || '',
            description: role.description || '',
            permissions: [...(role.permissions || [])],
        })
    }

    const updateRole = async () => {
        if (!selectedOrg || !editingRoleId) return
        if (roleEditForm.permissions.length === 0) {
            setMessage('Select at least one permission for this role')
            return
        }
        const currentRole = roles.find((role) => role.id === editingRoleId)
        const removedDangerous = (currentRole?.permissions || []).filter((perm) => dangerousPermissions.has(perm) && !roleEditForm.permissions.includes(perm))
        if (removedDangerous.length > 0) {
            const ok = window.confirm(
                `You are removing production-sensitive permissions from "${currentRole?.name || 'this role'}":\n\n${removedDangerous.join(', ')}\n\nUsers with this role may immediately lose access. Continue?`
            )
            if (!ok) return
        }
        try {
            setActionLoading(`role-edit-${editingRoleId}`)
            await axios.put(`${API_BASE}/orgs/${selectedOrg}/roles/${editingRoleId}`, roleEditForm, { headers })
            setMessage('Role updated')
            setEditingRoleId('')
            setRoleEditForm({ name: '', description: '', permissions: [] })
            await fetchRoles(selectedOrg)
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'Role update failed')
        } finally {
            setActionLoading('')
        }
    }

    const deleteRole = async (role) => {
        if (!selectedOrg || !role?.id) return
        if (!window.confirm(`Delete role "${role.name}"? Users must be moved to another role first.`)) return
        try {
            setActionLoading(`role-delete-${role.id}`)
            await axios.delete(`${API_BASE}/orgs/${selectedOrg}/roles/${role.id}`, { headers })
            setMessage('Role deleted')
            await fetchRoles(selectedOrg)
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'Role delete failed')
        } finally {
            setActionLoading('')
        }
    }

    const createUser = async () => {
        if (!selectedOrg) return
        if (!userForm.name.trim() || !userForm.email.trim() || !userForm.password.trim() || !userForm.roleId) {
            setMessage('User name, email, password, and role are required')
            return
        }
        try {
            setActionLoading('user')
            await axios.post(`${API_BASE}/orgs/${selectedOrg}/users`, userForm, { headers })
            setMessage('User created and assigned role')
            setUserForm({ name: '', email: '', password: '', roleId: '', phone: '', batch: '' })
            await fetchOrgUsers(selectedOrg)
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'User creation failed')
        } finally {
            setActionLoading('')
        }
    }

    const beginEditUser = (orgUser) => {
        setEditingUserId(orgUser.id)
        setUserEditForm({
            name: orgUser.name || '',
            email: orgUser.email || '',
            roleId: orgUser.role_id || '',
            phone: orgUser.phone || '',
            batch: orgUser.batch || '',
            status: orgUser.status || 'active',
        })
    }

    const updateUser = async () => {
        if (!selectedOrg || !editingUserId) return
        if (!userEditForm.name.trim() || !userEditForm.email.trim() || !userEditForm.roleId) {
            setMessage('User name, email, and role are required')
            return
        }
        try {
            setActionLoading(`user-edit-${editingUserId}`)
            await axios.put(`${API_BASE}/orgs/${selectedOrg}/users/${editingUserId}`, userEditForm, { headers })
            setMessage('User updated')
            setEditingUserId('')
            setUserEditForm({ name: '', email: '', roleId: '', phone: '', batch: '', status: 'active' })
            await fetchOrgUsers(selectedOrg)
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'User update failed')
        } finally {
            setActionLoading('')
        }
    }

    const deactivateUser = async (orgUser) => {
        if (!selectedOrg || !orgUser?.id) return
        if (!window.confirm(`Deactivate ${orgUser.name}? They will no longer be able to sign in.`)) return
        try {
            setActionLoading(`user-delete-${orgUser.id}`)
            await axios.delete(`${API_BASE}/orgs/${selectedOrg}/users/${orgUser.id}`, { headers })
            setMessage('User deactivated')
            await fetchOrgUsers(selectedOrg)
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'User deactivate failed')
        } finally {
            setActionLoading('')
        }
    }

    const parseBulkUsers = () => {
        const rows = parseCsvRows(bulkUsersText)
        if (rows.length < 2) return []
        const headers = rows[0].map((h) => normalizeHeader(h))
        return rows.slice(1).map((values) => {
            const row = {}
            headers.forEach((header, index) => { row[header] = String(values[index] || '').trim() })
            const roleValue = row.role || row.rolename || row.roleid || ''
            const roleMatch = roles.find((role) => role.id === row.roleid || role.name.toLowerCase() === roleValue.toLowerCase())
            return {
                name: row.name,
                email: row.email,
                password: row.password,
                roleId: row.roleid || roleMatch?.id || '',
                phone: row.phone || '',
                batch: row.batch || row.department || '',
            }
        })
    }

    const handleBulkUsersFile = async (event) => {
        const file = event.target.files?.[0]
        if (!file) return
        try {
            const ext = (file.name.split('.').pop() || '').toLowerCase()
            let rows = []
            if (ext === 'xlsx') {
                rows = await readXlsxFile(file)
            } else if (ext === 'csv') {
                rows = parseCsvRows(await file.text())
            } else {
                setMessage('Upload a CSV or XLSX user file')
                return
            }
            if (!rows || rows.length < 2) {
                setMessage('The uploaded file has no user rows')
                return
            }
            const csvText = rows
                .map((row) => row.map((cell) => {
                    const value = String(cell ?? '').replaceAll('"', '""')
                    return value.includes(',') || value.includes('\n') ? `"${value}"` : value
                }).join(','))
                .join('\n')
            setBulkUsersText(csvText)
            setBulkUsersFileName(file.name)
            setMessage(`Loaded ${Math.max(0, rows.length - 1)} users from ${file.name}. Review, then click Import Users.`)
        } catch (e) {
            setMessage(e?.message || 'Failed to read user upload file')
        } finally {
            event.target.value = ''
        }
    }

    const bulkCreateUsers = async () => {
        if (!selectedOrg) return
        const users = parseBulkUsers()
        if (users.length === 0) {
            setMessage('Paste CSV rows with headers: name,email,password,role or roleId,phone,batch')
            return
        }
        try {
            setActionLoading('bulk-users')
            const res = await axios.post(`${API_BASE}/orgs/${selectedOrg}/users/bulk`, { users }, { headers })
            setMessage(`Bulk import finished. Created: ${res.data.created || 0}, Failed: ${res.data.failed || 0}`)
            setBulkUsersText('')
            setBulkUsersFileName('')
            await fetchOrgUsers(selectedOrg)
            await fetchAuditEvents(selectedOrg)
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'Bulk user import failed')
        } finally {
            setActionLoading('')
        }
    }

    const resetUserPassword = async () => {
        if (!selectedOrg || !resetPasswordFor) return
        if (!resetPassword || resetPassword.length < 6) {
            setMessage('Temporary password must be at least 6 characters')
            return
        }
        try {
            setActionLoading(`reset-${resetPasswordFor.id}`)
            await axios.post(
                `${API_BASE}/orgs/${selectedOrg}/users/${resetPasswordFor.id}/reset-password`,
                { newPassword: resetPassword, sendEmail: true },
                { headers },
            )
            setMessage('Password reset and reinvite sent')
            setResetPasswordFor(null)
            setResetPassword('')
            await fetchOrgUsers(selectedOrg)
            await fetchAuditEvents(selectedOrg)
        } catch (e) {
            setMessage(e?.response?.data?.detail || 'Password reset failed')
        } finally {
            setActionLoading('')
        }
    }

    if (loading) {
        return (
            <div style={{ ...card, display: 'grid', placeItems: 'center', minHeight: 160 }}>
                <div className="loading-spinner" />
            </div>
        )
    }

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            {message && <div style={{ ...card, borderColor: '#334155' }}>{message}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div style={card}>
                    <div style={muted}>Organizations</div>
                    <div style={{ fontSize: 28, fontWeight: 800 }}>{orgs.length}</div>
                </div>
                <div style={card}>
                    <div style={muted}>Active</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{activeCount}</div>
                </div>
                <div style={card}>
                    <div style={muted}>Inactive / Setup Needed</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b' }}>{inactiveCount}</div>
                </div>
                {!superAdminOnly && (
                    <div style={card}>
                        <div style={muted}>Roles / Users</div>
                        <div style={{ fontSize: 28, fontWeight: 800 }}>{roles.length} / {orgUsers.length}</div>
                    </div>
                )}
            </div>

            {superAdminOnly && (
                <div style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                            <h3 style={{ margin: 0 }}>Tenant Health Monitor</h3>
                            <div style={muted}>Real-time readiness check for each organization's tenant database.</div>
                        </div>
                        <button style={{ ...btn, background: '#334155' }} onClick={fetchTenantHealth}>Refresh Health</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
                        {tenantHealth.length === 0 ? (
                            <div style={muted}>No tenant health data available yet.</div>
                        ) : tenantHealth.map((org) => (
                            <div key={org.id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                                    <strong>{org.name}</strong>
                                    <span style={{ color: org.ok ? '#16a34a' : '#f59e0b', fontWeight: 700 }}>
                                        {org.ok ? 'Healthy' : 'Action needed'}
                                    </span>
                                </div>
                                <div style={{ ...muted, marginTop: 6 }}>{org.code} - {org.dbMode === 'secret_ref' ? 'Secret managed' : org.dbMode === 'direct_url' ? 'Direct URL' : 'DB missing'}</div>
                                <div style={{ ...muted, marginTop: 6 }}>
                                    DB ready: {org.dbReady ? 'Yes' : 'No'} - Users table: {org.hasUsersTable ? 'Ready' : 'Missing'}
                                </div>
                                {!org.ok && <div style={{ marginTop: 8, color: '#f59e0b', fontSize: 13 }}>{org.reason}</div>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {superAdminOnly && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                    <div style={card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>Tenant DB Retry & History</h3>
                                <div style={muted}>Manual retry plus the latest connection attempts for the selected organization.</div>
                            </div>
                            <button
                                style={{ ...btn, background: '#0f766e' }}
                                onClick={retryTenantDbConnection}
                                disabled={!selectedOrg || actionLoading === 'tenant-db-retry'}
                            >
                                {actionLoading === 'tenant-db-retry' ? 'Retrying...' : 'Retry Connection'}
                            </button>
                        </div>
                        <div style={{ marginTop: 12, border: '1px solid var(--border-color)', borderRadius: 10, padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                <strong>{selectedOrgRecord?.name || 'Select an organization'}</strong>
                                {selectedHealth && (
                                    <span style={{ color: selectedHealth.ok ? '#16a34a' : '#f59e0b', fontWeight: 700 }}>
                                        {selectedHealth.ok ? 'Healthy' : 'Action needed'}
                                    </span>
                                )}
                            </div>
                            <div style={{ ...muted, marginTop: 6 }}>
                                {selectedHealth
                                    ? `${selectedHealth.dbMode === 'secret_ref' ? 'Secret managed' : selectedHealth.dbMode === 'direct_url' ? 'Direct URL' : 'DB missing'} - ${selectedHealth.reason || 'No details'}`
                                    : 'Health details appear after selecting an organization.'}
                            </div>
                        </div>
                        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                            {tenantDbHistory.length === 0 ? (
                                <div style={muted}>No tenant DB events recorded yet.</div>
                            ) : tenantDbHistory.map((event) => (
                                <div key={event.id} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                        <strong>{String(event.event_source || 'check').replaceAll('_', ' ')}</strong>
                                        <span style={{ color: event.status === 'SUCCESS' ? '#16a34a' : '#f59e0b', fontSize: 12, fontWeight: 700 }}>
                                            {event.status || 'UNKNOWN'}
                                        </span>
                                    </div>
                                    <div style={muted}>
                                        {event.db_mode || 'unknown mode'} - DB ready: {event.db_ready ? 'Yes' : 'No'} - Users table: {event.has_users_table ? 'Ready' : 'Missing'}
                                    </div>
                                    {event.message && <div style={{ ...muted, marginTop: 4 }}>{event.message}</div>}
                                    <div style={{ ...muted, marginTop: 4 }}>{event.created_at ? new Date(event.created_at).toLocaleString() : 'recent'}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>Platform Usage Limits</h3>
                                <div style={muted}>Set tenant caps. Leave a field empty for unlimited.</div>
                            </div>
                            <button
                                style={btn}
                                onClick={saveUsageLimits}
                                disabled={!selectedOrg || actionLoading === 'usage-limits'}
                            >
                                {actionLoading === 'usage-limits' ? 'Saving...' : 'Save Limits'}
                            </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 12 }}>
                            {usageLimitFields.map(([field, label]) => (
                                <label key={field} style={{ display: 'grid', gap: 6 }}>
                                    <span style={muted}>{label}</span>
                                    <input
                                        style={input}
                                        type="number"
                                        min="0"
                                        placeholder="Unlimited"
                                        value={usageLimitForm[field]}
                                        onChange={(e) => setUsageLimitForm({ ...usageLimitForm, [field]: e.target.value })}
                                    />
                                </label>
                            ))}
                        </div>
                        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                            {(usageLimits?.status?.items || selectedUsage?.status?.items || []).length === 0 ? (
                                <div style={muted}>Usage status appears after selecting an organization.</div>
                            ) : (usageLimits?.status?.items || selectedUsage?.status?.items || []).map((item) => (
                                <div key={item.key} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                        <strong>{usageMetricLabels[item.key] || item.key}</strong>
                                        <span style={{ color: item.status === 'over' ? '#ef4444' : item.status === 'warning' ? '#f59e0b' : '#16a34a', fontWeight: 700 }}>
                                            {item.status === 'unlimited' ? 'Unlimited' : item.status}
                                        </span>
                                    </div>
                                    <div style={muted}>
                                        Used {item.used || 0} / {item.limit ?? 'Unlimited'}{item.percent !== null && item.percent !== undefined ? ` (${item.percent}%)` : ''}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {superAdminOnly && (
                <div style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                            <h3 style={{ margin: 0 }}>Platform Usage Summary</h3>
                            <div style={muted}>Production view of tenant consumption against configured limits.</div>
                        </div>
                        <button style={{ ...btn, background: '#334155' }} onClick={fetchUsageSummary}>Refresh Usage</button>
                    </div>
                    <div style={{ marginTop: 12, overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                            <thead>
                                <tr>
                                    {['Organization', 'Status', 'Users', 'Assessments', 'Submissions', 'API/month', 'Storage'].map((h) => (
                                        <th key={h} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {usageSummary.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" style={{ padding: '10px 8px', color: 'var(--text-muted)' }}>No usage summary available yet.</td>
                                    </tr>
                                ) : usageSummary.map((org) => {
                                    const items = Object.fromEntries((org.status?.items || []).map((item) => [item.key, item]))
                                    const cell = (key) => {
                                        const item = items[key] || {}
                                        return `${item.used ?? 0} / ${item.limit ?? 'Unlimited'}`
                                    }
                                    return (
                                        <tr key={org.organizationId || org.id}>
                                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                                <div style={{ fontWeight: 700 }}>{org.name}</div>
                                                <div style={muted}>{org.code || 'No code'}</div>
                                            </td>
                                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                                <span style={{ color: org.status?.overLimit ? '#ef4444' : '#16a34a', fontWeight: 700 }}>
                                                    {org.status?.overLimit ? 'Over limit' : 'Within limit'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>{cell('users')}</td>
                                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>{cell('tests')}</td>
                                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>{cell('submissions')}</td>
                                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>{cell('apiRequestsMonthly')}</td>
                                            <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>{cell('storageMb')}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {orgAdminOnly && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.8fr) minmax(0, 1.2fr)', gap: 16 }}>
                    <div style={card}>
                        <h3 style={{ marginTop: 0 }}>User Activity Status</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                            <div>
                                <div style={muted}>Active users</div>
                                <div style={{ fontSize: 26, fontWeight: 800, color: '#16a34a' }}>{activeUsers}</div>
                            </div>
                            <div>
                                <div style={muted}>Pending first login</div>
                                <div style={{ fontSize: 26, fontWeight: 800, color: '#f59e0b' }}>{pendingInvites}</div>
                            </div>
                            <div>
                                <div style={muted}>Accepted login</div>
                                <div style={{ fontSize: 26, fontWeight: 800 }}>{acceptedInvites}</div>
                            </div>
                            <div>
                                <div style={muted}>Inactive / suspended</div>
                                <div style={{ fontSize: 26, fontWeight: 800, color: '#ef4444' }}>{inactiveUsers + suspendedUsers}</div>
                            </div>
                        </div>
                        <p style={{ ...muted, marginBottom: 0 }}>Status is based on account state, invite acceptance, and recent audit activity.</p>
                    </div>
                    <div style={card}>
                        <h3 style={{ marginTop: 0 }}>Access Activity</h3>
                        {recentAccessEvents.length === 0 ? (
                            <div style={muted}>Create roles or users to see access activity here.</div>
                        ) : (
                            <div style={{ display: 'grid', gap: 8 }}>
                                {recentAccessEvents.map((event) => (
                                    <div key={event.id} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px' }}>
                                        <div style={{ fontWeight: 700 }}>{event.label}</div>
                                        <div style={muted}>{event.meta} - {event.time ? new Date(event.time).toLocaleString() : 'recent'}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!orgAdminOnly && (
            <div style={card}>
                <h3 style={{ marginTop: 0 }}>1. Create Organization (Tenant)</h3>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                    <input style={input} placeholder="Organization name" value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} />
                    <input style={input} placeholder="Code (unique)" value={orgForm.code} onChange={(e) => setOrgForm({ ...orgForm, code: e.target.value })} />
                    <select style={input} value={orgForm.subscriptionType} onChange={(e) => setOrgForm({ ...orgForm, subscriptionType: e.target.value })}>
                        {(Object.keys(subscriptionPlans).length ? Object.entries(subscriptionPlans) : [['free_trial', { label: 'Free Trial' }], ['basic', { label: 'Basic' }], ['pro', { label: 'Pro' }]]).map(([plan, meta]) => (
                            <option key={plan} value={plan}>{meta?.label || plan}</option>
                        ))}
                    </select>
                    <input style={input} placeholder="Tenant DB URL (optional at creation)" value={orgForm.dbUrl} onChange={(e) => setOrgForm({ ...orgForm, dbUrl: e.target.value })} />
                    <input style={input} placeholder="or Secret Ref (env://TENANT_DB_ORG1)" value={orgForm.dbSecretRef} onChange={(e) => setOrgForm({ ...orgForm, dbSecretRef: e.target.value })} />
                    <input style={input} placeholder="Org Admin Name" value={orgForm.adminName} onChange={(e) => setOrgForm({ ...orgForm, adminName: e.target.value })} />
                    <input style={input} placeholder="Org Admin Email" value={orgForm.adminEmail} onChange={(e) => setOrgForm({ ...orgForm, adminEmail: e.target.value })} />
                    <input style={input} type="password" placeholder="Org Admin Password" value={orgForm.adminPassword} onChange={(e) => setOrgForm({ ...orgForm, adminPassword: e.target.value })} />
                </div>
                <div style={{ marginTop: 12 }}>
                    <button style={btn} onClick={createOrganization} disabled={creatingOrg}>
                        {creatingOrg ? 'Creating...' : 'Create Organization'}
                    </button>
                </div>
            </div>
            )}

            <div style={card}>
                <h3 style={{ marginTop: 0 }}>{orgAdminOnly ? 'Tenant DB Setup' : 'Tenant DB Setup (Optional at creation)'}</h3>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10 }}>
                    Configure the tenant-owned database when ready. Prefer a secret reference such as env://TENANT_DB_ORG1 in production.
                </div>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                    <input
                        style={input}
                        placeholder="Tenant DB URL"
                        value={tenantDbForm.dbUrl}
                        onChange={(e) => setTenantDbForm({ ...tenantDbForm, dbUrl: e.target.value })}
                    />
                    <input
                        style={input}
                        placeholder="or Secret Ref (env://TENANT_DB_ORG1)"
                        value={tenantDbForm.dbSecretRef}
                        onChange={(e) => setTenantDbForm({ ...tenantDbForm, dbSecretRef: e.target.value })}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px' }}>
                        <input
                            type="checkbox"
                            checked={tenantDbForm.activate}
                            onChange={(e) => setTenantDbForm({ ...tenantDbForm, activate: e.target.checked })}
                        />
                        <span>Activate organization after DB validation</span>
                    </label>
                </div>
                <div style={{ marginTop: 12 }}>
                    <button style={btn} onClick={configureTenantDb} disabled={!selectedOrg}>
                        {actionLoading === 'tenant-db' ? 'Configuring...' : 'Configure Tenant DB'}
                    </button>
                </div>
            </div>

            <div style={card}>
                <h3 style={{ marginTop: 0 }}>{orgAdminOnly ? 'Organization' : '2. Select Organization'}</h3>
                {selectedOrgRecord && (
                    <div style={{ ...muted, marginBottom: 10 }}>
                        Selected: <strong>{selectedOrgRecord.name}</strong> - {selectedOrgRecord.is_active ? 'active' : 'inactive/setup pending'} - plan: <strong>{subscriptionPlans?.[selectedOrgPlan]?.label || selectedOrgPlan}</strong>
                    </div>
                )}
                <select style={input} value={selectedOrg} onChange={(e) => setSelectedOrg(e.target.value)}>
                    <option value="">Select organization</option>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}
                </select>
                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                    {orgs.map((o) => (
                        <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px', gap: 12, flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontWeight: 600 }}>{o.name} ({o.code})</div>
                                <div style={{ fontSize: 12, opacity: 0.8 }}>
                                    {o.is_active ? 'Active' : 'Inactive'} - {subscriptionPlans?.[(o.subscription_type || 'free_trial').toLowerCase()]?.label || (o.subscription_type || 'free_trial')}
                                </div>
                            </div>
                            {!orgAdminOnly && (
                                <button
                                    style={{ ...btn, background: o.is_active ? '#dc2626' : '#16a34a' }}
                                    onClick={() => toggleOrgStatus(o)}
                                >
                                    {o.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {!superAdminOnly && (
            <div style={card}>
                <h3 style={{ marginTop: 0 }}>{orgAdminOnly ? 'Create Role' : '3. Create Role with Checkbox Permissions'}</h3>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                    <input style={input} placeholder="Role name" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} />
                    <input style={input} placeholder="Description" value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} />
                </div>
                <div style={{ marginTop: 12, padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: 8, opacity: 0.9 }}>
                    Selected permissions: <strong>{roleForm.permissions.length}</strong>
                </div>
                <div style={{ ...muted, marginTop: 8 }}>
                    Subscription plan: <strong>{subscriptionPlans?.[selectedOrgPlan]?.label || selectedOrgPlan}</strong>
                </div>
                <div style={{ marginTop: 12, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                    {Object.keys(modulePermissions).map((moduleKey) => {
                        const perms = modulePermissions[moduleKey] || []
                        const availablePerms = perms.filter((perm) => allowedPermissionsForSelectedPlan.has(perm))
                        const disabled = availablePerms.length === 0
                        const allEnabled = availablePerms.length > 0 && availablePerms.every((perm) => roleForm.permissions.includes(perm))
                        return (
                            <label key={moduleKey} style={{ display: 'flex', gap: 8, alignItems: 'center', opacity: disabled ? 0.45 : 1 }}>
                                <input type="checkbox" checked={allEnabled} disabled={disabled} onChange={() => toggleModulePerms(moduleKey)} />
                                <span style={{ textTransform: 'capitalize' }}>{moduleKey.replaceAll('_', ' ')}</span>
                            </label>
                        )
                    })}
                </div>
                <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: 'pointer' }}>Advanced permission override</summary>
                    <div style={{ marginTop: 10, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                        {Object.values(modulePermissions).flatMap((arr) => arr || []).map((perm) => (
                            <label key={perm} style={{ display: 'flex', gap: 8, alignItems: 'center', opacity: allowedPermissionsForSelectedPlan.has(perm) ? 1 : 0.45 }}>
                                <input
                                    type="checkbox"
                                    checked={roleForm.permissions.includes(perm)}
                                    disabled={!allowedPermissionsForSelectedPlan.has(perm)}
                                    onChange={() => togglePerm(perm)}
                                />
                                <span>{perm}</span>
                            </label>
                        ))}
                    </div>
                </details>
                <div style={{ marginTop: 12 }}>
                        <button style={btn} onClick={createRole} disabled={!selectedOrg || actionLoading === 'role'}>
                        {actionLoading === 'role' ? 'Creating...' : 'Create Role'}
                    </button>
                </div>
                {roles.length > 0 && (
                    <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
                        <h4 style={{ margin: 0 }}>Existing Roles</h4>
                        {roles.map((role) => (
                            <div key={role.id} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px' }}>
                                {editingRoleId === role.id ? (
                                    <div style={{ display: 'grid', gap: 10 }}>
                                        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                                            <input
                                                style={input}
                                                value={roleEditForm.name}
                                                disabled={!!role.is_system}
                                                onChange={(e) => setRoleEditForm({ ...roleEditForm, name: e.target.value })}
                                                placeholder="Role name"
                                            />
                                            <input
                                                style={input}
                                                value={roleEditForm.description}
                                                onChange={(e) => setRoleEditForm({ ...roleEditForm, description: e.target.value })}
                                                placeholder="Description"
                                            />
                                        </div>
                                        <div style={{ ...muted }}>Selected permissions: <strong>{roleEditForm.permissions.length}</strong></div>
                                        <div style={{ ...muted }}>Subscription plan: <strong>{subscriptionPlans?.[selectedOrgPlan]?.label || selectedOrgPlan}</strong></div>
                                        {(() => {
                                            const removedDangerous = (role.permissions || []).filter((perm) => dangerousPermissions.has(perm) && !roleEditForm.permissions.includes(perm))
                                            if (removedDangerous.length === 0) return null
                                            return (
                                                <div style={{ border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 12px', color: '#f59e0b', fontSize: 13 }}>
                                                    Removing sensitive access: {removedDangerous.join(', ')}. This can immediately block users from production workflows.
                                                </div>
                                            )
                                        })()}
                                        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                                            {Object.keys(modulePermissions).map((moduleKey) => {
                                                const perms = modulePermissions[moduleKey] || []
                                                const availablePerms = perms.filter((perm) => allowedPermissionsForSelectedPlan.has(perm))
                                                const disabled = availablePerms.length === 0
                                                const allEnabled = availablePerms.length > 0 && availablePerms.every((perm) => roleEditForm.permissions.includes(perm))
                                                return (
                                                    <label key={moduleKey} style={{ display: 'flex', gap: 8, alignItems: 'center', opacity: disabled ? 0.45 : 1 }}>
                                                        <input type="checkbox" checked={allEnabled} disabled={disabled} onChange={() => toggleEditModulePerms(moduleKey)} />
                                                        <span style={{ textTransform: 'capitalize' }}>{moduleKey.replaceAll('_', ' ')}</span>
                                                    </label>
                                                )
                                            })}
                                        </div>
                                        <details>
                                            <summary style={{ cursor: 'pointer' }}>Advanced permission override</summary>
                                            <div style={{ marginTop: 10, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                                                {Object.values(modulePermissions).flatMap((arr) => arr || []).map((perm) => (
                                                    <label key={perm} style={{ display: 'flex', gap: 8, alignItems: 'center', opacity: allowedPermissionsForSelectedPlan.has(perm) ? 1 : 0.45 }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={roleEditForm.permissions.includes(perm)}
                                                            disabled={!allowedPermissionsForSelectedPlan.has(perm)}
                                                            onChange={() => toggleEditPerm(perm)}
                                                        />
                                                        <span>{perm}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </details>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            <button style={btn} onClick={updateRole} disabled={actionLoading === `role-edit-${role.id}`}>
                                                {actionLoading === `role-edit-${role.id}` ? 'Saving...' : 'Save Role'}
                                            </button>
                                            <button
                                                style={{ ...btn, background: '#475569' }}
                                                onClick={() => {
                                                    setEditingRoleId('')
                                                    setRoleEditForm({ name: '', description: '', permissions: [] })
                                                }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                            <div>
                                                <div style={{ fontWeight: 700 }}>{role.name}</div>
                                                <div style={muted}>{role.description || 'No description'} - {(role.permissions || []).length} permissions{role.is_system ? ' - system role' : ''}</div>
                                                <details style={{ marginTop: 8 }}>
                                                    <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}>Role preview</summary>
                                                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                        {(role.permissions || []).map((perm) => (
                                                            <span key={perm} style={{ fontSize: 12, padding: '4px 8px', borderRadius: 999, background: 'rgba(37,99,235,0.12)', color: '#60a5fa' }}>{perm}</span>
                                                        ))}
                                                        {(role.permissions || []).length === 0 && <span style={muted}>No features enabled.</span>}
                                                    </div>
                                                </details>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                <button style={{ ...btn, background: '#334155' }} onClick={() => beginEditRole(role)}>Edit</button>
                                                {!role.is_system && (
                                                    <button style={{ ...btn, background: '#dc2626' }} onClick={() => deleteRole(role)} disabled={actionLoading === `role-delete-${role.id}`}>
                                                        {actionLoading === `role-delete-${role.id}` ? 'Deleting...' : 'Delete'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            )}

            {!superAdminOnly && (
            <div style={card}>
                <h3 style={{ marginTop: 0 }}>{orgAdminOnly ? 'Create User and Assign Role' : '4. Create User and Assign Role'}</h3>
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
                    <button style={btn} onClick={createUser} disabled={!selectedOrg || actionLoading === 'user'}>
                        {actionLoading === 'user' ? 'Creating...' : 'Create User'}
                    </button>
                </div>
                <details style={{ marginTop: 16 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Bulk Upload Users (CSV / Excel)</summary>
                    <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                        <div style={muted}>Upload CSV/XLSX or paste CSV. Headers: name,email,password,role or roleId,phone,batch. Role can be the visible role name.</div>
                        <input
                            style={input}
                            type="file"
                            accept=".csv,.xlsx"
                            onChange={handleBulkUsersFile}
                        />
                        {bulkUsersFileName && <div style={muted}>Loaded file: <strong>{bulkUsersFileName}</strong></div>}
                        <textarea
                            style={{ ...input, minHeight: 110, fontFamily: 'monospace' }}
                            value={bulkUsersText}
                            onChange={(e) => setBulkUsersText(e.target.value)}
                            placeholder={'name,email,password,role,phone,batch\nAsha Rao,asha@example.com,Temp@123,Exam Taker,9999999999,2026'}
                        />
                        <button style={btn} onClick={bulkCreateUsers} disabled={!selectedOrg || actionLoading === 'bulk-users'}>
                            {actionLoading === 'bulk-users' ? 'Importing...' : 'Import Users'}
                        </button>
                    </div>
                </details>
                {orgUsers.length > 0 && (
                    <div style={{ marginTop: 16, overflowX: 'auto' }}>
                        <h4 style={{ margin: '0 0 10px' }}>Existing Users</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                            <thead>
                                <tr>
                                    {['Name', 'Email', 'Role', 'Status', 'Activity', 'Created', 'Actions'].map((h) => (
                                        <th key={h} style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {orgUsers.map((orgUser) => (
                                    <tr key={orgUser.id}>
                                        {editingUserId === orgUser.id ? (
                                            <>
                                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                                    <input style={input} value={userEditForm.name} onChange={(e) => setUserEditForm({ ...userEditForm, name: e.target.value })} />
                                                </td>
                                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                                    <input style={input} value={userEditForm.email} onChange={(e) => setUserEditForm({ ...userEditForm, email: e.target.value })} />
                                                    <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                                                        <input style={input} placeholder="Phone" value={userEditForm.phone} onChange={(e) => setUserEditForm({ ...userEditForm, phone: e.target.value })} />
                                                        <input style={input} placeholder="Batch/Dept" value={userEditForm.batch} onChange={(e) => setUserEditForm({ ...userEditForm, batch: e.target.value })} />
                                                    </div>
                                                </td>
                                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                                    <select style={input} value={userEditForm.roleId} onChange={(e) => setUserEditForm({ ...userEditForm, roleId: e.target.value })}>
                                                        <option value="">Select role</option>
                                                        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                                                    </select>
                                                </td>
                                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                                    <select style={input} value={userEditForm.status} onChange={(e) => setUserEditForm({ ...userEditForm, status: e.target.value })}>
                                                        <option value="active">Active</option>
                                                        <option value="inactive">Inactive</option>
                                                        <option value="suspended">Suspended</option>
                                                    </select>
                                                </td>
                                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                                    <div style={muted}>Editing</div>
                                                </td>
                                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>{orgUser.created_at ? new Date(orgUser.created_at).toLocaleDateString() : '-'}</td>
                                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        <button style={btn} onClick={updateUser} disabled={actionLoading === `user-edit-${orgUser.id}`}>
                                                            {actionLoading === `user-edit-${orgUser.id}` ? 'Saving...' : 'Save'}
                                                        </button>
                                                        <button
                                                            style={{ ...btn, background: '#475569' }}
                                                            onClick={() => {
                                                                setEditingUserId('')
                                                                setUserEditForm({ name: '', email: '', roleId: '', phone: '', batch: '', status: 'active' })
                                                            }}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>{orgUser.name}</td>
                                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                                    <div>{orgUser.email}</div>
                                                    <div style={muted}>{[orgUser.phone, orgUser.batch].filter(Boolean).join(' - ') || 'No profile details'}</div>
                                                </td>
                                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>{orgUser.role_name || 'Unassigned'}</td>
                                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                                    <span style={{ color: orgUser.status === 'inactive' || orgUser.status === 'suspended' ? '#ef4444' : '#16a34a', fontWeight: 700 }}>
                                                        {orgUser.status || 'active'}
                                                    </span>
                                                    {orgUser.must_change_password ? <div style={{ color: '#f59e0b', fontSize: 12 }}>Invite pending</div> : <div style={muted}>Invite accepted</div>}
                                                </td>
                                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                                    <div>{orgUser.last_login_at ? `Last login ${new Date(orgUser.last_login_at).toLocaleDateString()}` : 'No login yet'}</div>
                                                    <div style={muted}>
                                                        {orgUser.last_activity_at ? `${orgUser.last_activity_type || 'Activity'} - ${new Date(orgUser.last_activity_at).toLocaleString()}` : 'No audit activity'}
                                                    </div>
                                                    <div style={muted}>{orgUser.activity_count || 0} audit events</div>
                                                </td>
                                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>{orgUser.created_at ? new Date(orgUser.created_at).toLocaleDateString() : '-'}</td>
                                                <td style={{ padding: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                        <button style={{ ...btn, background: '#334155' }} onClick={() => beginEditUser(orgUser)}>Edit</button>
                                                        <button style={{ ...btn, background: '#0f766e' }} onClick={() => setResetPasswordFor(orgUser)}>Reset / Reinvite</button>
                                                        <button style={{ ...btn, background: '#dc2626' }} onClick={() => deactivateUser(orgUser)} disabled={actionLoading === `user-delete-${orgUser.id}` || orgUser.status === 'inactive'}>
                                                            {actionLoading === `user-delete-${orgUser.id}` ? 'Deactivating...' : 'Deactivate'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            )}

            {!superAdminOnly && (
                <div style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                            <h3 style={{ margin: 0 }}>Organization Audit Log</h3>
                            <div style={muted}>Recent user, role, auth, and system events for this organization.</div>
                        </div>
                        <button style={{ ...btn, background: '#334155' }} onClick={() => fetchAuditEvents(selectedOrg)} disabled={!selectedOrg}>Refresh</button>
                    </div>
                    <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                        {auditEvents.length === 0 ? (
                            <div style={muted}>No audit events found yet.</div>
                        ) : auditEvents.map((event) => (
                            <div key={event.id} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                    <strong>{event.action || event.event_type}</strong>
                                    <span style={{ color: event.status === 'SUCCESS' ? '#16a34a' : '#f59e0b', fontSize: 12, fontWeight: 700 }}>{event.status || 'UNKNOWN'}</span>
                                </div>
                                <div style={muted}>
                                    {event.event_type} - {event.resource_type || 'resource'} - {event.timestamp ? new Date(event.timestamp).toLocaleString() : 'recent'}
                                </div>
                                {event.error_message && <div style={{ color: '#ef4444', fontSize: 12 }}>{event.error_message}</div>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {resetPasswordFor && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'grid', placeItems: 'center', padding: 16 }}>
                    <div style={{ ...card, width: 'min(460px, 100%)' }}>
                        <h3 style={{ marginTop: 0 }}>Reset / Reinvite User</h3>
                        <p style={muted}>User: <strong>{resetPasswordFor.name}</strong>. They will be asked to change this temporary password after login.</p>
                        <input
                            style={input}
                            type="password"
                            value={resetPassword}
                            onChange={(e) => setResetPassword(e.target.value)}
                            placeholder="Temporary password"
                        />
                        <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button style={{ ...btn, background: '#475569' }} onClick={() => { setResetPasswordFor(null); setResetPassword('') }}>Cancel</button>
                            <button style={btn} onClick={resetUserPassword} disabled={actionLoading === `reset-${resetPasswordFor.id}`}>
                                {actionLoading === `reset-${resetPasswordFor.id}` ? 'Sending...' : 'Reset & Send'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
