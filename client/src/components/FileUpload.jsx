import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { Upload, FileText, Image, File, Trash2, Download, X, Paperclip, AlertCircle, CheckCircle } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

const fileIcons = {
    pdf: { icon: FileText, color: '#ef4444' },
    csv: { icon: FileText, color: '#10b981' },
    doc: { icon: FileText, color: '#3b82f6' },
    docx: { icon: FileText, color: '#3b82f6' },
    xls: { icon: FileText, color: '#10b981' },
    xlsx: { icon: FileText, color: '#10b981' },
    ppt: { icon: FileText, color: '#f59e0b' },
    pptx: { icon: FileText, color: '#f59e0b' },
    png: { icon: Image, color: '#8b5cf6' },
    jpg: { icon: Image, color: '#8b5cf6' },
    jpeg: { icon: Image, color: '#8b5cf6' },
    gif: { icon: Image, color: '#8b5cf6' },
    zip: { icon: File, color: '#6b7280' },
    json: { icon: FileText, color: '#f59e0b' },
    txt: { icon: FileText, color: '#6b7280' },
    md: { icon: FileText, color: '#6b7280' },
}

function getFileInfo(filename) {
    const ext = (filename || '').split('.').pop().toLowerCase()
    return fileIcons[ext] || { icon: File, color: '#6b7280' }
}

function formatSize(bytes) {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function FileUpload({ entityType, entityId, uploadedBy, readOnly = false, compact = false }) {
    const [files, setFiles] = useState([])
    const [uploading, setUploading] = useState(false)
    const [dragOver, setDragOver] = useState(false)
    const [message, setMessage] = useState(null)
    const fileInputRef = useRef(null)

    const fetchFiles = async () => {
        if (!entityType || !entityId) return
        try {
            const res = await axios.get(`${API_BASE}/attachments/${entityType}/${entityId}`)
            setFiles(res.data.data || [])
        } catch (err) { console.error(err) }
    }

    useEffect(() => { fetchFiles() }, [entityType, entityId])

    const showMsg = (text, type = 'success') => { setMessage({ text, type }); setTimeout(() => setMessage(null), 3000) }

    const uploadFile = async (file) => {
        if (!file) return
        if (file.size > 50 * 1024 * 1024) return showMsg('File too large (max 50MB)', 'error')
        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('entityType', entityType)
            formData.append('entityId', entityId)
            formData.append('uploadedBy', uploadedBy)
            await axios.post(`${API_BASE}/attachments/upload`, formData)
            showMsg(`${file.name} uploaded successfully`)
            fetchFiles()
        } catch (err) {
            showMsg(err.response?.data?.error || 'Upload failed', 'error')
        }
        setUploading(false)
    }

    const deleteFile = async (id) => {
        try {
            await axios.delete(`${API_BASE}/attachments/${id}`)
            showMsg('File deleted')
            fetchFiles()
        } catch (err) { showMsg('Delete failed', 'error') }
    }

    const onDrop = (e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) uploadFile(file)
    }

    const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: compact ? '10px' : '16px', padding: compact ? '0.75rem' : '1rem' }

    return (
        <div>
            {message && (
                <div style={{ padding: '0.5rem 0.8rem', borderRadius: '8px', marginBottom: '0.5rem', background: message.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: message.type === 'error' ? '#ef4444' : '#10b981', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {message.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle size={14} />} {message.text}
                </div>
            )}

            {/* Upload Area */}
            {!readOnly && (
                <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                        ...cardStyle,
                        border: `2px dashed ${dragOver ? '#3b82f6' : 'var(--border-color)'}`,
                        background: dragOver ? 'rgba(59,130,246,0.05)' : 'transparent',
                        cursor: 'pointer', textAlign: 'center',
                        padding: compact ? '0.75rem' : '1.5rem',
                        marginBottom: compact ? '0.5rem' : '0.75rem',
                        transition: 'all 0.2s ease'
                    }}
                >
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={e => uploadFile(e.target.files[0])}
                        accept=".pdf,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.zip,.json,.txt,.md" />
                    {uploading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            <div className="loading-spinner" style={{ width: 20, height: 20 }} />
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Uploading...</span>
                        </div>
                    ) : (
                        <div>
                            <Upload size={compact ? 20 : 28} color="#3b82f6" style={{ marginBottom: compact ? '0.3rem' : '0.5rem' }} />
                            <p style={{ margin: 0, fontSize: compact ? '0.75rem' : '0.85rem', color: 'var(--text-muted)' }}>
                                {compact ? 'Click or drop file' : 'Click to upload or drag & drop files here'}
                            </p>
                            {!compact && <p style={{ margin: '0.3rem 0 0', fontSize: '0.7rem', color: 'var(--text-muted)', opacity: 0.6 }}>PDF, CSV, DOC, XLS, PPT, Images, ZIP, JSON, TXT (max 50MB)</p>}
                        </div>
                    )}
                </div>
            )}

            {/* File List */}
            {files.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.3rem' : '0.5rem' }}>
                    {files.map(file => {
                        const info = getFileInfo(file.original_name)
                        const Icon = info.icon
                        return (
                            <div key={file.id} style={{
                                display: 'flex', alignItems: 'center', gap: '0.6rem',
                                padding: compact ? '0.4rem 0.6rem' : '0.6rem 0.8rem',
                                borderRadius: '10px', border: '1px solid var(--border-color)',
                                background: 'var(--bg-card)', transition: 'background 0.2s'
                            }}>
                                <div style={{ width: compact ? 28 : 34, height: compact ? 28 : 34, borderRadius: '8px', background: `${info.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Icon size={compact ? 14 : 16} color={info.color} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: compact ? '0.75rem' : '0.8rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.original_name}</div>
                                    {!compact && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{formatSize(file.file_size)} • {new Date(file.uploaded_at).toLocaleDateString()}</div>}
                                </div>
                                <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                                    <a href={`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${file.file_url}`} target="_blank" rel="noreferrer" download
                                        style={{ padding: '0.3rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: '#3b82f6', cursor: 'pointer', display: 'flex', textDecoration: 'none' }}>
                                        <Download size={compact ? 12 : 14} />
                                    </a>
                                    {!readOnly && (
                                        <button onClick={() => deleteFile(file.id)}
                                            style={{ padding: '0.3rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'flex' }}>
                                            <Trash2 size={compact ? 12 : 14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {files.length === 0 && readOnly && (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    <Paperclip size={20} style={{ opacity: 0.3, marginBottom: '0.3rem' }} /><br />No attachments
                </div>
            )}
        </div>
    )
}
