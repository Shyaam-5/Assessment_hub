import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { MessageSquare, Send, Search, ArrowLeft, Paperclip, Clock, CheckCheck, User, Circle, X, FileText, Image as ImageIcon, Download, Users } from 'lucide-react'
import io from 'socket.io-client'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', transition: 'all 0.3s ease' }
const inputStyle = { width: '100%', padding: '0.7rem 1rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }

// Random avatar colors for contacts
const avatarColors = [
    'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    'linear-gradient(135deg, #10b981, #059669)',
    'linear-gradient(135deg, #f59e0b, #d97706)',
    'linear-gradient(135deg, #ef4444, #dc2626)',
    'linear-gradient(135deg, #ec4899, #db2777)',
    'linear-gradient(135deg, #6366f1, #4f46e5)',
    'linear-gradient(135deg, #14b8a6, #0d9488)',
    'linear-gradient(135deg, #f97316, #ea580c)',
]
const getAvatarColor = (name) => avatarColors[Math.abs((name || '').charCodeAt(0) - 65) % avatarColors.length]

export default function DirectMessaging({ currentUser }) {
    const [contacts, setContacts] = useState([]) // All available contacts (students/mentor)
    const [conversations, setConversations] = useState({}) // {userId: { last_message, last_message_time, unread }}
    const [messages, setMessages] = useState([])
    const [selectedUser, setSelectedUser] = useState(null)
    const [messageText, setMessageText] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [attachment, setAttachment] = useState(null)
    const [loading, setLoading] = useState(true)
    const [sendingMsg, setSendingMsg] = useState(false)
    const messagesEndRef = useRef(null)
    const fileInputRef = useRef(null)
    const socketRef = useRef(null)
    const userId = currentUser?.id || currentUser?.userId

    // Socket.io setup
    useEffect(() => {
        socketRef.current = io(SOCKET_URL, { transports: ['websocket'] })
        socketRef.current.on('new_message', (msg) => {
            if ((msg.senderId === selectedUser?.id && msg.receiverId === userId) ||
                (msg.senderId === userId && msg.receiverId === selectedUser?.id)) {
                setMessages(prev => [...prev, msg])
            }
            // Update conversation preview for this sender
            if (msg.senderId !== userId) {
                setConversations(prev => ({
                    ...prev,
                    [msg.senderId]: {
                        last_message: msg.message || 'Attachment',
                        last_message_time: msg.createdAt || new Date().toISOString(),
                        unread: (prev[msg.senderId]?.unread || 0) + (selectedUser?.id === msg.senderId ? 0 : 1)
                    }
                }))
            }
        })
        return () => { socketRef.current?.disconnect() }
    }, [userId, selectedUser])

    // Load contacts (students for mentor, mentor for student) + existing conversations
    const loadContacts = useCallback(async () => {
        if (!userId) return
        setLoading(true)
        try {
            let contactsList = []

            if (currentUser?.role === 'admin') {
                // Admin can chat with ALL students and mentors
                const res = await axios.get(`${API_BASE}/users`)
                const allUsers = Array.isArray(res.data) ? res.data : []
                contactsList = allUsers
                    .filter(u => u.role !== 'admin' && u.id !== userId)
                    .map(u => ({
                        id: u.id,
                        name: u.name || u.email,
                        email: u.email || '',
                        role: u.role || 'student'
                    }))
            } else if (currentUser?.role === 'mentor') {
                // Use the correct endpoint to get allocated students
                const res = await axios.get(`${API_BASE}/mentors/${userId}/students`)
                const students = Array.isArray(res.data) ? res.data : (res.data.data || [])
                contactsList = students.map(s => ({
                    id: s.id,
                    name: s.name || s.email,
                    email: s.email || '',
                    role: 'student'
                }))
            } else if (currentUser?.role === 'student' && (currentUser?.mentorId || currentUser?.mentor_id)) {
                // Fetch mentor info
                const mentorId = currentUser.mentorId || currentUser.mentor_id
                try {
                    const res = await axios.get(`${API_BASE}/users/${mentorId}`)
                    const mentor = res.data
                    if (mentor) {
                        contactsList = [{ id: mentor.id, name: mentor.name || mentor.email, email: mentor.email || '', role: 'mentor' }]
                    }
                } catch (e) { /* mentor not found */ }
            }

            setContacts(contactsList)

            // Now fetch conversation previews for all contacts
            try {
                const res = await axios.get(`${API_BASE}/messages/${userId}`)
                const rawConvs = Array.isArray(res.data) ? res.data : (res.data.data || [])
                const convMap = {}
                rawConvs.forEach(c => {
                    const otherId = c.other_user_id || c.userId || c.id
                    convMap[otherId] = {
                        last_message: c.last_message || c.lastMessage || '',
                        last_message_time: c.last_message_at || c.lastMessageAt || c.last_message_time || null,
                        unread: c.unread_count ?? c.unreadCount ?? 0
                    }
                })
                setConversations(convMap)
            } catch (e) { /* no conversations yet */ }
        } catch (err) { console.error('Failed to load contacts:', err) }
        setLoading(false)
    }, [userId, currentUser])

    useEffect(() => { loadContacts() }, [loadContacts])

    const openConversation = async (contact) => {
        setSelectedUser(contact)
        setMessages([])
        try {
            const res = await axios.get(`${API_BASE}/messages/${userId}/${contact.id}`)
            const msgs = Array.isArray(res.data) ? res.data : (res.data.data || [])
            setMessages(msgs)
            // Clear unread for this contact
            setConversations(prev => ({
                ...prev,
                [contact.id]: { ...(prev[contact.id] || {}), unread: 0 }
            }))
        } catch (err) { console.error(err) }
    }

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

    const sendMessage = async () => {
        if ((!messageText.trim() && !attachment) || sendingMsg) return
        setSendingMsg(true)
        try {
            let attachmentUrl = null
            if (attachment) {
                const formData = new FormData()
                formData.append('file', attachment)
                formData.append('entityType', 'message')
                formData.append('entityId', `${userId}-${selectedUser.id}`)
                formData.append('uploadedBy', userId)
                const uploadRes = await axios.post(`${API_BASE}/attachments/upload`, formData)
                attachmentUrl = uploadRes.data.data?.file_url
            }
            const payload = { senderId: userId, receiverId: selectedUser.id, message: messageText.trim(), fileUrl: attachmentUrl }
            await axios.post(`${API_BASE}/messages`, payload)
            const sentText = messageText.trim()
            setMessageText('')
            setAttachment(null)

            // Refresh messages
            const res = await axios.get(`${API_BASE}/messages/${userId}/${selectedUser.id}`)
            const msgs = Array.isArray(res.data) ? res.data : (res.data.data || [])
            setMessages(msgs)

            // Update conversation preview
            setConversations(prev => ({
                ...prev,
                [selectedUser.id]: {
                    last_message: sentText || 'Attachment',
                    last_message_time: new Date().toISOString(),
                    unread: 0
                }
            }))
        } catch (err) { console.error('Send failed:', err) }
        setSendingMsg(false)
    }

    const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }

    const formatTime = (ts) => {
        if (!ts) return ''
        const d = new Date(ts)
        const now = new Date()
        const isToday = d.toDateString() === now.toDateString()
        return isToday ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    // Sort contacts: those with recent messages first, then alphabetical
    const sortedContacts = [...contacts].sort((a, b) => {
        const aConv = conversations[a.id]
        const bConv = conversations[b.id]
        if (aConv?.last_message_time && bConv?.last_message_time) return new Date(bConv.last_message_time) - new Date(aConv.last_message_time)
        if (aConv?.last_message_time) return -1
        if (bConv?.last_message_time) return 1
        return (a.name || '').localeCompare(b.name || '')
    })

    const filteredContacts = sortedContacts.filter(c =>
        (c.name || c.email || '').toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="animate-fadeIn" style={{ height: 'calc(100vh - 200px)', display: 'flex', gap: 0, borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            {/* Contacts Sidebar - always visible */}
            <div style={{ width: selectedUser ? '320px' : '100%', background: 'var(--bg-card)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', transition: 'width 0.3s ease', flexShrink: 0 }}>
                {/* Header */}
                <div style={{ padding: '1rem 1rem 0.75rem', background: 'linear-gradient(135deg, rgba(59,130,246,0.05), rgba(139,92,246,0.05))' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <MessageSquare size={20} color="#3b82f6" /> Chats
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '0.2rem 0.5rem', borderRadius: '20px' }}>
                            <Clock size={10} /> 24h
                        </div>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={currentUser?.role === 'admin' ? 'Search users...' : currentUser?.role === 'mentor' ? 'Search students...' : 'Search...'} style={{ ...inputStyle, paddingLeft: '32px', fontSize: '0.8rem', borderRadius: '20px', background: 'var(--bg-secondary)' }} />
                    </div>
                </div>

                {/* Contacts List */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loading ? (
                        <div className="page-loading" style={{ flexDirection: 'column', gap: '0.75rem' }}>
                            <div className="loading-spinner" />
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>Loading contacts...</p>
                        </div>
                    ) : filteredContacts.length === 0 ? (
                        <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Users size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                            <p style={{ fontSize: '0.85rem', margin: '0 0 0.3rem' }}>{searchQuery ? 'No matches found' : 'No students allocated'}</p>
                            <p style={{ fontSize: '0.7rem', margin: 0, opacity: 0.7 }}>{searchQuery ? 'Try a different name' : 'Students will appear here once allocated'}</p>
                        </div>
                    ) : filteredContacts.map(contact => {
                        const conv = conversations[contact.id]
                        const isSelected = selectedUser?.id === contact.id
                        const hasUnread = conv?.unread > 0
                        return (
                            <div key={contact.id} onClick={() => openConversation(contact)}
                                className={`dm-contact-item${isSelected ? ' selected' : ''}`}>
                                {/* Avatar */}
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: getAvatarColor(contact.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '0.95rem', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                                        {(contact.name || '?')[0].toUpperCase()}
                                    </div>
                                    {/* Online dot */}
                                    <div style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: '#22c55e', border: '2px solid var(--bg-card)' }} />
                                </div>
                                {/* Role badge for admin view */}
                                {currentUser?.role === 'admin' && (
                                    <span style={{ position: 'absolute', top: '0.5rem', right: '0.75rem', fontSize: '0.55rem', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, textTransform: 'uppercase', background: contact.role === 'mentor' ? 'rgba(139,92,246,0.15)' : 'rgba(59,130,246,0.15)', color: contact.role === 'mentor' ? '#8b5cf6' : '#3b82f6' }}>
                                        {contact.role}
                                    </span>
                                )}
                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.15rem' }}>
                                        <span style={{ fontWeight: hasUnread ? 700 : 600, fontSize: '0.88rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {contact.name || contact.email}
                                        </span>
                                        {conv?.last_message_time && (
                                            <span style={{ fontSize: '0.6rem', color: hasUnread ? '#3b82f6' : 'var(--text-muted)', flexShrink: 0, fontWeight: hasUnread ? 600 : 400 }}>
                                                {formatTime(conv.last_message_time)}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', color: hasUnread ? 'var(--text)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: hasUnread ? 500 : 400, maxWidth: '180px' }}>
                                            {conv?.last_message || `Tap to chat with ${contact.name?.split(' ')[0] || 'them'}`}
                                        </span>
                                        {hasUnread && (
                                            <span style={{ background: '#3b82f6', color: 'white', borderRadius: '50%', minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, flexShrink: 0, padding: '0 4px' }}>
                                                {conv.unread}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Footer with count */}
                {!loading && contacts.length > 0 && (
                    <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--border-color)', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                        {contacts.length} {currentUser?.role === 'admin' ? 'user' : currentUser?.role === 'mentor' ? 'student' : 'contact'}{contacts.length !== 1 ? 's' : ''}
                    </div>
                )}
            </div>

            {/* Chat Area */}
            {selectedUser ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-secondary)' }}>
                    {/* Chat Header */}
                    <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <button onClick={() => setSelectedUser(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.3rem', display: 'flex' }}><ArrowLeft size={18} /></button>
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: getAvatarColor(selectedUser.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '0.85rem', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                            {(selectedUser.name || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{selectedUser.name}</div>
                            <div style={{ fontSize: '0.7rem', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Circle size={6} fill="#22c55e" /> {selectedUser.role === 'student' ? 'Student' : selectedUser.role === 'mentor' ? 'Mentor' : 'User'}
                            </div>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(59,130,246,0.03) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(139,92,246,0.03) 0%, transparent 50%)' }}>
                        {messages.length === 0 ? (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '0.75rem' }}>
                                <div style={{ width: 80, height: 80, borderRadius: '50%', background: getAvatarColor(selectedUser.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '2rem', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                                    {(selectedUser.name || '?')[0].toUpperCase()}
                                </div>
                                <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)', margin: 0 }}>{selectedUser.name}</p>
                                <p style={{ fontSize: '0.8rem', margin: 0 }}>Say hi to start the conversation!</p>
                                <div style={{ fontSize: '0.65rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.5rem' }}>
                                    <Clock size={10} /> Messages disappear after 24 hours
                                </div>
                            </div>
                        ) : messages.map((msg, i) => {
                            const isMine = msg.sender_id === userId || msg.senderId === userId
                            return (
                                <div key={msg.id || i} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: '0.15rem' }}>
                                    <div style={{ maxWidth: '65%', padding: '0.6rem 0.85rem', borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: isMine ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : 'var(--bg-card)', color: isMine ? 'white' : 'var(--text)', border: isMine ? 'none' : '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                                        {msg.message && <div style={{ fontSize: '0.85rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.message}</div>}
                                        {(msg.file_url || msg.attachment_url) && (
                                            <a href={msg.file_url || msg.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: msg.message ? '0.4rem' : 0, fontSize: '0.75rem', color: isMine ? 'rgba(255,255,255,0.85)' : '#3b82f6', textDecoration: 'none' }}>
                                                <Paperclip size={12} /> Attachment <Download size={12} />
                                            </a>
                                        )}
                                        <div style={{ fontSize: '0.58rem', marginTop: '0.25rem', opacity: 0.6, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.3rem' }}>
                                            {formatTime(msg.created_at || msg.createdAt)}
                                            {isMine && <CheckCheck size={10} />}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Attachment preview */}
                    {attachment && (
                        <div style={{ padding: '0.5rem 1rem', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(59,130,246,0.05)' }}>
                            <FileText size={14} color="#3b82f6" />
                            <span style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.name}</span>
                            <button onClick={() => setAttachment(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={14} /></button>
                        </div>
                    )}

                    {/* Input Bar */}
                    <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-card)', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                        <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={e => setAttachment(e.target.files[0])} />
                        <button onClick={() => fileInputRef.current?.click()} style={{ background: 'transparent', border: 'none', borderRadius: '50%', padding: '0.5rem', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}><Paperclip size={20} /></button>
                        <textarea value={messageText} onChange={e => setMessageText(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message..."
                            rows={1} style={{ ...inputStyle, resize: 'none', flex: 1, borderRadius: '20px', background: 'var(--bg-secondary)' }} />
                        <button onClick={sendMessage} disabled={(!messageText.trim() && !attachment) || sendingMsg}
                            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: (!messageText.trim() && !attachment) ? 'rgba(59,130,246,0.3)' : 'linear-gradient(135deg, #3b82f6, #6366f1)', color: 'white', cursor: (!messageText.trim() && !attachment) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: (!messageText.trim() && !attachment) ? 'none' : '0 2px 8px rgba(59,130,246,0.4)' }}>
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            ) : (
                /* Empty state when no chat is selected (only visible on wider screens when sidebar doesn't take full width) */
                contacts.length > 0 && (
                    <div style={{ flex: 1, display: 'none' }} />
                )
            )}
        </div>
    )
}
