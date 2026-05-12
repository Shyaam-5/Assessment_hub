import { useState, useRef, useEffect } from 'react'
import { MessageCircle, Send, Sparkles, X, Bot, User, Wand2, Loader, ChevronDown, ChevronUp, Copy, Check, Lightbulb } from 'lucide-react'
import axios from 'axios'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

// ==================== AI CHATBOT COMPONENT ====================
function AIChatbot({ context = 'problem', onGenerate, isOpen, onClose }) {
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: context === 'task'
                ? `👋 Hi! I'm your AI assistant for creating ML/AI tasks. I can help you:\n\n• **Brainstorm** task ideas based on topics\n• **Generate** complete task specifications\n• **Suggest** improvements to your descriptions\n\nTry asking: "Create a beginner-friendly sentiment analysis task" or "I need an image classification project"`
                : `👋 Hi! I'm your AI assistant for creating coding problems. I can help you:\n\n• **Brainstorm** problem ideas by topic or difficulty\n• **Generate** complete problem specifications (including **SQL queries**!)\n• **Suggest** test cases and edge cases\n\nTry asking:\n• "Create an easy array problem about finding duplicates"\n• "Generate a SQL problem about employee salaries"\n• "I need a hard dynamic programming challenge"`
        }
    ])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isMinimized, setIsMinimized] = useState(false)
    const [copied, setCopied] = useState(false)
    const messagesEndRef = useRef(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    const handleSend = async () => {
        if (!input.trim() || isLoading) return

        const userMessage = { role: 'user', content: input }
        setMessages(prev => [...prev, userMessage])
        setInput('')
        setIsLoading(true)

        // Detect if user is asking for SQL problem
        const isSQL = input.toLowerCase().includes('sql') || input.toLowerCase().includes('query') || input.toLowerCase().includes('database')

        try {
            // First try the quick generate endpoint for direct requests
            if (input.toLowerCase().includes('create') || input.toLowerCase().includes('generate') || input.toLowerCase().includes('make')) {
                const genRes = await axios.post(`${API_BASE}/ai/generate-problem`, {
                    prompt: input,
                    type: context === 'task' ? 'task' : 'problem',
                    language: isSQL ? 'SQL' : 'Python'
                })

                if (genRes.data.success && genRes.data.generated) {
                    const generated = genRes.data.generated
                    const isSQLGenerated = generated.type === 'SQL' || generated.language === 'SQL'

                    let formattedResponse
                    if (context === 'task') {
                        formattedResponse = `✨ I've generated an ML task for you!\n\n**${generated.title}**\n\n📋 **Type:** ${generated.type}\n⚡ **Difficulty:** ${generated.difficulty}\n\n📝 **Description:**\n${generated.description}\n\n✅ **Requirements:**\n${generated.requirements}\n\n---\n*Click "Use This" to auto-fill the form, or ask me to modify it!*`
                    } else if (isSQLGenerated) {
                        formattedResponse = `✨ I've generated a SQL problem for you!\n\n**${generated.title}**\n\n💾 **Type:** SQL Query\n⚡ **Difficulty:** ${generated.difficulty}\n\n📝 **Description:**\n${generated.description}\n\n🗄️ **Database Schema:**\n\`\`\`sql\n${generated.sqlSchema || 'Schema will be provided'}\n\`\`\`\n\n📊 **Expected Result:**\n\`\`\`\n${generated.expectedQueryResult || generated.expectedResult || 'Result preview'}\n\`\`\`\n\n---\n*Click "Use This" to auto-fill the form, or ask me to modify it!*`
                    } else {
                        formattedResponse = `✨ I've generated a coding problem for you!\n\n**${generated.title}**\n\n💻 **Language:** ${generated.language}\n⚡ **Difficulty:** ${generated.difficulty}\n\n📝 **Description:**\n${generated.description}\n\n📥 **Sample Input:** \`${generated.sampleInput}\`\n📤 **Expected Output:** \`${generated.expectedOutput}\`\n\n---\n*Click "Use This" to auto-fill the form, or ask me to modify it!*`
                    }

                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: formattedResponse,
                        generatedContent: generated
                    }])
                    setIsLoading(false)
                    return
                }
            }

            // Fallback to chat endpoint for conversational queries
            const chatRes = await axios.post(`${API_BASE}/ai/chat`, {
                messages: [...messages.slice(1), userMessage].map(m => ({ role: m.role, content: m.content })),
                context: context
            })

            const assistantMessage = {
                role: 'assistant',
                content: chatRes.data.response,
                generatedContent: chatRes.data.generatedContent
            }

            setMessages(prev => [...prev, assistantMessage])

        } catch (error) {
            console.error('Chat error:', error)
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ Sorry, I encountered an error: ${error.response?.data?.details || error.message}. Please try again!`
            }])
        } finally {
            setIsLoading(false)
        }
    }

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const handleUseGenerated = (content) => {
        if (onGenerate && content) {
            onGenerate(content)
        }
    }

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(JSON.stringify(text, null, 2))
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const quickPrompts = context === 'task'
        ? [
            "Create a sentiment analysis task",
            "Generate an image classification project",
            "Build a regression task for housing prices",
            "Create an NLP task for text classification"
        ]
        : [
            "Create an easy array problem",
            "Generate a medium string manipulation problem",
            "Make a hard dynamic programming challenge",
            "Create a beginner-friendly recursion problem"
        ]

    if (!isOpen) return null

    return (
        <div style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            width: isMinimized ? '320px' : '420px',
            height: isMinimized ? 'auto' : '600px',
            background: 'linear-gradient(145deg, #1e293b, #0f172a)',
            borderRadius: '1.5rem',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(59, 130, 246, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 9999,
            animation: 'slideIn 0.3s ease-out'
        }}>
            {/* Header */}
            <div style={{
                padding: '1rem 1.25rem',
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.1))',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)'
                    }}>
                        <Sparkles size={20} color="white" />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
                            AI {context === 'task' ? 'Task' : 'Problem'} Generator
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
                            Powered by Groq AI
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.5rem',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {isMinimized ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.5rem',
                            cursor: 'pointer',
                            color: '#ef4444',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <>
                    {/* Messages Area */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem'
                    }}>
                        {messages.map((msg, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                gap: '0.75rem',
                                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
                            }}>
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    background: msg.role === 'user'
                                        ? 'linear-gradient(135deg, #10b981, #06b6d4)'
                                        : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}>
                                    {msg.role === 'user' ? <User size={16} color="white" /> : <Bot size={16} color="white" />}
                                </div>
                                <div style={{
                                    maxWidth: '85%',
                                    padding: '0.75rem 1rem',
                                    borderRadius: msg.role === 'user' ? '1rem 1rem 0 1rem' : '1rem 1rem 1rem 0',
                                    background: msg.role === 'user'
                                        ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.15))'
                                        : 'rgba(30, 41, 59, 0.8)',
                                    border: `1px solid ${msg.role === 'user' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)'}`,
                                    color: '#e2e8f0',
                                    fontSize: '0.9rem',
                                    lineHeight: '1.6',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {msg.content}

                                    {/* Action buttons for generated content */}
                                    {msg.generatedContent && (
                                        <div style={{
                                            marginTop: '1rem',
                                            paddingTop: '0.75rem',
                                            borderTop: '1px solid rgba(255,255,255,0.1)',
                                            display: 'flex',
                                            gap: '0.5rem',
                                            flexWrap: 'wrap'
                                        }}>
                                            <button
                                                onClick={() => handleUseGenerated(msg.generatedContent)}
                                                style={{
                                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                                    border: 'none',
                                                    color: 'white',
                                                    padding: '0.5rem 1rem',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.4rem'
                                                }}
                                            >
                                                <Wand2 size={14} /> Use This
                                            </button>
                                            <button
                                                onClick={() => copyToClipboard(msg.generatedContent)}
                                                style={{
                                                    background: 'rgba(255,255,255,0.1)',
                                                    border: 'none',
                                                    color: '#94a3b8',
                                                    padding: '0.5rem 1rem',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.4rem'
                                                }}
                                            >
                                                {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                                                {copied ? 'Copied!' : 'Copy JSON'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {isLoading && (
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Bot size={16} color="white" />
                                </div>
                                <div style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: '1rem 1rem 1rem 0',
                                    background: 'rgba(30, 41, 59, 0.8)',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    color: '#94a3b8'
                                }}>
                                    <Loader size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                                    Thinking...
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick Prompts */}
                    {messages.length <= 1 && (
                        <div style={{
                            padding: '0 1rem 0.75rem',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.5rem'
                        }}>
                            {quickPrompts.map((prompt, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setInput(prompt)}
                                    style={{
                                        background: 'rgba(59, 130, 246, 0.1)',
                                        border: '1px solid rgba(59, 130, 246, 0.2)',
                                        color: '#60a5fa',
                                        padding: '0.4rem 0.75rem',
                                        borderRadius: '2rem',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.3rem'
                                    }}
                                >
                                    <Lightbulb size={12} /> {prompt}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Input Area */}
                    <div style={{
                        padding: '1rem',
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                        background: 'rgba(15, 23, 42, 0.5)'
                    }}>
                        <div style={{
                            display: 'flex',
                            gap: '0.75rem',
                            alignItems: 'flex-end'
                        }}>
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder={`Describe the ${context === 'task' ? 'ML task' : 'coding problem'} you want...`}
                                style={{
                                    flex: 1,
                                    background: 'rgba(30, 41, 59, 0.6)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    padding: '0.75rem 1rem',
                                    color: '#f8fafc',
                                    fontSize: '0.9rem',
                                    resize: 'none',
                                    minHeight: '44px',
                                    maxHeight: '120px',
                                    outline: 'none'
                                }}
                                rows={1}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading}
                                style={{
                                    width: '44px',
                                    height: '44px',
                                    borderRadius: '12px',
                                    background: input.trim() && !isLoading
                                        ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                                        : 'rgba(255,255,255,0.1)',
                                    border: 'none',
                                    color: input.trim() && !isLoading ? 'white' : '#64748b',
                                    cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                </>
            )}

            <style>{`
                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}

// ==================== FLOATING AI BUTTON ====================
function AIFloatingButton({ onClick, context = 'problem' }) {
    const [isHovered, setIsHovered] = useState(false)

    return (
        <button
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                position: 'fixed',
                bottom: '1.5rem',
                right: '1.5rem',
                width: isHovered ? 'auto' : '60px',
                height: '60px',
                borderRadius: isHovered ? '30px' : '50%',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                border: 'none',
                boxShadow: '0 8px 32px rgba(59, 130, 246, 0.4)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: isHovered ? '0.5rem' : '0',
                padding: isHovered ? '0 1.5rem' : '0',
                transition: 'all 0.3s ease',
                zIndex: 9998,
                color: 'white',
                fontWeight: 600,
                fontSize: '0.9rem'
            }}
        >
            <Sparkles size={24} />
            {isHovered && <span>AI Assistant</span>}
        </button>
    )
}

export { AIChatbot, AIFloatingButton }
export default AIChatbot
