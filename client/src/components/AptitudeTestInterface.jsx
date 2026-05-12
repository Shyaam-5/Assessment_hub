import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, Clock, CheckCircle, XCircle, AlertTriangle, ChevronLeft, ChevronRight, Send, Eye, Brain, Target, Award, Sparkles, Shield, Camera, CameraOff, Smartphone } from 'lucide-react'
import axios from 'axios'
import socketService from '@/services/socketService'
import { useCamera, useObjectDetection } from '@/hooks/useProctoring'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

// Seeded random shuffle - ensures same student gets same order on refresh
function seededShuffle(array, seed) {
    const shuffled = [...array]
    let currentIndex = shuffled.length

    // Simple seeded random number generator
    const seededRandom = () => {
        seed = (seed * 9301 + 49297) % 233280
        return seed / 233280
    }

    while (currentIndex > 0) {
        const randomIndex = Math.floor(seededRandom() * currentIndex)
        currentIndex--
            ;[shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]]
    }

    return shuffled
}

// Generate a numeric seed from student ID and test ID
function generateSeed(studentId, testId) {
    const combined = `${studentId}-${testId}`
    let hash = 0
    for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash)
}

// ==================== APTITUDE TEST INTERFACE (PROCTORED) ====================
function AptitudeTestInterface({ test, user, onClose, onComplete }) {
    const [currentQuestion, setCurrentQuestion] = useState(0)
    const [answers, setAnswers] = useState({})
    const [timeLeft, setTimeLeft] = useState(test.duration * 60)
    const [tabSwitches, setTabSwitches] = useState(0)
    const [showWarning, setShowWarning] = useState(false)
    const [warningMessage, setWarningMessage] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [forceExit, setForceExit] = useState(false)
    const [result, setResult] = useState(null)
    const [showResult, setShowResult] = useState(false)

    // Shuffle questions based on student ID + test ID (deterministic per student)
    const rawQuestions = test.questions || []
    const questions = useMemo(() => {
        const seed = generateSeed(user.id, test.id)
        return seededShuffle(rawQuestions, seed)
    }, [rawQuestions, user.id, test.id])

    const timerRef = useRef(null)
    const answersRef = useRef(answers)
    const tabSwitchesRef = useRef(tabSwitches)
    const timeLeftRef = useRef(timeLeft)
    const submittedRef = useRef(false)

    // ── Unified Violation Counter ──
    const MAX_VIOLATIONS = 10
    const totalViolationsRef = useRef(0)
    const terminatedRef = useRef(false)
    const [totalViolations, setTotalViolations] = useState(0)
    const [agentTerminated, setAgentTerminated] = useState(false)
    const [terminateReason, setTerminateReason] = useState('')

    // ── Multiple Monitor Detection ──
    const [multipleMonitors, setMultipleMonitors] = useState(false)
    const [multipleMonitorCount, setMultipleMonitorCount] = useState(0)
    const monitorCheckIntervalRef = useRef(null)

    // ── Session ID for proctoring log ──
    const proctoringSessionId = useRef(`apt_${user.id}_${test.id}_${Date.now()}`)

    // ── Camera & Phone Detection (shared hooks) ──
    const camera = useCamera(true)
    const objectDetection = useObjectDetection(camera.videoEnabled, camera.videoRef)

    // Keep refs in sync with state (to avoid stale closures in timer)
    useEffect(() => { answersRef.current = answers }, [answers])
    useEffect(() => { tabSwitchesRef.current = tabSwitches }, [tabSwitches])
    useEffect(() => { timeLeftRef.current = timeLeft }, [timeLeft])

    // Initialize camera on mount
    useEffect(() => {
        camera.initializeCamera()
        return () => camera.stopCamera()
    }, [])

    // Wire camera blocked → recordViolation
    useEffect(() => {
        if (camera.cameraBlocked && camera.cameraBlockedCount > 0) {
            recordViolation('camera_blocked', 'critical')
            setWarningMessage('📷 Camera is blocked! Uncover your camera immediately.')
            setShowWarning(true)
            setTimeout(() => setShowWarning(false), 4000)
        }
    }, [camera.cameraBlockedCount])

    // Wire phone detection → recordViolation
    useEffect(() => {
        if (objectDetection.phoneDetectionCount > 0) {
            recordViolation('phone_detected', 'critical')
            socketService.emitProctoringViolation(user.id, user.name || user.email, 'phone_detected', 'critical', null)
            setWarningMessage('📱 Phone/device detected! Remove ALL electronic devices immediately.')
            setShowWarning(true)
            setTimeout(() => setShowWarning(false), 4000)
        }
    }, [objectDetection.phoneDetectionCount])

    // ── Auto-terminate test ──
    const autoTerminateTest = useCallback(async (reason) => {
        if (terminatedRef.current) return
        terminatedRef.current = true
        submittedRef.current = true
        setAgentTerminated(true)
        setTerminateReason(reason)
        setShowWarning(true)
        setWarningMessage('🛑 Test terminated — submitting your work')
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        if (monitorCheckIntervalRef.current) clearInterval(monitorCheckIntervalRef.current)
        try {
            const timeSpent = (test.duration * 60) - timeLeftRef.current
            socketService.emitSubmissionCompleted(user.id, user.name || user.email, test.id, test.title, null, 'terminated', 0)
            const res = await axios.post(`${API_BASE}/aptitude/${test.id}/submit`, {
                studentId: user.id,
                answers: answersRef.current,
                timeSpent,
                tabSwitches: tabSwitchesRef.current,
                submissionType: 'auto_terminated',
                terminationReason: reason
            })
            const submissionResult = res.data.submission || res.data
            setTimeout(() => { onClose(); onComplete && onComplete(submissionResult) }, 3000)
        } catch (err) {
            console.error('Auto-terminate submission failed:', err)
            setTimeout(() => { onClose() }, 3000)
        }
    }, [user, test, onClose, onComplete])

    // ── Unified violation recorder ──
    const recordViolation = useCallback((eventType = 'unknown', severity = 'low') => {
        if (terminatedRef.current) return
        totalViolationsRef.current += 1
        const count = totalViolationsRef.current
        setTotalViolations(count)
        axios.post(`${API_BASE}/communication/proctoring/log`, {
            userId: user.id,
            sessionId: proctoringSessionId.current,
            eventType,
            severity,
            details: `Violation ${count}/${MAX_VIOLATIONS}`
        }).catch(() => {})
        if (count >= MAX_VIOLATIONS) {
            autoTerminateTest(`Maximum proctoring violations reached (${count}/${MAX_VIOLATIONS}). Your test has been automatically terminated.`)
        }
    }, [autoTerminateTest, user.id])

    // Enter fullscreen on mount + re-enforce + Socket.IO init
    useEffect(() => {
        const enterFullscreen = async () => {
            try {
                if (!document.fullscreenElement && !submittedRef.current) {
                    await document.documentElement.requestFullscreen()
                }
            } catch (_) {}
        }
        enterFullscreen()

        const handleFullscreenChange = () => {
            if (!document.fullscreenElement && !submittedRef.current) {
                setWarningMessage('⚠️ Fullscreen mode required! Re-entering...')
                setShowWarning(true)
                recordViolation('fullscreen_exit', 'medium')
                setTimeout(() => {
                    if (!submittedRef.current) enterFullscreen()
                    setShowWarning(false)
                }, 1500)
            }
        }
        document.addEventListener('fullscreenchange', handleFullscreenChange)

        // Socket.IO init
        if (test && user) {
            socketService.emitSubmissionStarted(user.id, user.name || user.email, test.id, test.title, null, true)
        }

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange)
            if (document.fullscreenElement && !submittedRef.current) {
                document.exitFullscreen().catch(() => {})
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Timer countdown
    useEffect(() => {
        if (result || forceExit) return

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current)
                    handleAutoSubmit()
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(timerRef.current)
    }, [result, forceExit])

    // Get max tab switches from test config (default to 3)
    const maxAllowedTabSwitches = test.maxTabSwitches || 3

    // Tab switch detection + window blur
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && !result && !forceExit && !terminatedRef.current) {
                setTabSwitches(prev => {
                    const newCount = prev + 1
                    socketService.emitProctoringViolation(user.id, user.name || user.email, 'window_switch', newCount >= maxAllowedTabSwitches ? 'critical' : 'warning', null)
                    recordViolation('window_switch', newCount >= maxAllowedTabSwitches ? 'critical' : 'warning')

                    if (newCount >= maxAllowedTabSwitches) {
                        setWarningMessage(`🚫 DISQUALIFIED! Max tab switches exceeded (${newCount}/${maxAllowedTabSwitches}). Test terminated.`)
                        setShowWarning(true)
                        setForceExit(true)
                        setTimeout(() => handleAutoSubmit(true), 3000)
                    } else {
                        setWarningMessage(`⚠️ Tab switch detected! (${newCount}/${maxAllowedTabSwitches}) ${maxAllowedTabSwitches - newCount} more will disqualify you!`)
                        setShowWarning(true)
                        setTimeout(() => setShowWarning(false), 4000)
                    }
                    return newCount
                })
            }
        }
        const handleBlur = () => {
            if (!document.hidden && !result && !forceExit && !terminatedRef.current) {
                recordViolation('window_blur', 'medium')
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)
        window.addEventListener('blur', handleBlur)
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            window.removeEventListener('blur', handleBlur)
        }
    }, [result, forceExit, recordViolation])

    // Copy/paste/cut prevention + DevTools blocking
    useEffect(() => {
        const preventClipboard = (e) => {
            e.preventDefault()
            recordViolation('copy_paste', 'medium')
            socketService.emitProctoringViolation(user.id, user.name || user.email, e.type + '_attempt', 'warning', null)
        }
        const preventContextMenu = (e) => e.preventDefault()
        const preventKeys = (e) => {
            // DevTools blocking
            if (e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && ['I','i','J','j','C','c'].includes(e.key)) ||
                (e.ctrlKey && ['u','U'].includes(e.key)) ||
                e.key === 'PrintScreen') {
                e.preventDefault()
                e.stopPropagation()
                recordViolation('devtools_attempt', 'high')
                socketService.emitProctoringViolation(user.id, user.name || user.email, 'devtools_attempt', 'high', null)
                setWarningMessage('🚫 Developer tools are disabled during the assessment.')
                setShowWarning(true)
                setTimeout(() => setShowWarning(false), 3000)
                return
            }
            // Other shortcuts
            if (e.ctrlKey || e.altKey || e.metaKey) {
                if (['c', 'v', 'p', 's', 'a'].includes(e.key.toLowerCase())) {
                    e.preventDefault()
                }
            }
            if (e.key === 'Escape') e.preventDefault()
        }

        document.addEventListener('copy', preventClipboard)
        document.addEventListener('paste', preventClipboard)
        document.addEventListener('cut', preventClipboard)
        document.addEventListener('contextmenu', preventContextMenu)
        document.addEventListener('keydown', preventKeys, true)
        return () => {
            document.removeEventListener('copy', preventClipboard)
            document.removeEventListener('paste', preventClipboard)
            document.removeEventListener('cut', preventClipboard)
            document.removeEventListener('contextmenu', preventContextMenu)
            document.removeEventListener('keydown', preventKeys, true)
        }
    }, [recordViolation, user])

    // ── Multiple Monitor Detection ──
    const triggerMonitorViolation = useCallback((reason) => {
        setMultipleMonitors(true)
        setMultipleMonitorCount(prev => {
            const next = prev + 1
            socketService.emitProctoringViolation(user.id, user.name || user.email, 'multiple_monitors', next >= 2 ? 'critical' : 'warning', null)
            recordViolation('multiple_monitors', next >= 2 ? 'critical' : 'warning')
            setWarningMessage(`🖥️ Multiple monitors detected! (${next}) Please disconnect external displays.`)
            setShowWarning(true)
            setTimeout(() => setShowWarning(false), 6000)
            return next
        })
    }, [user, recordViolation])

    const detectMultipleMonitors = useCallback(() => {
        let detected = false
        let reason = ''
        if ('isExtended' in window.screen && window.screen.isExtended) {
            detected = true; reason = 'screen.isExtended — multi-screen'
        }
        const screenW = window.screen.width, screenH = window.screen.height
        const availW = window.screen.availWidth, availH = window.screen.availHeight
        if (screenW > screenH * 2.5) { detected = true; reason = `Ultra-wide (${screenW}x${screenH})` }
        const winLeft = window.screenX || window.screenLeft || 0
        const winTop = window.screenY || window.screenTop || 0
        if (winLeft < 0 || winLeft >= screenW || winTop < 0 || winTop >= screenH) {
            detected = true; reason = `Window on secondary (pos: ${winLeft},${winTop})`
        }
        if (availW > screenW || availH > screenH) {
            detected = true; reason = 'Available area exceeds screen'
        }
        if (detected && !multipleMonitors) { triggerMonitorViolation(reason) }
        else if (!detected && multipleMonitors) { setMultipleMonitors(false) }
        if ('getScreenDetails' in window) {
            window.getScreenDetails().then(sd => {
                if (sd.screens.length > 1 && !multipleMonitors) triggerMonitorViolation(`${sd.screens.length} screens via API`)
            }).catch(() => {})
        }
        return detected
    }, [multipleMonitors, triggerMonitorViolation])

    useEffect(() => {
        detectMultipleMonitors()
        monitorCheckIntervalRef.current = setInterval(detectMultipleMonitors, 5000)
        const handleResize = () => detectMultipleMonitors()
        window.addEventListener('resize', handleResize)
        const handleScreenChange = () => detectMultipleMonitors()
        if (window.screen?.addEventListener) window.screen.addEventListener('change', handleScreenChange)
        return () => {
            if (monitorCheckIntervalRef.current) clearInterval(monitorCheckIntervalRef.current)
            window.removeEventListener('resize', handleResize)
            if (window.screen?.removeEventListener) window.screen.removeEventListener('change', handleScreenChange)
        }
    }, [detectMultipleMonitors])

    // ── Proctor Agent Termination Listener ──
    useEffect(() => {
        socketService.connect()
        socketService.joinStudentSession(user.id, proctoringSessionId.current)
        const handleTerminate = (data) => {
            console.error('[ProctorAgent] TEST TERMINATED BY AGENT:', data)
            autoTerminateTest(data?.reason || 'Your test has been terminated by the Proctoring Intelligence Agent due to integrity violations.')
        }
        socketService.onAgentTerminate(handleTerminate)
        return () => { socketService.removeListener('agent_terminate') }
    }, [user.id, autoTerminateTest])

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    const handleAnswerSelect = (questionId, answer) => {
        setAnswers(prev => ({
            ...prev,
            [questionId]: answer
        }))
    }

    const handleAutoSubmit = async (disqualified = false) => {
        if (submittedRef.current) return
        submittedRef.current = true
        setIsSubmitting(true)
        try {
            const currentAnswers = answersRef.current
            const currentTabSwitches = tabSwitchesRef.current
            const currentTimeLeft = timeLeftRef.current

            if (monitorCheckIntervalRef.current) {
                clearInterval(monitorCheckIntervalRef.current)
                monitorCheckIntervalRef.current = null
            }

            const response = await axios.post(`${API_BASE}/aptitude/${test.id}/submit`, {
                studentId: user.id,
                answers: disqualified ? {} : currentAnswers,
                timeSpent: (test.duration * 60) - currentTimeLeft,
                tabSwitches: currentTabSwitches,
                totalViolations: totalViolationsRef.current,
                multipleMonitorCount: multipleMonitorCount,
                proctoringSessionId: proctoringSessionId.current
            })

            socketService.emitSubmissionCompleted({
                testId: test.id,
                studentId: user.id,
                studentName: user.name || user.email,
                type: 'aptitude',
                disqualified
            })

            setResult(response.data.submission)
            setShowResult(true)
        } catch (error) {
            console.error('Submit failed:', error)
            submittedRef.current = false
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleSubmit = async () => {
        if (Object.keys(answers).length < questions.length) {
            const unanswered = questions.length - Object.keys(answers).length
            if (!window.confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) {
                return
            }
        }
        await handleAutoSubmit()
    }

    const answeredCount = Object.keys(answers).length

    if (showResult && result) {
        return (
            <div style={{
                position: 'fixed',
                inset: 0,
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
                overflowY: 'auto'
            }}>
                <div style={{
                    background: 'rgba(30, 41, 59, 0.95)',
                    backdropFilter: 'blur(20px)',
                    borderRadius: '24px',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    maxWidth: '900px',
                    width: '100%',
                    maxHeight: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '1.5rem 2rem',
                        borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(15, 23, 42, 0.5)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '12px',
                                background: result.status === 'passed'
                                    ? 'linear-gradient(135deg, #10b981, #06b6d4)'
                                    : 'linear-gradient(135deg, #ef4444, #f97316)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <Brain size={24} color="white" />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>
                                    Aptitude Test Report
                                </h2>
                                <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>
                                    {test.title}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                if (document.fullscreenElement) {
                                    document.exitFullscreen()
                                }
                                onClose()
                                if (onComplete) onComplete(result)
                            }}
                            style={{
                                background: 'rgba(71, 85, 105, 0.5)',
                                border: 'none',
                                borderRadius: '8px',
                                width: '36px',
                                height: '36px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: 'white'
                            }}
                        >
                            <XCircle size={20} />
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '2rem'
                    }}>
                        {/* Score Summary */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '3rem',
                            marginBottom: '2rem',
                            padding: '2rem',
                            background: result.status === 'passed' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                            borderRadius: '16px',
                            border: `1px solid ${result.status === 'passed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{
                                    fontSize: '4rem',
                                    fontWeight: 800,
                                    color: result.status === 'passed' ? '#10b981' : '#ef4444',
                                    lineHeight: 1
                                }}>
                                    {result.score}%
                                </div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', marginTop: '0.5rem' }}>Overall Score</div>
                            </div>
                            <div style={{
                                padding: '1rem 2rem',
                                borderRadius: '12px',
                                background: result.status === 'passed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                border: `1px solid ${result.status === 'passed' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem'
                            }}>
                                {result.status === 'passed' ? (
                                    <CheckCircle size={28} color="#10b981" />
                                ) : (
                                    <XCircle size={28} color="#ef4444" />
                                )}
                                <span style={{
                                    fontSize: '1.5rem',
                                    fontWeight: 700,
                                    color: result.status === 'passed' ? '#10b981' : '#ef4444'
                                }}>
                                    {result.status === 'passed' ? 'PASSED' : 'FAILED'}
                                </span>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(5, 1fr)',
                            gap: '1rem',
                            marginBottom: '2rem'
                        }}>
                            <div style={{
                                background: 'rgba(59, 130, 246, 0.1)',
                                borderRadius: '12px',
                                padding: '1.25rem',
                                border: '1px solid rgba(59, 130, 246, 0.2)',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#3b82f6' }}>
                                    {result.totalQuestions}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>Total Questions</div>
                            </div>
                            <div style={{
                                background: 'rgba(16, 185, 129, 0.1)',
                                borderRadius: '12px',
                                padding: '1.25rem',
                                border: '1px solid rgba(16, 185, 129, 0.2)',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>
                                    {result.correctCount}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>Correct</div>
                            </div>
                            <div style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                borderRadius: '12px',
                                padding: '1.25rem',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ef4444' }}>
                                    {result.totalQuestions - result.correctCount}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>Incorrect</div>
                            </div>
                            <div style={{
                                background: 'rgba(245, 158, 11, 0.1)',
                                borderRadius: '12px',
                                padding: '1.25rem',
                                border: '1px solid rgba(245, 158, 11, 0.2)',
                                textAlign: 'center'
                            }}>
                                <div style={{
                                    fontSize: '1.75rem',
                                    fontWeight: 800,
                                    color: (result.tabSwitches || tabSwitches || 0) > 0 ? '#f59e0b' : '#10b981'
                                }}>
                                    {result.tabSwitches || tabSwitches || 0}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                    <AlertTriangle size={12} />
                                    Violations
                                </div>
                            </div>
                            <div style={{
                                background: 'rgba(139, 92, 246, 0.1)',
                                borderRadius: '12px',
                                padding: '1.25rem',
                                border: '1px solid rgba(139, 92, 246, 0.2)',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#8b5cf6' }}>
                                    {result.timeSpent ? `${Math.floor(result.timeSpent / 60)}m` : `${Math.round(((test.duration * 60) - timeLeft) / 60)}m`}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                    <Clock size={12} />
                                    Time Spent
                                </div>
                            </div>
                        </div>

                        {/* Violation Warning */}
                        {(result.tabSwitches || tabSwitches || 0) > 0 && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                padding: '1rem 1.5rem',
                                background: 'rgba(245, 158, 11, 0.1)',
                                borderRadius: '12px',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                marginBottom: '2rem'
                            }}>
                                <AlertTriangle size={24} color="#f59e0b" />
                                <div>
                                    <strong style={{ color: '#f59e0b' }}>Tab Switch Violations Detected</strong>
                                    <p style={{ margin: '0.25rem 0 0', color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
                                        You switched tabs/windows {result.tabSwitches || tabSwitches || 0} time(s) during the test.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Detailed Question Breakdown */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h3 style={{
                                margin: '0 0 1rem',
                                fontSize: '1.1rem',
                                fontWeight: 600,
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}>
                                <Target size={18} color="#8b5cf6" />
                                Detailed Question Breakdown
                            </h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {result.questionResults?.map((qr, idx) => (
                                    <div key={idx} style={{
                                        padding: '1.25rem',
                                        background: qr.isCorrect ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                                        border: `1px solid ${qr.isCorrect ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                                        borderRadius: '12px'
                                    }}>
                                        {/* Question Header */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '0.75rem',
                                            marginBottom: '1rem'
                                        }}>
                                            <span style={{
                                                minWidth: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                background: qr.isCorrect
                                                    ? 'linear-gradient(135deg, #10b981, #06b6d4)'
                                                    : 'linear-gradient(135deg, #ef4444, #f97316)',
                                                color: 'white',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.8rem',
                                                fontWeight: 700,
                                                flexShrink: 0
                                            }}>
                                                {qr.isCorrect ? '✓' : '✗'}
                                            </span>
                                            <div style={{ flex: 1 }}>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.75rem',
                                                    marginBottom: '0.5rem'
                                                }}>
                                                    <span style={{
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        color: '#8b5cf6',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.05em'
                                                    }}>
                                                        Question {idx + 1}
                                                    </span>
                                                    {qr.category && (
                                                        <span style={{
                                                            fontSize: '0.7rem',
                                                            padding: '0.2rem 0.6rem',
                                                            background: 'rgba(139, 92, 246, 0.2)',
                                                            borderRadius: '20px',
                                                            color: '#a78bfa'
                                                        }}>
                                                            {qr.category}
                                                        </span>
                                                    )}
                                                </div>
                                                <p style={{
                                                    margin: 0,
                                                    fontSize: '1rem',
                                                    fontWeight: 500,
                                                    color: 'white',
                                                    lineHeight: 1.5
                                                }}>
                                                    {qr.question}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Answers Section */}
                                        <div style={{
                                            marginLeft: '2.5rem',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.75rem'
                                        }}>
                                            {/* Your Answer */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: '0.75rem',
                                                padding: '0.75rem 1rem',
                                                background: qr.isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                borderRadius: '8px',
                                                border: `1px solid ${qr.isCorrect ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                                            }}>
                                                <span style={{
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600,
                                                    color: 'rgba(255,255,255,0.5)',
                                                    minWidth: '100px'
                                                }}>
                                                    Your Answer:
                                                </span>
                                                <span style={{
                                                    fontSize: '0.9rem',
                                                    fontWeight: 600,
                                                    color: qr.isCorrect ? '#10b981' : '#ef4444'
                                                }}>
                                                    {qr.userAnswer || '(Not answered)'}
                                                </span>
                                            </div>

                                            {/* Correct Answer (only show if incorrect) */}
                                            {!qr.isCorrect && (
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'flex-start',
                                                    gap: '0.75rem',
                                                    padding: '0.75rem 1rem',
                                                    background: 'rgba(16, 185, 129, 0.1)',
                                                    borderRadius: '8px',
                                                    border: '1px solid rgba(16, 185, 129, 0.2)'
                                                }}>
                                                    <span style={{
                                                        fontSize: '0.8rem',
                                                        fontWeight: 600,
                                                        color: 'rgba(255,255,255,0.5)',
                                                        minWidth: '100px'
                                                    }}>
                                                        Correct Answer:
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.9rem',
                                                        fontWeight: 600,
                                                        color: '#10b981'
                                                    }}>
                                                        {qr.correctAnswer}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Explanation */}
                                            {qr.explanation && (
                                                <div style={{
                                                    padding: '0.75rem 1rem',
                                                    background: 'rgba(139, 92, 246, 0.05)',
                                                    borderRadius: '8px',
                                                    border: '1px solid rgba(139, 92, 246, 0.15)'
                                                }}>
                                                    <span style={{
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        color: '#a78bfa',
                                                        display: 'block',
                                                        marginBottom: '0.25rem'
                                                    }}>
                                                        💡 Explanation
                                                    </span>
                                                    <p style={{
                                                        margin: 0,
                                                        fontSize: '0.85rem',
                                                        color: 'rgba(255,255,255,0.7)',
                                                        lineHeight: 1.5
                                                    }}>
                                                        {qr.explanation}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{
                        padding: '1.5rem 2rem',
                        borderTop: '1px solid rgba(139, 92, 246, 0.2)',
                        background: 'rgba(15, 23, 42, 0.5)',
                        display: 'flex',
                        justifyContent: 'flex-end'
                    }}>
                        <button
                            onClick={() => {
                                if (document.fullscreenElement) {
                                    document.exitFullscreen()
                                }
                                onClose()
                                if (onComplete) onComplete(result)
                            }}
                            style={{
                                padding: '0.875rem 2rem',
                                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                border: 'none',
                                borderRadius: '10px',
                                color: 'white',
                                fontSize: '1rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            Close & Return
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            {/* Agent Termination Overlay */}
            {agentTerminated && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 99999,
                    background: 'rgba(127, 29, 29, 0.97)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1.5rem',
                    padding: '2rem'
                }}>
                    <Shield size={64} color="#fca5a5" />
                    <h1 style={{ color: '#fca5a5', fontSize: '2rem', margin: 0 }}>Test Terminated</h1>
                    <p style={{ color: '#fecaca', fontSize: '1.1rem', textAlign: 'center', maxWidth: 600 }}>
                        {terminateReason || 'Your test was terminated by the proctoring agent due to suspicious activity.'}
                    </p>
                </div>
            )}
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem 2rem',
                background: 'rgba(15, 23, 42, 0.8)',
                borderBottom: '1px solid rgba(139, 92, 246, 0.2)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Brain size={28} color="#8b5cf6" />
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'white' }}>
                            Aptitude Test – {test.title}
                        </h1>
                    </div>
                </div>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: timeLeft < 60 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    border: `1px solid ${timeLeft < 60 ? '#ef4444' : '#10b981'}`
                }}>
                    <Clock size={20} color={timeLeft < 60 ? '#ef4444' : '#10b981'} />
                    <span style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        color: timeLeft < 60 ? '#ef4444' : '#10b981'
                    }}>
                        {formatTime(timeLeft)}
                    </span>
                </div>
            </div>

            {/* Warning Banner */}
            {showWarning && (
                <div style={{
                    background: tabSwitches >= 3 ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                    padding: '1rem 2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1rem',
                    animation: 'pulse 1s infinite'
                }}>
                    <AlertTriangle size={24} color="white" />
                    <span style={{ color: 'white', fontWeight: 600 }}>{warningMessage}</span>
                </div>
            )}

            {/* Main Content */}
            <div style={{
                display: 'flex',
                flex: 1,
                overflow: 'hidden'
            }}>
                {/* Left Sidebar - Question Palette */}
                <div style={{
                    width: '200px',
                    background: 'rgba(30, 41, 59, 0.5)',
                    borderRight: '1px solid rgba(139, 92, 246, 0.2)',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <h3 style={{
                            margin: 0,
                            fontSize: '0.9rem',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            <Target size={16} /> Question Palette
                        </h3>
                        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                            {answeredCount}/{questions.length} Answered
                        </p>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '0.5rem',
                        marginBottom: '1.5rem'
                    }}>
                        {questions.map((q, idx) => (
                            <button
                                key={q.id}
                                onClick={() => setCurrentQuestion(idx)}
                                style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '8px',
                                    border: currentQuestion === idx ? '2px solid #3b82f6' : 'none',
                                    background: answers[q.id]
                                        ? 'linear-gradient(135deg, #10b981, #06b6d4)'
                                        : currentQuestion === idx
                                            ? 'rgba(59, 130, 246, 0.3)'
                                            : 'rgba(71, 85, 105, 0.5)',
                                    color: 'white',
                                    fontWeight: 600,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {idx + 1}
                            </button>
                        ))}
                    </div>

                    <div style={{ marginTop: 'auto' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            marginBottom: '0.5rem'
                        }}>
                            <div style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '4px',
                                background: 'linear-gradient(135deg, #10b981, #06b6d4)'
                            }}></div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Answered</span>
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            <div style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '4px',
                                background: 'rgba(71, 85, 105, 0.5)'
                            }}></div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Unanswered</span>
                        </div>

                        {/* Camera Preview */}
                        <div style={{
                            marginTop: '1rem',
                            width: '100%',
                            aspectRatio: '4/3',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            background: '#000',
                            border: `2px solid ${camera.cameraBlocked ? '#ef4444' : camera.videoEnabled ? '#10b981' : '#64748b'}`,
                            position: 'relative'
                        }}>
                            <video ref={camera.videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <canvas ref={camera.canvasRef} style={{ display: 'none' }} />
                            {camera.cameraBlocked && (
                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(239,68,68,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.25rem' }}>
                                    <CameraOff size={20} color="#fff" />
                                    <span style={{ fontSize: '0.6rem', color: '#fff', fontWeight: 600 }}>BLOCKED</span>
                                </div>
                            )}
                            {objectDetection.phoneDetectionCount > 0 && !camera.cameraBlocked && (
                                <div style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(239,68,68,0.95)', borderRadius: '4px', padding: '1px 4px', fontSize: '0.55rem', color: '#fff', fontWeight: 700 }}>📱{objectDetection.phoneDetectionCount}</div>
                            )}
                            {!camera.videoEnabled && !camera.cameraAccessDenied && (
                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#94a3b8' }}>Loading…</div>
                            )}
                            {camera.cameraAccessDenied && (
                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.25rem' }}>
                                    <CameraOff size={16} color="#fca5a5" />
                                    <span style={{ fontSize: '0.55rem', color: '#fca5a5', textAlign: 'center' }}>Camera denied</span>
                                </div>
                            )}
                        </div>

                        {/* Camera Status */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                {camera.videoEnabled ? <Camera size={10} color="#10b981" /> : <CameraOff size={10} color="#ef4444" />}
                                {camera.videoEnabled ? 'Cam' : 'Off'}
                            </span>
                            {camera.cameraBlockedCount > 0 && <span style={{ color: '#ef4444' }}>Blk:{camera.cameraBlockedCount}</span>}
                            {objectDetection.phoneDetectionCount > 0 && <span style={{ color: '#ef4444' }}>📱{objectDetection.phoneDetectionCount}</span>}
                            {objectDetection.faceMissingCount > 0 && <span style={{ color: '#f59e0b' }}>👤{objectDetection.faceMissingCount}</span>}
                        </div>

                        {/* Proctoring Violations Counter */}
                        <div style={{
                            marginTop: '0.75rem',
                            padding: '0.75rem',
                            background: totalViolations > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            borderRadius: '8px',
                            border: `1px solid ${totalViolations > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
                        }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                <Shield size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                Violations
                            </div>
                            <div style={{
                                fontSize: '1rem',
                                fontWeight: 700,
                                color: totalViolations > 0 ? '#ef4444' : '#10b981'
                            }}>
                                {totalViolations} / {MAX_VIOLATIONS}
                            </div>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        style={{
                            marginTop: '1.5rem',
                            width: '100%',
                            padding: '1rem',
                            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                            border: 'none',
                            borderRadius: '12px',
                            color: 'white',
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            opacity: isSubmitting ? 0.7 : 1
                        }}
                    >
                        <Send size={18} />
                        {isSubmitting ? 'Submitting...' : 'Submit Test'}
                    </button>
                </div>

                {/* Right - Question Display */}
                <div style={{
                    flex: 1,
                    padding: '2rem 4rem',
                    overflowY: 'auto'
                }}>
                    {questions[currentQuestion] && (
                        <>
                            <div style={{ marginBottom: '2rem' }}>
                                <span style={{
                                    color: '#8b5cf6',
                                    fontSize: '0.9rem',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em'
                                }}>
                                    Question {currentQuestion + 1} of {questions.length}
                                </span>
                                <h2 style={{
                                    margin: '1rem 0',
                                    fontSize: '1.5rem',
                                    fontWeight: 600,
                                    color: 'white',
                                    lineHeight: 1.5
                                }}>
                                    {questions[currentQuestion].question}
                                </h2>
                                {questions[currentQuestion].category && (
                                    <span style={{
                                        display: 'inline-block',
                                        padding: '0.25rem 0.75rem',
                                        background: 'rgba(139, 92, 246, 0.2)',
                                        borderRadius: '20px',
                                        fontSize: '0.8rem',
                                        color: '#a78bfa'
                                    }}>
                                        {questions[currentQuestion].category}
                                    </span>
                                )}
                            </div>

                            {/* Options */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {questions[currentQuestion].options.map((option, idx) => {
                                    const optionLetter = ['A', 'B', 'C', 'D'][idx]
                                    const isSelected = answers[questions[currentQuestion].id] === option

                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => handleAnswerSelect(questions[currentQuestion].id, option)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '1rem',
                                                padding: '1.25rem 1.5rem',
                                                background: isSelected
                                                    ? 'rgba(59, 130, 246, 0.15)'
                                                    : 'rgba(30, 41, 59, 0.8)',
                                                border: isSelected
                                                    ? '2px solid #3b82f6'
                                                    : '1px solid rgba(71, 85, 105, 0.5)',
                                                borderRadius: '12px',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{
                                                width: '36px',
                                                height: '36px',
                                                borderRadius: '50%',
                                                background: isSelected
                                                    ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                                                    : 'rgba(71, 85, 105, 0.5)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'white',
                                                fontWeight: 700,
                                                fontSize: '0.9rem'
                                            }}>
                                                {optionLetter}
                                            </div>
                                            <span style={{
                                                color: isSelected ? '#3b82f6' : 'rgba(255,255,255,0.9)',
                                                fontSize: '1.05rem',
                                                fontWeight: isSelected ? 600 : 400
                                            }}>
                                                {option}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Navigation */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginTop: '3rem'
                            }}>
                                <button
                                    onClick={() => setCurrentQuestion(prev => Math.max(0, prev - 1))}
                                    disabled={currentQuestion === 0}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.75rem 1.5rem',
                                        background: 'rgba(71, 85, 105, 0.5)',
                                        border: 'none',
                                        borderRadius: '8px',
                                        color: currentQuestion === 0 ? 'rgba(255,255,255,0.3)' : 'white',
                                        cursor: currentQuestion === 0 ? 'not-allowed' : 'pointer',
                                        fontSize: '0.95rem',
                                        fontWeight: 500
                                    }}
                                >
                                    <ChevronLeft size={20} /> Previous
                                </button>

                                <button
                                    onClick={() => setCurrentQuestion(prev => Math.min(questions.length - 1, prev + 1))}
                                    disabled={currentQuestion === questions.length - 1}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        padding: '0.75rem 1.5rem',
                                        background: currentQuestion === questions.length - 1
                                            ? 'rgba(71, 85, 105, 0.5)'
                                            : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                        border: 'none',
                                        borderRadius: '8px',
                                        color: currentQuestion === questions.length - 1 ? 'rgba(255,255,255,0.3)' : 'white',
                                        cursor: currentQuestion === questions.length - 1 ? 'not-allowed' : 'pointer',
                                        fontSize: '0.95rem',
                                        fontWeight: 500
                                    }}
                                >
                                    Next <ChevronRight size={20} />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default AptitudeTestInterface
