import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { X, Clock, ChevronLeft, ChevronRight, Send, AlertTriangle, Brain, FileText, Layers, Code, Database, CheckCircle, XCircle, Video, VideoOff, Mic, MicOff, Shield, Eye, Smartphone, Target, Play, Lightbulb, Zap, Award, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import Editor from '@monaco-editor/react'
import axios from 'axios'
import * as tf from '@tensorflow/tfjs'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import CodeOutputPreview from '@/components/CodeOutputPreview'
import SQLValidator from '@/components/SQLValidator'
import SQLVisualizer from '@/components/SQLVisualizer'
import SQLDebugger from '@/components/SQLDebugger'
import socketService from '@/services/socketService'
import proctoringSocketAdapter from '@/services/proctoringSocketAdapter'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000') + '/api'



const LANGUAGE_CONFIG = {
    'Python': { monacoLang: 'python', ext: '.py', defaultCode: `# Write your Python code here\n\ndef solution():\n    pass\n\n# Call your solution\nsolution()` },
    'JavaScript': { monacoLang: 'javascript', ext: '.js', defaultCode: `// Write your JavaScript code here\n\nfunction solution() {\n    \n}\n\n// Call your solution\nsolution();` },
    'Java': { monacoLang: 'java', ext: '.java', defaultCode: `// Write your Java code here\n\npublic class Solution {\n    public static void main(String[] args) {\n        // Your code here\n    }\n}` },
    'C': { monacoLang: 'c', ext: '.c', defaultCode: `// Write your C code here\n#include <stdio.h>\n\nint main() {\n    // Your code here\n    return 0;\n}` },
    'C++': { monacoLang: 'cpp', ext: '.cpp', defaultCode: `// Write your C++ code here\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // Your code here\n    return 0;\n}` },
    'SQL': { monacoLang: 'sql', ext: '.sql', defaultCode: `-- Write your SQL query here\nSELECT * FROM table_name;` }
}

const SECTION_META = {
    aptitude: { label: 'Aptitude', icon: Brain },
    verbal: { label: 'Verbal', icon: FileText },
    logical: { label: 'Logical', icon: Layers },
    coding: { label: 'Coding', icon: Code },
    sql: { label: 'SQL', icon: Database }
}

function seededShuffle(arr, seed) {
    const a = [...arr]
    let i = a.length
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
    while (i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

function generateSeed(studentId, testId) {
    let h = 0
    const s = `${studentId}-${testId}`
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0
    return Math.abs(h)
}

const cleanCode = (code) => {
    if (!code) return ''
    let cleaned = code
    // Check for markdown code blocks
    if (cleaned.includes('```')) {
        const lines = cleaned.split('\n')
        // Filter out lines that start with ```
        cleaned = lines.filter(l => !l.trim().startsWith('```')).join('\n')
    }
    return cleaned
}

export default function GlobalTestInterface({ test, user, onClose, onComplete }) {
    const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
    const [answers, setAnswers] = useState({})
    const [timeLeft, setTimeLeft] = useState((test.duration || 180) * 60)
    const [tabSwitches, setTabSwitches] = useState(0)
    const [showWarning, setShowWarning] = useState(false)
    const [warningMessage, setWarningMessage] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [result, setResult] = useState(null)
    const [showResult, setShowResult] = useState(false)

    // Coding/Running State
    const [isRunning, setIsRunning] = useState(false)
    const [consoleOutput, setConsoleOutput] = useState({})
    const [hint, setHint] = useState('')
    const [loadingHint, setLoadingHint] = useState(false)
    const [isConsoleOpen, setIsConsoleOpen] = useState(true)
    const [consoleHeight, setConsoleHeight] = useState(350) // Default height in pixels
    const consoleResizeRef = useRef(null)
    const isResizingRef = useRef(false)

    const [activeTab, setActiveTab] = useState({}) // { [id]: 'input' | 'output' | 'tests' }
    const [customInputs, setCustomInputs] = useState({})
    const [testResults, setTestResults] = useState({})
    const [selectedLanguages, setSelectedLanguages] = useState({}) // { [id]: 'Python' }

    // SQL Tools State
    const [sqlTool, setSqlTool] = useState('validator') // 'validator', 'visualizer', 'debugger'

    const timerRef = useRef(null)
    const answersRef = useRef(answers)
    const tabSwitchesRef = useRef(tabSwitches)
    const timeLeftRef = useRef(timeLeft)
    const submittedRef = useRef(false)

    // Enhanced Proctoring State
    const proctoring = test.proctoring || {}
    const [videoEnabled, setVideoEnabled] = useState(false)
    const [audioEnabled, setAudioEnabled] = useState(false)
    const [mediaStream, setMediaStream] = useState(null)
    const [cameraBlocked, setCameraBlocked] = useState(false)
    const [cameraBlockedCount, setCameraBlockedCount] = useState(0)
    const [cameraReady, setCameraReady] = useState(false)
    const [cameraAccessDenied, setCameraAccessDenied] = useState(false)
    const [showCameraSetup, setShowCameraSetup] = useState(proctoring.enabled && proctoring.enableVideoAudio)
    const [phoneDetected, setPhoneDetected] = useState(false)
    const [phoneDetectionCount, setPhoneDetectionCount] = useState(0)
    const [copyPasteAttempts, setCopyPasteAttempts] = useState(0)
    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const cameraCheckIntervalRef = useRef(null)
    const objectDetectorRef = useRef(null)
    const phoneCheckIntervalRef = useRef(null)
    const cameraBlockedCountRef = useRef(0)
    const phoneDetectionCountRef = useRef(0)
    const copyPasteAttemptsRef = useRef(0)
    const [faceMissingCount, setFaceMissingCount] = useState(0)
    const faceMissingCountRef = useRef(0)
    const cameraBlockedRef = useRef(false)

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

    // ── Behavior Agent Tracking ──
    const behaviorSessionId = useRef(`beh_${user.id}_${test.id}_${Date.now()}`)
    const behaviorEventsBuffer = useRef([])
    const lastKeystrokeTime = useRef(Date.now())
    const codeSnapshotInterval = useRef(null)
    const behaviorSendInterval = useRef(null)
    const lastCodeSnapshot = useRef('')
    const idleTimerRef = useRef(null)
    const BEHAVIOR_SEND_INTERVAL_MS = 15000
    const CODE_SNAPSHOT_INTERVAL_MS = 30000
    const IDLE_DETECT_MS = 30000

    const sectionsWithQuestions = useMemo(() => {
        const bySection = test.questionsBySection || {}
        return ['aptitude', 'verbal', 'logical', 'coding', 'sql'].filter(s => (bySection[s] && bySection[s].length) > 0)
    }, [test.questionsBySection])

    const allQuestions = useMemo(() => {
        const bySection = test.questionsBySection || {}
        const seed = generateSeed(user.id, test.id)
        const list = []
        sectionsWithQuestions.forEach(section => {
            const qs = (bySection[section] || []).map(q => ({ ...q, section }))
            list.push(...seededShuffle(qs, seed + section.length))
        })
        return list
    }, [test.questionsBySection, sectionsWithQuestions, user.id, test.id])

    const currentSection = sectionsWithQuestions[currentSectionIndex] || sectionsWithQuestions[0]
    const sectionQuestions = allQuestions.filter(q => q.section === currentSection)
    const currentQ = sectionQuestions[currentQuestionIndex]
    const totalQuestions = allQuestions.length

    useEffect(() => { answersRef.current = answers }, [answers])
    useEffect(() => { tabSwitchesRef.current = tabSwitches }, [tabSwitches])
    useEffect(() => { timeLeftRef.current = timeLeft }, [timeLeft])

    // ── Auto-terminate test (used by unified counter + agent) ──
    const autoTerminateTest = useCallback(async (reason) => {
        if (terminatedRef.current) return
        terminatedRef.current = true
        submittedRef.current = true
        setAgentTerminated(true)
        setTerminateReason(reason)
        setShowWarning(true)
        setWarningMessage('🛑 Test terminated — submitting your work')
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        if (mediaStream) mediaStream.getTracks().forEach(t => t.stop())
        if (cameraCheckIntervalRef.current) clearInterval(cameraCheckIntervalRef.current)
        if (phoneCheckIntervalRef.current) clearInterval(phoneCheckIntervalRef.current)
        if (monitorCheckIntervalRef.current) clearInterval(monitorCheckIntervalRef.current)
        try {
            const timeSpent = (test.duration || 120) * 60 - timeLeftRef.current
            proctoringSocketAdapter.emitSubmissionCompleted(user.id, user.name || user.email, test.id, test.title, null, 'terminated', 0)
            const res = await axios.post(`${API_BASE}/global-tests/${test.id}/submit`, {
                studentId: user.id,
                answers: answersRef.current,
                selectedLanguages: {},
                timeSpent,
                tabSwitches: tabSwitchesRef.current,
                copyPasteAttempts: copyPasteAttemptsRef.current,
                cameraBlockedCount: cameraBlockedCountRef.current,
                phoneDetectionCount: phoneDetectionCountRef.current,
                faceMissingCount: faceMissingCountRef.current,
                proctoringEnabled: true,
                submissionType: 'auto_terminated',
                terminationReason: reason
            })
            const submissionResult = res.data.submission || res.data
            setTimeout(() => { onClose(); onComplete && onComplete(submissionResult) }, 3000)
        } catch (err) {
            console.error('Auto-terminate submission failed:', err)
            setTimeout(() => { onClose() }, 3000)
        }
    }, [user, test, mediaStream, onClose, onComplete])

    // ── Unified violation recorder (logs to backend + checks threshold) ──
    const recordViolation = useCallback((eventType = 'unknown', severity = 'low') => {
        if (terminatedRef.current) return
        totalViolationsRef.current += 1
        const count = totalViolationsRef.current
        setTotalViolations(count)
        axios.post(`${API_BASE}/proctoring/log`, {
            userId: user.id,
            sessionId: behaviorSessionId.current,
            eventType,
            severity,
            details: `Violation ${count}/${MAX_VIOLATIONS}`
        }).catch(() => {})
        if (count >= MAX_VIOLATIONS) {
            autoTerminateTest(`Maximum proctoring violations reached (${count}/${MAX_VIOLATIONS}). Your test has been automatically terminated.`)
        }
    }, [autoTerminateTest, user.id])

    // ── Behavior Agent: push event, flush to backend ──
    const pushBehaviorEvent = useCallback((type, data = {}) => {
        behaviorEventsBuffer.current.push({ type, timestamp: new Date().toISOString(), ...data })
    }, [])

    const flushBehaviorEvents = useCallback(async () => {
        if (behaviorEventsBuffer.current.length === 0) return
        const events = [...behaviorEventsBuffer.current]
        behaviorEventsBuffer.current = []
        try {
            await axios.post(`${API_BASE}/behavior/log-events`, {
                session_id: behaviorSessionId.current,
                user_id: user.id,
                events,
            })
        } catch {
            if (behaviorEventsBuffer.current.length < 500) {
                behaviorEventsBuffer.current = [...events, ...behaviorEventsBuffer.current]
            }
        }
    }, [user.id])

    // Handle fullscreen - runs once on mount, cleaned up on unmount
    // Uses submittedRef (synchronous) instead of state to avoid stale closures
    useEffect(() => {
        const enterFullscreen = async () => {
            try {
                if (!document.fullscreenElement && !submittedRef.current) {
                    await document.documentElement.requestFullscreen()
                }
            } catch (_) { }
        }

        // Enter fullscreen on mount
        enterFullscreen()

        // Re-enter fullscreen if user exits during test (proctored tests)
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement && !submittedRef.current && proctoring.enabled) {
                setWarningMessage('⚠️ Fullscreen mode required! Re-entering...')
                setShowWarning(true)
                setTimeout(() => {
                    if (!submittedRef.current) {
                        enterFullscreen()
                    }
                    setShowWarning(false)
                }, 1500)
            }
        }

        document.addEventListener('fullscreenchange', handleFullscreenChange)

        // Initialize Socket Connection (once on mount)
        if (test && user) {
            socketService.emitSubmissionStarted(
                user.id,
                user.name || user.email,
                test.id,
                test.title,
                null, // mentorId
                test.proctoring?.enabled || false
            )
        }

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange)
            // Only exit fullscreen on unmount if test wasn't submitted
            // (submitted tests handle their own fullscreen exit in handleSubmit)
            if (document.fullscreenElement && !submittedRef.current) {
                document.exitFullscreen().catch(() => { })
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Run once on mount — all checks use submittedRef (synchronous)

    useEffect(() => {
        if (result || !totalQuestions) return
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current)
                    handleSubmit(true)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(timerRef.current)
    }, [result, totalQuestions])

    const maxTabSwitches = test.maxTabSwitches ?? 3
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden && !result && !terminatedRef.current) {
                setTabSwitches(prev => {
                    const next = prev + 1
                    socketService.emitProctoringViolation(
                        user.id,
                        user.name || user.email,
                        'window_switch',
                        next >= maxTabSwitches ? 'critical' : 'warning',
                        null
                    )
                    recordViolation('window_switch', next >= maxTabSwitches ? 'critical' : 'warning')
                    if (next >= maxTabSwitches) {
                        setWarningMessage(`Disqualified: max tab switches (${next}) exceeded.`)
                        setShowWarning(true)
                        setTimeout(() => handleSubmit(true), 2000)
                    } else {
                        setWarningMessage(`Tab switch detected (${next}/${maxTabSwitches}).`)
                        setShowWarning(true)
                        setTimeout(() => setShowWarning(false), 3000)
                    }
                    return next
                })
            }
        }
        // Window blur detection (catches focus loss not caught by visibilitychange)
        const handleBlur = () => {
            if (!document.hidden && !result && !terminatedRef.current) {
                recordViolation('window_blur', 'medium')
                pushBehaviorEvent('blur')
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)
        window.addEventListener('blur', handleBlur)
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility)
            window.removeEventListener('blur', handleBlur)
        }
    }, [result, maxTabSwitches, recordViolation, pushBehaviorEvent])

    // Function to initialize camera - called when user clicks "Allow Camera"
    const initializeCamera = async () => {
        try {
            // Pick the first local webcam to avoid Windows phone-camera picker
            const devices = await navigator.mediaDevices.enumerateDevices()
            const webcam = devices.find(d => d.kind === 'videoinput' && d.deviceId)
            const videoConstraints = webcam?.deviceId
                ? { deviceId: { exact: webcam.deviceId }, width: 320, height: 240 }
                : { facingMode: 'user', width: 320, height: 240 }
            const stream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints,
                audio: true
            })
            setMediaStream(stream)
            setVideoEnabled(true)
            setAudioEnabled(true)
            setCameraReady(true)
            setCameraAccessDenied(false)
            if (videoRef.current) {
                videoRef.current.srcObject = stream
                videoRef.current.play().catch(() => { })
            }
            if (proctoring.detectCameraBlocking) {
                cameraCheckIntervalRef.current = setInterval(checkCameraObstruction, 1500) // Check more frequently
            }

            // Load Object Detection Model
            if (proctoring.detectPhoneUsage || proctoring.detectCameraBlocking) {
                try {
                    await tf.ready()
                    const model = await cocoSsd.load()
                    objectDetectorRef.current = model
                    phoneCheckIntervalRef.current = setInterval(detectObjects, 3000)
                } catch (e) {
                    console.warn('Failed to load object detector:', e)
                }
            }
            return true
        } catch (e) {
            console.error('Camera access denied:', e)
            setCameraAccessDenied(true)
            setCameraReady(false)
            return false
        }
    }

    // Enhanced Proctoring: Video/Audio Initialization
    useEffect(() => {
        // Only auto-init if proctoring is NOT enabled (non-proctored tests)
        // For proctored tests, we wait for user to click "Start Test" in the camera setup modal
        if (proctoring.enabled && proctoring.enableVideoAudio) {
            // Don't auto-initialize - wait for camera setup modal
            return
        }

        // For non-proctored tests, just continue normally
        if (!proctoring.enabled || !proctoring.enableVideoAudio) {
            setCameraReady(true)
            setShowCameraSetup(false)
        }
        return () => {
            if (cameraCheckIntervalRef.current) clearInterval(cameraCheckIntervalRef.current)
            if (phoneCheckIntervalRef.current) clearInterval(phoneCheckIntervalRef.current)
            if (mediaStream) mediaStream.getTracks().forEach(t => t.stop())
        }
    }, [proctoring.enabled, proctoring.enableVideoAudio])

    useEffect(() => { cameraBlockedRef.current = cameraBlocked }, [cameraBlocked])

    const detectObjects = useCallback(async () => {
        if (!objectDetectorRef.current || !videoRef.current || videoRef.current.readyState !== 4) return

        try {
            const predictions = await objectDetectorRef.current.detect(videoRef.current)

            // Phone Detection
            if (proctoring.detectPhoneUsage) {
                const phone = predictions.find(p => p.class === 'cell phone' && p.score > 0.6)
                if (phone) {
                    setPhoneDetected(true)
                    setPhoneDetectionCount(prev => {
                        const next = prev + 1
                        phoneDetectionCountRef.current = next
                        setWarningMessage(`📵 Mobile Phone Detected! (${next})`)
                        setShowWarning(true)
                        setTimeout(() => setShowWarning(false), 3000)
                        // Emit proctoring violation to server for admin monitoring
                        socketService.emitProctoringViolation(
                            user.id,
                            user.name || user.email,
                            'phone_detected',
                            next >= 3 ? 'critical' : 'warning',
                            null
                        )
                        recordViolation('phone_detected', next >= 3 ? 'critical' : 'warning')
                        return next
                    })
                } else {
                    setPhoneDetected(false)
                }
            }

            // Face/Person Detection
            const person = predictions.find(p => p.class === 'person' && p.score > 0.5)
            if (!person && !cameraBlockedRef.current) {
                setFaceMissingCount(prev => {
                    const next = prev + 1
                    faceMissingCountRef.current = next
                    // Emit proctoring violation to server for admin monitoring (only every 3rd occurrence to reduce spam)
                    if (next % 3 === 0) {
                        socketService.emitProctoringViolation(
                            user.id,
                            user.name || user.email,
                            'face_not_detected',
                            next >= 9 ? 'critical' : 'warning',
                            null
                        )
                        recordViolation('face_not_detected', next >= 9 ? 'critical' : 'warning')
                    }
                    return next
                })
            }

        } catch (e) {
            console.error('Detection error:', e)
        }
    }, [proctoring.detectPhoneUsage])

    const checkCameraObstruction = useCallback(() => {
        if (!videoRef.current || !canvasRef.current) return
        const video = videoRef.current
        const canvas = canvasRef.current

        // Check if video is actually playing and has frames
        if (video.readyState < 2 || video.videoWidth === 0) return

        const ctx = canvas.getContext('2d')
        canvas.width = video.videoWidth || 320
        canvas.height = video.videoHeight || 240
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data
        let totalBrightness = 0
        let darkPixelCount = 0
        let pixelCount = canvas.width * canvas.height

        for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
            totalBrightness += brightness
            if (brightness < 15) darkPixelCount++
        }

        const avgBrightness = totalBrightness / pixelCount
        const darkPixelRatio = darkPixelCount / pixelCount

        // Camera is blocked if average brightness is very low OR most pixels are dark
        const isBlocked = avgBrightness < 25 || darkPixelRatio > 0.85

        if (isBlocked && !cameraBlockedRef.current) {
            cameraBlockedRef.current = true
            setCameraBlocked(true)
            setCameraBlockedCount(prev => {
                const next = prev + 1
                cameraBlockedCountRef.current = next
                setWarningMessage(`⚠️ Camera blocked detected! Please uncover your camera. (${next})`)
                setShowWarning(true)
                // Emit proctoring violation to server for admin monitoring
                socketService.emitProctoringViolation(
                    user.id,
                    user.name || user.email,
                    'camera_blocked',
                    next >= 3 ? 'critical' : 'warning',
                    null
                )
                recordViolation('camera_blocked', next >= 3 ? 'critical' : 'warning')
                return next
            })
        } else if (!isBlocked && cameraBlockedRef.current) {
            cameraBlockedRef.current = false
            setCameraBlocked(false)
            setShowWarning(false)
        }
    }, [user])

    useEffect(() => {
        if (!proctoring.enabled || !proctoring.disableCopyPaste) return
        const handleCopy = (e) => {
            e.preventDefault()
            setCopyPasteAttempts(prev => {
                const next = prev + 1
                copyPasteAttemptsRef.current = next
                setWarningMessage(`📋 Copy attempt blocked! (${next})`)
                setShowWarning(true)
                setTimeout(() => setShowWarning(false), 2000)
                // Emit proctoring violation to server for admin monitoring
                socketService.emitProctoringViolation(
                    user.id,
                    user.name || user.email,
                    'copy_attempt',
                    next >= 5 ? 'critical' : 'warning',
                    null
                )
                recordViolation('copy_attempt', next >= 5 ? 'critical' : 'warning')
                return next
            })
        }
        const handlePaste = (e) => {
            e.preventDefault()
            setCopyPasteAttempts(prev => {
                const next = prev + 1
                copyPasteAttemptsRef.current = next
                setWarningMessage(`📋 Paste attempt blocked! (${next})`)
                setShowWarning(true)
                setTimeout(() => setShowWarning(false), 2000)
                // Emit proctoring violation to server for admin monitoring
                socketService.emitProctoringViolation(
                    user.id,
                    user.name || user.email,
                    'paste_attempt',
                    next >= 5 ? 'critical' : 'warning',
                    null
                )
                recordViolation('paste_attempt', next >= 5 ? 'critical' : 'warning')
                return next
            })
        }
        const handleContextMenu = (e) => e.preventDefault()
        document.addEventListener('copy', handleCopy)
        document.addEventListener('paste', handlePaste)
        document.addEventListener('contextmenu', handleContextMenu)
        return () => {
            document.removeEventListener('copy', handleCopy)
            document.removeEventListener('paste', handlePaste)
            document.removeEventListener('contextmenu', handleContextMenu)
        }
    }, [proctoring.enabled, proctoring.disableCopyPaste])

    useEffect(() => { cameraBlockedCountRef.current = cameraBlockedCount }, [cameraBlockedCount])
    useEffect(() => { phoneDetectionCountRef.current = phoneDetectionCount }, [phoneDetectionCount])
    useEffect(() => { copyPasteAttemptsRef.current = copyPasteAttempts }, [copyPasteAttempts])
    useEffect(() => { faceMissingCountRef.current = faceMissingCount }, [faceMissingCount])

    // ── DevTools Blocking ──
    useEffect(() => {
        if (!proctoring.enabled) return
        const preventKeys = (e) => {
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
            }
        }
        document.addEventListener('keydown', preventKeys, true)
        return () => document.removeEventListener('keydown', preventKeys, true)
    }, [proctoring.enabled, recordViolation, user])

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
        if (!proctoring.enabled) return
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
    }, [proctoring.enabled, detectMultipleMonitors])

    // ── Proctor Agent Termination Listener ──
    useEffect(() => {
        if (!proctoring.enabled) return
        proctoringSocketAdapter.connect()
        proctoringSocketAdapter.joinStudentSession(user.id, behaviorSessionId.current)
        const handleTerminate = (data) => {
            console.error('[ProctorAgent] TEST TERMINATED BY AGENT:', data)
            autoTerminateTest(data?.reason || 'Your test has been terminated by the Proctoring Intelligence Agent due to integrity violations.')
        }
        proctoringSocketAdapter.onAgentTerminate(handleTerminate)
        return () => {
            proctoringSocketAdapter.removeListener('agent_terminate')
        }
    }, [proctoring.enabled, user.id, autoTerminateTest])

    // ── Behavior Agent: periodic flush + engagement tracking ──
    useEffect(() => {
        if (!proctoring.enabled) return
        behaviorSendInterval.current = setInterval(flushBehaviorEvents, BEHAVIOR_SEND_INTERVAL_MS)

        const throttle = (fn, ms) => { let last = 0; return () => { const now = Date.now(); if (now - last > ms) { last = now; fn() } } }
        const handleMouseMove = throttle(() => pushBehaviorEvent('mouse'), 5000)
        const handleScroll = throttle(() => pushBehaviorEvent('scroll'), 5000)
        const handleFocus = () => pushBehaviorEvent('focus')
        const handleBlur = () => pushBehaviorEvent('blur')

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('scroll', handleScroll, true)
        window.addEventListener('focus', handleFocus)
        window.addEventListener('blur', handleBlur)

        return () => {
            if (behaviorSendInterval.current) clearInterval(behaviorSendInterval.current)
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('scroll', handleScroll, true)
            window.removeEventListener('focus', handleFocus)
            window.removeEventListener('blur', handleBlur)
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
            flushBehaviorEvents()
        }
    }, [proctoring.enabled, flushBehaviorEvents, pushBehaviorEvent])

    const handleAnswerSelect = (questionId, answer) => {
        setAnswers(prev => ({ ...prev, [questionId]: answer }))
    }

    // Initialize code/SQL from starter or default
    useEffect(() => {
        if (!currentQ) return
        const isCodingOrSql = (currentQ.questionType === 'coding' || currentQ.questionType === 'sql' || currentQ.type === 'coding' || currentQ.type === 'SQL')

        if (isCodingOrSql) {
            // Determine initial language
            const defaultLang = currentQ.type === 'SQL' || currentQ.questionType === 'sql' ? 'SQL' : (currentQ.testCases?.language || 'Python')

            // Set selected language if not set
            if (!selectedLanguages[currentQ.id]) {
                // Normalize to Capitalized key if needed (e.g. 'python' -> 'Python')
                const key = Object.keys(LANGUAGE_CONFIG).find(k => k.toLowerCase() === defaultLang.toLowerCase()) || 'Python'
                setSelectedLanguages(prev => ({ ...prev, [currentQ.id]: key }))

                // Set initial answer if empty
                if (answers[currentQ.id] === undefined) {
                    // Always use default starter to prevent AI solution leakage
                    const starter = LANGUAGE_CONFIG[key].defaultCode
                    setAnswers(prev => ({ ...prev, [currentQ.id]: starter }))
                }
            }
        }
    }, [currentQ?.id, currentQ?.questionType, currentQ?.starterCode, currentQ?.testCases?.language])

    const handleLanguageChange = (questionId, newLang) => {
        // Removed confirm dialog to prevent exiting fullscreen
        if (answers[questionId] && answers[questionId] !== LANGUAGE_CONFIG[selectedLanguages[questionId]]?.defaultCode) {
            // Silently overwrite or maybe show a non-intrusive toast in future
        }
        setSelectedLanguages(prev => ({ ...prev, [questionId]: newLang }))
        setAnswers(prev => ({ ...prev, [questionId]: LANGUAGE_CONFIG[newLang].defaultCode }))
    }

    const handleRunCode = async (questionId, code, language, sqlSchema) => {
        setConsoleOutput(prev => ({ ...prev, [questionId]: 'Running...' }))
        setActiveTab(prev => ({ ...prev, [questionId]: 'output' }))

        try {
            const res = await axios.post(`${API_BASE}/run`, {
                code,
                language,
                problemId: questionId,
                sqlSchema,
                stdin: customInputs[questionId] || ''
            })
            // Show both stdout and stderr if available
            let output = res.data.output || ''
            if (res.data.stderr) {
                output = output ? `${output}\n\n--- Errors ---\n${res.data.stderr}` : res.data.stderr
            }
            setConsoleOutput(prev => ({ ...prev, [questionId]: output || res.data.error || 'No output' }))
        } catch (err) {
            setConsoleOutput(prev => ({ ...prev, [questionId]: 'Error: ' + (err.response?.data?.error || err.message) }))
        } finally {
            setIsRunning(false)
        }
    }

    const handleGetHint = async () => {
        if (!currentQ) return
        setLoadingHint(true)
        try {
            const isSqlQ = currentQ.type === 'SQL' || currentQ.questionType === 'sql'
            const lang = selectedLanguages[currentQ.id] || (isSqlQ ? 'SQL' : 'Python')
            const res = await axios.post(`${API_BASE}/hints`, {
                problemDescription: currentQ.question,
                currentCode: answers[currentQ.id] || '',
                language: lang
            })
            setHint(res.data.hint)
        } catch (err) {
            setHint('Unable to generate hint at this time.')
        } finally {
            setLoadingHint(false)
        }
    }

    const handleSubmit = async (auto = false) => {
        if (isSubmitting || terminatedRef.current) return
        if (!auto && totalQuestions > 0 && Object.keys(answers).length < totalQuestions) {
            if (!window.confirm(`You have ${totalQuestions - Object.keys(answers).length} unanswered. Submit anyway?`)) return
        }

        // Mark as submitted FIRST — prevents fullscreen re-entry during entire submission
        submittedRef.current = true
        setIsSubmitting(true)

        // Flush behavior events before submission
        await flushBehaviorEvents()

        if (mediaStream) {
            mediaStream.getTracks().forEach(t => t.stop())
        }
        if (cameraCheckIntervalRef.current) clearInterval(cameraCheckIntervalRef.current)
        if (phoneCheckIntervalRef.current) clearInterval(phoneCheckIntervalRef.current)
        if (monitorCheckIntervalRef.current) clearInterval(monitorCheckIntervalRef.current)

        // Exit fullscreen immediately before making the API call
        if (document.fullscreenElement) {
            try {
                await document.exitFullscreen()
            } catch (_) { }
        }

        try {
            const timeSpent = (test.duration || 120) * 60 - timeLeftRef.current

            // Emit completion to live monitoring
            if (user && test) {
                proctoringSocketAdapter.emitSubmissionCompleted(
                    user.id,
                    user.name || user.email,
                    test.id,
                    test.title,
                    null,
                    'success',
                    Math.round(((Object.keys(answersRef.current).length) / totalQuestions) * 100)
                )
            }

            const res = await axios.post(`${API_BASE}/global-tests/${test.id}/submit`, {
                studentId: user.id,
                answers: answersRef.current,
                selectedLanguages: selectedLanguages,
                timeSpent,
                tabSwitches: tabSwitchesRef.current,
                copyPasteAttempts: copyPasteAttemptsRef.current,
                cameraBlockedCount: cameraBlockedCountRef.current,
                phoneDetectionCount: phoneDetectionCountRef.current,
                faceMissingCount: faceMissingCountRef.current,
                totalViolations: totalViolationsRef.current,
                multipleMonitorCount,
                proctoringEnabled: proctoring.enabled || false,
                behaviorSessionId: behaviorSessionId.current
            })
            console.log('[Submit] Response received:', JSON.stringify(res.data).substring(0, 500))

            // Ensure we have valid result data
            const submissionResult = res.data.submission || res.data
            console.log('[Submit] submissionResult status:', submissionResult?.status, 'score:', submissionResult?.score, 'sectionScores:', JSON.stringify(submissionResult?.sectionScores))

            if (submissionResult) {
                // Small delay to ensure fullscreen exit has completed
                await new Promise(resolve => setTimeout(resolve, 200))
                console.log('[Submit] Submission successful, returning to test list...')
                setIsSubmitting(false)
                // Instead of rendering result inline (which causes black screen due to
                // fullscreen/proctoring state conflicts), unmount entirely and let
                // the parent component handle result display
                onClose()
                onComplete && onComplete(submissionResult)
            } else {
                console.error('[Submit] No submission data in response')
                setIsSubmitting(false)
                alert('Test submitted but no result data received. Please refresh the page.')
            }
        } catch (e) {
            console.error('[Submit] Error:', e)
            setIsSubmitting(false)
            alert(e.response?.data?.error || 'Submit failed. Please try again.')
        }
    }

    const formatTime = (s) => {
        const m = Math.floor(s / 60)
        const sec = s % 60
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    }

    const nextQuestion = () => {
        if (currentQuestionIndex < sectionQuestions.length - 1) setCurrentQuestionIndex(i => i + 1)
        else if (currentSectionIndex < sectionsWithQuestions.length - 1) {
            setCurrentSectionIndex(currentSectionIndex + 1)
            setCurrentQuestionIndex(0)
        }
    }

    const prevQuestion = () => {
        if (currentQuestionIndex > 0) setCurrentQuestionIndex(i => i - 1)
        else if (currentSectionIndex > 0) {
            const prevSec = sectionsWithQuestions[currentSectionIndex - 1]
            const prevLen = allQuestions.filter(q => q.section === prevSec).length
            setCurrentSectionIndex(currentSectionIndex - 1)
            setCurrentQuestionIndex(prevLen - 1)
        }
    }

    if (showResult && result) {
        const sectionScores = result.sectionScores || {}
        const isPassed = result.status === 'passed'
        return (
            <div style={{
                position: 'fixed',
                inset: 0,
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
                overflow: 'auto',
                animation: 'fadeIn 0.3s ease-out'
            }}>
                <style>{`
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
                    @keyframes confetti { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(-100px) rotate(720deg); opacity: 0; } }
                `}</style>

                <div style={{
                    background: 'rgba(30,41,59,0.98)',
                    borderRadius: '24px',
                    border: `2px solid ${isPassed ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                    maxWidth: 800,
                    width: '100%',
                    maxHeight: '90vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: `0 25px 50px -12px ${isPassed ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                    animation: 'scaleIn 0.4s ease-out'
                }}>
                    {/* Header with success/fail indicator */}
                    <div style={{
                        padding: '2rem 2rem 1.5rem',
                        background: isPassed ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.1))' : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(251, 146, 60, 0.1))',
                        borderBottom: `1px solid ${isPassed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                        textAlign: 'center'
                    }}>
                        <div style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            background: isPassed ? 'linear-gradient(135deg, #10b981, #06b6d4)' : 'linear-gradient(135deg, #ef4444, #f97316)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1rem',
                            boxShadow: `0 8px 24px ${isPassed ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                            animation: isPassed ? 'pulse 2s ease-in-out infinite' : 'none'
                        }}>
                            {isPassed ? <Award size={40} color="white" /> : <XCircle size={40} color="white" />}
                        </div>
                        <h2 style={{ margin: '0 0 0.5rem', color: 'white', fontSize: '1.75rem', fontWeight: 800 }}>
                            {isPassed ? '🎉 Congratulations!' : 'Test Completed'}
                        </h2>
                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: '1rem' }}>
                            {isPassed ? 'You have successfully passed the assessment!' : 'Keep practicing to improve your score.'}
                        </p>
                    </div>

                    <div style={{ padding: '2rem', overflowY: 'auto' }}>
                        {/* Score Card */}
                        <div style={{
                            display: 'flex',
                            gap: '1.5rem',
                            marginBottom: '2rem',
                            flexWrap: 'wrap',
                            justifyContent: 'center'
                        }}>
                            <div style={{
                                padding: '1.5rem 2.5rem',
                                background: isPassed ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                borderRadius: 16,
                                border: `2px solid ${isPassed ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
                                textAlign: 'center',
                                minWidth: '180px'
                            }}>
                                <div style={{
                                    fontSize: '3.5rem',
                                    fontWeight: 900,
                                    color: isPassed ? '#10b981' : '#ef4444',
                                    lineHeight: 1
                                }}>
                                    {result.score ?? result.overallPercentage}%
                                </div>
                                <div style={{
                                    fontSize: '0.9rem',
                                    color: 'rgba(255,255,255,0.6)',
                                    marginTop: '0.5rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '2px',
                                    fontWeight: 600
                                }}>
                                    Overall Score
                                </div>
                            </div>
                            <div style={{
                                padding: '1.5rem 2rem',
                                background: 'rgba(139, 92, 246, 0.1)',
                                borderRadius: 16,
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#a78bfa' }}>
                                    {result.correctCount || 0}/{result.totalQuestions || 0}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.25rem' }}>
                                    Correct Answers
                                </div>
                            </div>
                        </div>

                        {/* Section Scores */}
                        <h3 style={{ margin: '0 0 1rem', color: 'white', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Layers size={18} color="#8b5cf6" /> Section-wise Performance
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
                            {Object.entries(sectionScores).map(([sec, score]) => {
                                const scoreColor = score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
                                return (
                                    <div key={sec} style={{
                                        padding: '1rem',
                                        background: 'rgba(30, 41, 59, 0.8)',
                                        borderRadius: 12,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: scoreColor }}>{score}%</div>
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize', marginTop: '0.25rem' }}>{sec}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{
                        padding: '1.25rem 2rem',
                        borderTop: '1px solid rgba(139,92,246,0.2)',
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '1rem',
                        background: 'rgba(15, 23, 42, 0.5)'
                    }}>
                        <button
                            type="button"
                            onClick={() => {
                                if (document.fullscreenElement) document.exitFullscreen();
                                onClose();
                                onComplete && onComplete(result);
                            }}
                            style={{
                                padding: '0.85rem 2.5rem',
                                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                border: 'none',
                                borderRadius: '12px',
                                color: 'white',
                                fontWeight: 700,
                                fontSize: '1rem',
                                cursor: 'pointer',
                                boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)',
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={e => e.target.style.transform = 'translateY(-2px)'}
                            onMouseOut={e => e.target.style.transform = 'translateY(0)'}
                        >
                            Close & View Results
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (allQuestions.length === 0) return <div style={{ padding: '2rem', textAlign: 'center', color: 'white' }}>No questions available.<button onClick={onClose} style={{ marginLeft: '1rem', padding: '0.5rem', cursor: 'pointer' }}>Close</button></div>

    const isSql = currentQ?.questionType === 'sql' || currentQ?.questionType === 'SQL' || currentQ?.language === 'SQL' || currentQ?.type === 'SQL'
    const isCoding = (currentQ?.questionType === 'coding' || currentQ?.type === 'coding' || !!currentQ?.language) && !isSql

    const currentLang = selectedLanguages[currentQ?.id] || (isSql ? 'SQL' : 'Python')
    const codeOrSql = (isCoding || isSql) ? (answers[currentQ?.id] ?? LANGUAGE_CONFIG[currentLang]?.defaultCode ?? '') : ''

    const samples = useMemo(() => {
        if (!currentQ) return { input: 'N/A', output: 'N/A' }

        // Try top-level properties first
        if (currentQ.sampleInput !== undefined && currentQ.expectedOutput !== undefined) {
            return { input: String(currentQ.sampleInput), output: String(currentQ.expectedOutput) }
        }

        // Fallback to test cases
        if (currentQ.testCases) {
            // For SQL questions: testCases is { expectedOutput: "..." }
            // For SQL questions: testCases might be { expectedOutput: "..." } OR array of cases
            if (currentQ.questionType === 'sql' || currentQ.type === 'SQL') {
                let expectedOutput = 'N/A'
                if (Array.isArray(currentQ.testCases)) {
                    // New format: array of test cases
                    const first = currentQ.testCases[0]
                    if (first) expectedOutput = first.expected_output || first.expectedOutput || 'N/A'
                } else if (currentQ.testCases) {
                    // Legacy format: object
                    expectedOutput = currentQ.testCases.expectedOutput || 'N/A'
                }

                return {
                    input: 'N/A',
                    output: String(expectedOutput)
                }
            }

            // For coding questions: testCases has cases array
            const cases = Array.isArray(currentQ.testCases) ? currentQ.testCases : (currentQ.testCases.cases || [])
            const sample = cases.find(c => !c.isHidden) || cases[0]
            if (sample) {
                const rawInput = sample.input ?? sample.sampleInput ?? '(empty)';
                const rawOutput = sample.expected_output ?? sample.expectedOutput ?? '(empty)';
                return {
                    input: String(rawInput),
                    output: String(rawOutput)
                }
            }
        }
        return { input: 'N/A', output: 'N/A' }
    }, [currentQ])

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            {/* Professional Warning Banner */}
            {showWarning && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    padding: '0.75rem 2rem',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#1f2937',
                    textAlign: 'center',
                    zIndex: 10000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    boxShadow: '0 4px 20px rgba(245, 158, 11, 0.4)',
                    animation: 'slideDown 0.3s ease-out'
                }}>
                    <style>{`@keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }`}</style>
                    <AlertTriangle size={20} />
                    <span style={{ fontWeight: 600 }}>{warningMessage}</span>
                </div>
            )}

            {/* Submitting Overlay */}

            {/* Agent Termination Overlay */}
            {agentTerminated && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.98)',
                    zIndex: 100002, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ textAlign: 'center', maxWidth: '500px', padding: '2rem' }}>
                        <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, #ef4444, #dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4)' }}>
                            <Shield size={40} color="white" />
                        </div>
                        <h2 style={{ color: '#ef4444', fontSize: '1.75rem', fontWeight: 800, margin: '0 0 1rem' }}>Test Terminated</h2>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', lineHeight: 1.6 }}>{terminateReason}</p>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginTop: '1.5rem' }}>Your answers have been submitted. Redirecting...</p>
                    </div>
                </div>
            )}
            {isSubmitting && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.95)',
                    zIndex: 100000,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1.5rem'
                }}>
                    <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        border: '4px solid rgba(139, 92, 246, 0.2)',
                        borderTopColor: '#8b5cf6',
                        animation: 'spin 1s linear infinite'
                    }}></div>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    <h2 style={{ margin: 0, color: 'white', fontSize: '1.5rem', fontWeight: 700 }}>Submitting Your Test...</h2>
                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.95rem' }}>Please wait while we evaluate your answers</p>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6', animation: 'pulse 1.5s ease-in-out infinite' }}></div>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6', animation: 'pulse 1.5s ease-in-out 0.2s infinite' }}></div>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6', animation: 'pulse 1.5s ease-in-out 0.4s infinite' }}></div>
                    </div>
                    <style>{`@keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 1; transform: scale(1.2); } }`}</style>
                </div>
            )}

            {/* Camera Access Required Modal - Must allow camera before test starts */}
            {showCameraSetup && proctoring.enabled && proctoring.enableVideoAudio && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.98)',
                    zIndex: 100001,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem'
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                        borderRadius: '20px',
                        padding: '3rem',
                        maxWidth: '500px',
                        width: '100%',
                        border: '1px solid rgba(139, 92, 246, 0.3)',
                        boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)'
                    }}>
                        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                            <div style={{
                                width: '80px',
                                height: '80px',
                                borderRadius: '50%',
                                background: 'rgba(139, 92, 246, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 1.5rem'
                            }}>
                                <Video size={40} color="#8b5cf6" />
                            </div>
                            <h2 style={{ margin: 0, color: 'white', fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                                Camera Access Required
                            </h2>
                            <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '1rem', lineHeight: 1.6 }}>
                                This is a proctored test. You must allow camera and microphone access to continue.
                            </p>
                        </div>

                        <div style={{
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            borderRadius: '12px',
                            padding: '1rem',
                            marginBottom: '2rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                <Shield size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div style={{ fontSize: '0.9rem', color: '#fbbf24', lineHeight: 1.5 }}>
                                    <strong>Proctoring features enabled:</strong>
                                    <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
                                        {proctoring.enableVideoAudio && <li>Camera & Audio monitoring</li>}
                                        {proctoring.detectCameraBlocking && <li>Camera obstruction detection</li>}
                                        {proctoring.detectPhoneUsage && <li>Phone usage detection</li>}
                                        {proctoring.disableCopyPaste && <li>Copy/Paste disabled</li>}
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {cameraAccessDenied && (
                            <div style={{
                                background: 'rgba(239, 68, 68, 0.15)',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                borderRadius: '12px',
                                padding: '1rem',
                                marginBottom: '1.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem'
                            }}>
                                <AlertTriangle size={20} color="#ef4444" />
                                <div style={{ color: '#fca5a5', fontSize: '0.9rem' }}>
                                    Camera access was denied. Please allow camera access in your browser settings and try again.
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                onClick={onClose}
                                style={{
                                    flex: 1,
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    background: 'transparent',
                                    color: 'rgba(255,255,255,0.7)',
                                    fontSize: '1rem',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    const success = await initializeCamera()
                                    if (success) {
                                        setShowCameraSetup(false)
                                    }
                                }}
                                style={{
                                    flex: 2,
                                    padding: '1rem',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                    color: 'white',
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)'
                                }}
                            >
                                <Video size={20} /> Allow Camera & Start Test
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Camera Blocked Overlay - Persistent warning when camera is covered */}
            {cameraBlocked && proctoring.enabled && proctoring.detectCameraBlocking && !showCameraSetup && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(239, 68, 68, 0.95)',
                    zIndex: 99999,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem'
                }}>
                    <div style={{
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '20px',
                        padding: '3rem',
                        textAlign: 'center',
                        maxWidth: '500px'
                    }}>
                        <div style={{
                            width: '100px',
                            height: '100px',
                            borderRadius: '50%',
                            background: 'rgba(255,255,255,0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1.5rem',
                            animation: 'pulse 1.5s ease-in-out infinite'
                        }}>
                            <VideoOff size={50} color="white" />
                        </div>
                        <h2 style={{ margin: 0, color: 'white', fontSize: '2rem', fontWeight: 700, marginBottom: '1rem' }}>
                            Camera Blocked!
                        </h2>
                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.9)', fontSize: '1.1rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                            Your camera appears to be covered or obstructed. Please uncover your camera to continue the test.
                        </p>
                        <div style={{
                            background: 'rgba(0,0,0,0.2)',
                            borderRadius: '12px',
                            padding: '1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem'
                        }}>
                            <AlertTriangle size={20} color="white" />
                            <span style={{ color: 'white', fontWeight: 600 }}>
                                Violations logged: {cameraBlockedCount}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            <header style={{
                padding: '0.75rem 2rem',
                borderBottom: '1px solid rgba(139,92,246,0.2)',
                background: 'linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(15,23,42,0.95) 100%)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    {/* Logo/Brand */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingRight: '1.5rem', borderRight: '1px solid rgba(139,92,246,0.2)' }}>
                        <Sparkles size={20} color="#8b5cf6" />
                        <span style={{ fontWeight: 700, fontSize: '1.1rem', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Assessment</span>
                    </div>
                    {/* Section tabs */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {sectionsWithQuestions.map((sec, i) => {
                            const Icon = SECTION_META[sec]?.icon || Layers
                            const isActive = currentSectionIndex === i
                            return (
                                <button
                                    key={sec}
                                    type="button"
                                    onClick={() => { setCurrentSectionIndex(i); setCurrentQuestionIndex(0) }}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderRadius: 10,
                                        border: isActive ? '1px solid rgba(139,92,246,0.5)' : '1px solid transparent',
                                        background: isActive ? 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.15))' : 'transparent',
                                        color: isActive ? '#a78bfa' : '#94a3b8',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem',
                                        fontWeight: isActive ? 600 : 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <Icon size={14} />
                                    {SECTION_META[sec]?.label || sec}
                                </button>
                            )
                        })}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    {proctoring.enabled && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.4rem 0.75rem',
                            background: 'rgba(239,68,68,0.15)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: '8px'
                        }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
                            <span style={{ fontSize: '0.75rem', color: '#fca5a5', fontWeight: 600, letterSpacing: '0.5px' }}>PROCTORED</span>
                        </div>
                    )}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.4rem 0.75rem',
                        background: 'rgba(139,92,246,0.1)',
                        borderRadius: '8px',
                        border: '1px solid rgba(139,92,246,0.2)'
                    }}>
                        <CheckCircle size={14} color="#a78bfa" />
                        <span style={{ color: '#a78bfa', fontSize: '0.85rem', fontWeight: 600 }}>{Object.keys(answers).length}/{totalQuestions}</span>
                    </div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        background: timeLeft < 300 ? 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.1))' : 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(5,150,105,0.1))',
                        borderRadius: 10,
                        border: `1px solid ${timeLeft < 300 ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)'}`,
                        boxShadow: timeLeft < 300 ? '0 0 20px rgba(239,68,68,0.2)' : 'none'
                    }}>
                        <Clock size={16} color={timeLeft < 300 ? '#ef4444' : '#10b981'} />
                        <span style={{ fontVariantNumeric: 'tabular-nums', color: timeLeft < 300 ? '#fca5a5' : '#6ee7b7', fontWeight: 700, fontSize: '1rem' }}>{formatTime(timeLeft)}</span>
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT - Conditional Layouts */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <div style={{
                    width: '300px',
                    background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.9) 100%)',
                    borderRight: '1px solid rgba(139,92,246,0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    backdropFilter: 'blur(12px)'
                }}>
                    <div style={{ flex: 1, padding: '1.25rem', overflowY: 'auto' }}>
                        {proctoring.enabled && (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.1))',
                                    border: '1px solid rgba(239,68,68,0.3)',
                                    borderRadius: 10,
                                    padding: '0.5rem 0.75rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    color: '#fca5a5',
                                    fontWeight: 600,
                                    fontSize: '0.8rem',
                                    marginBottom: '1rem',
                                    letterSpacing: '0.5px'
                                }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
                                    PROCTORED MODE
                                </div>

                                {proctoring.enableVideoAudio && (
                                    <div style={{
                                        position: 'relative',
                                        borderRadius: 12,
                                        overflow: 'hidden',
                                        border: '2px solid rgba(139,92,246,0.3)',
                                        background: '#000',
                                        marginBottom: '1rem',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                                    }}>
                                        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block', transform: 'scaleX(-1)', aspectRatio: '4/3', objectFit: 'cover' }} />
                                        <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 4 }}>
                                            <div style={{ padding: 5, borderRadius: '50%', background: videoEnabled ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)', backdropFilter: 'blur(4px)' }}><Video size={10} color="white" /></div>
                                            <div style={{ padding: 5, borderRadius: '50%', background: audioEnabled ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)', backdropFilter: 'blur(4px)' }}><Mic size={10} color="white" /></div>
                                        </div>
                                        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }}></div>
                                            <span style={{ fontSize: '0.6rem', color: 'white', fontWeight: 600 }}>REC</span>
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.8rem', background: 'rgba(30,41,59,0.4)', padding: '1rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontWeight: 500 }}>
                                        <span>Tab Switches:</span>
                                        <span style={{ color: tabSwitches > 0 ? '#f59e0b' : '#10b981', fontWeight: 700 }}>{tabSwitches}/{maxTabSwitches}</span>
                                    </div>
                                    {proctoring.detectCameraBlocking && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontWeight: 500 }}>
                                            <span>Cam Blocks:</span>
                                            <span style={{ color: cameraBlockedCount > 0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>{cameraBlockedCount}</span>
                                        </div>
                                    )}
                                    {proctoring.detectPhoneUsage && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontWeight: 500 }}>
                                            <span>Phone Detected:</span>
                                            <span style={{ color: phoneDetectionCount > 0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>{phoneDetectionCount}</span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontWeight: 500 }}>
                                        <span>Face Missing:</span>
                                        <span style={{ color: faceMissingCount > 0 ? '#f59e0b' : '#10b981', fontWeight: 700 }}>{faceMissingCount}</span>
                                    </div>
                                    {multipleMonitorCount > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontWeight: 500 }}>
                                            <span>Multi-Monitor:</span>
                                            <span style={{ color: '#ef4444', fontWeight: 700 }}>{multipleMonitorCount}</span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontWeight: 500, paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                        <span>Total Violations:</span>
                                        <span style={{ color: totalViolations >= 7 ? '#ef4444' : totalViolations >= 4 ? '#f59e0b' : '#10b981', fontWeight: 700 }}>{totalViolations}/{MAX_VIOLATIONS}</span>
                                    </div>
                                </div>

                                <div style={{ marginTop: '1.5rem' }}>
                                    <h4 style={{ color: 'rgba(239,68,68,0.9)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <AlertTriangle size={14} /> Proctoring Rules
                                    </h4>
                                    <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <li>Do not switch tabs or windows.</li>
                                        {proctoring.enableVideoAudio && <li>Keep your camera and microphone on.</li>}
                                        {proctoring.enforceFullscreen && <li>Do not exit fullscreen mode.</li>}
                                        {proctoring.detectCameraBlocking && <li>Ensure your face is always visible.</li>}
                                        {proctoring.detectPhoneUsage && <li>No mobile phones allowed.</li>}
                                    </ul>
                                </div>
                            </div>
                        )}

                        <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Target size={16} /> Question Palette</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                            {sectionQuestions.map((_, i) => (
                                <button key={i} onClick={() => setCurrentQuestionIndex(i)} style={{ width: 36, height: 36, borderRadius: 8, border: currentQuestionIndex === i ? '2px solid #3b82f6' : '1px solid rgba(139,92,246,0.3)', background: answers[sectionQuestions[i].id] ? 'linear-gradient(135deg, #10b981, #06b6d4)' : (currentQuestionIndex === i ? 'rgba(59,130,246,0.3)' : 'transparent'), color: 'white', cursor: 'pointer', fontSize: '0.85rem' }}>{i + 1}</button>
                            ))}
                        </div>
                    </div>
                </div>

                {(!isCoding && !isSql) ? (
                    // APTITUDE LAYOUT (Sidebar + Content)
                    <>
                        <div style={{ flex: 1, padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
                            <div style={{ marginBottom: '1rem', fontSize: '1rem', color: '#8b5cf6', fontWeight: 600 }}>Question {currentQuestionIndex + 1} OF {sectionQuestions.length}</div>
                            <h2 style={{ fontSize: '1.25rem', color: 'white', lineHeight: 1.6, marginBottom: '2rem' }}>{currentQ?.question}</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {(currentQ?.options || []).map((opt, i) => (
                                    <button key={i} onClick={() => handleAnswerSelect(currentQ.id, opt)} style={{ padding: '1.25rem', textAlign: 'left', borderRadius: 12, border: `1px solid ${answers[currentQ.id] === opt ? '#8b5cf6' : 'rgba(255,255,255,0.1)'}`, background: answers[currentQ.id] === opt ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.02)', color: 'white', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', transition: 'all 0.2s' }}>
                                        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', background: answers[currentQ.id] === opt ? '#8b5cf6' : 'transparent' }}>{String.fromCharCode(65 + i)}</div>
                                        {opt}
                                    </button>
                                ))}
                            </div>
                            <div style={{ marginTop: 'auto', paddingTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
                                <button onClick={prevQuestion} disabled={currentSectionIndex === 0 && currentQuestionIndex === 0} style={{ padding: '0.75rem 1.5rem', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ChevronLeft size={20} /> Previous</button>
                                <button onClick={nextQuestion} style={{ padding: '0.75rem 1.5rem', borderRadius: 10, background: 'linear-gradient(135deg, #3b82f6, #6366f1)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>Next <ChevronRight size={20} /></button>
                            </div>
                        </div>
                    </>
                ) : (
                    // CODING & SQL SPLIT LAYOUT
                    <>
                        <div style={{ width: '35%', minWidth: '350px', maxWidth: '450px', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
                            <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{ background: 'rgba(139, 92, 246, 0.15)', padding: '0.6rem', borderRadius: '10px' }}>
                                            <FileText size={20} color="#8b5cf6" />
                                        </div>
                                        <h3 style={{ margin: 0, color: 'white', fontSize: '1.2rem', fontWeight: 700 }}>Problem Statement</h3>
                                    </div>
                                    <div style={{
                                        padding: '0.4rem 0.8rem',
                                        borderRadius: '20px',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px',
                                        background: currentQ.difficulty?.toLowerCase() === 'hard' ? 'rgba(239, 68, 68, 0.1)' : (currentQ.difficulty?.toLowerCase() === 'medium' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)'),
                                        color: currentQ.difficulty?.toLowerCase() === 'hard' ? '#ef4444' : (currentQ.difficulty?.toLowerCase() === 'medium' ? '#f59e0b' : '#10b981'),
                                        border: `1px solid ${currentQ.difficulty?.toLowerCase() === 'hard' ? 'rgba(239, 68, 68, 0.2)' : (currentQ.difficulty?.toLowerCase() === 'medium' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)')}`
                                    }}>
                                        {currentQ.difficulty || 'Medium'}
                                    </div>
                                </div>
                                <div style={{ color: '#94a3b8', lineHeight: 1.8, fontSize: '1rem', letterSpacing: '-0.01em' }}>{currentQ.question}</div>

                                {isSql && (
                                    <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#60a5fa' }}>
                                                <Database size={18} />
                                                <span style={{ fontWeight: 700, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Database Schema</span>
                                            </div>
                                            <div style={{
                                                background: '#0f172a',
                                                borderRadius: '12px',
                                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                                overflow: 'hidden',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                            }}>
                                                <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.5rem 1rem', borderBottom: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>schema.sql</span>
                                                    <Database size={12} color="rgba(255,255,255,0.3)" />
                                                </div>
                                                <pre style={{
                                                    margin: 0,
                                                    padding: '1.25rem',
                                                    fontSize: '0.85rem',
                                                    color: '#93c5fd',
                                                    overflowX: 'auto',
                                                    whiteSpace: 'pre-wrap',
                                                    fontFamily: '"Fira Code", "Source Code Pro", monospace',
                                                    lineHeight: 1.6
                                                }}>{currentQ.sqlSchema || currentQ.starterCode || 'No schema provided'}</pre>
                                            </div>
                                        </div>

                                        {/* Expected Output for SQL */}
                                        {samples.output && samples.output !== 'N/A' && (
                                            <div style={{ marginTop: '1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#10b981' }}>
                                                    <Target size={16} />
                                                    <span style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expected Output</span>
                                                    <span style={{ fontSize: '0.7rem', color: 'rgba(16, 185, 129, 0.6)', marginLeft: 'auto' }}>Your query should produce this result</span>
                                                </div>
                                                <div style={{
                                                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(6, 182, 212, 0.05))',
                                                    borderRadius: '12px',
                                                    border: '1px solid rgba(16, 185, 129, 0.25)',
                                                    overflow: 'hidden',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                                                }}>
                                                    {/* Parse and display as table if pipe-separated */}
                                                    {samples.output.includes('|') ? (
                                                        <div style={{ overflowX: 'auto' }}>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: '"Fira Code", monospace', fontSize: '0.85rem' }}>
                                                                <tbody>
                                                                    {samples.output.split('\n').filter(Boolean).map((row, rowIdx) => {
                                                                        const cells = row.split('|').map(c => c.trim());
                                                                        const isHeader = rowIdx === 0 && cells.every(c => /^[a-zA-Z_\s]+$/.test(c));
                                                                        return (
                                                                            <tr key={rowIdx} style={{
                                                                                background: isHeader ? 'rgba(16, 185, 129, 0.15)' : rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'
                                                                            }}>
                                                                                {cells.map((cell, cellIdx) => (
                                                                                    isHeader ? (
                                                                                        <th key={cellIdx} style={{
                                                                                            padding: '0.75rem 1rem',
                                                                                            textAlign: 'left',
                                                                                            color: '#10b981',
                                                                                            fontWeight: 700,
                                                                                            borderBottom: '2px solid rgba(16, 185, 129, 0.3)',
                                                                                            whiteSpace: 'nowrap'
                                                                                        }}>{cell}</th>
                                                                                    ) : (
                                                                                        <td key={cellIdx} style={{
                                                                                            padding: '0.65rem 1rem',
                                                                                            color: '#4ade80',
                                                                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                                                            whiteSpace: 'nowrap'
                                                                                        }}>{cell}</td>
                                                                                    )
                                                                                ))}
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    ) : (
                                                        /* Plain text display for non-table output */
                                                        <pre style={{
                                                            margin: 0,
                                                            padding: '1rem',
                                                            fontFamily: '"Fira Code", monospace',
                                                            fontSize: '0.85rem',
                                                            color: '#4ade80',
                                                            whiteSpace: 'pre-wrap',
                                                            lineHeight: 1.6
                                                        }}>{samples.output}</pre>
                                                    )}
                                                </div>
                                                <div style={{
                                                    marginTop: '0.5rem',
                                                    padding: '0.5rem 0.75rem',
                                                    background: 'rgba(245, 158, 11, 0.1)',
                                                    borderRadius: '8px',
                                                    border: '1px solid rgba(245, 158, 11, 0.2)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem'
                                                }}>
                                                    <Lightbulb size={14} color="#f59e0b" />
                                                    <span style={{ fontSize: '0.75rem', color: '#fbbf24' }}>
                                                        Tip: Your output should match both the data values and ordering. Column headers may vary.
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!isSql && (
                                    <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        {/* Sample Input */}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#94a3b8' }}>
                                                <FileText size={16} />
                                                <span style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sample Input</span>
                                            </div>
                                            <div style={{
                                                background: '#1e293b',
                                                padding: '1rem',
                                                borderRadius: '10px',
                                                border: '1px solid #334155',
                                                fontFamily: '"Fira Code", monospace',
                                                fontSize: '0.9rem',
                                                color: '#e2e8f0',
                                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                                            }}>{samples.input}</div>
                                        </div>

                                        {/* Expected Output */}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#10b981' }}>
                                                <CheckCircle size={16} />
                                                <span style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expected Output</span>
                                            </div>
                                            <div style={{
                                                background: 'rgba(16, 185, 129, 0.05)',
                                                padding: '1rem',
                                                borderRadius: '10px',
                                                border: '1px solid rgba(16, 185, 129, 0.2)',
                                                fontFamily: '"Fira Code", monospace',
                                                fontSize: '0.9rem',
                                                color: '#4ade80',
                                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                                            }}>{samples.output}</div>
                                        </div>
                                    </div>
                                )}

                                <div style={{ marginTop: '2rem' }}>
                                    <button onClick={handleGetHint} disabled={loadingHint} style={{ width: '100%', padding: '0.75rem', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                        <Lightbulb size={16} /> {loadingHint ? 'Loading...' : 'Get AI Hint'}
                                    </button>
                                    {hint && <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#4ade80', borderRadius: 10, fontSize: '0.9rem' }}>💡 {hint}</div>}
                                </div>
                            </div>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #111827 0%, #0f172a 100%)' }}>
                            <div style={{
                                padding: '0.65rem 1.25rem',
                                borderBottom: '1px solid rgba(59, 130, 246, 0.15)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: 'linear-gradient(180deg, rgba(31, 41, 55, 0.6) 0%, rgba(31, 41, 55, 0.3) 100%)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Code size={14} color="#3b82f6" />
                                        <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Language</div>
                                    </div>
                                    <select
                                        value={currentLang}
                                        onChange={(e) => handleLanguageChange(currentQ.id, e.target.value)}
                                        disabled={isSql}
                                        style={{
                                            background: 'rgba(30, 41, 59, 0.8)',
                                            color: '#f3f4f6',
                                            border: '1px solid rgba(59, 130, 246, 0.3)',
                                            borderRadius: '8px',
                                            padding: '0.4rem 0.75rem',
                                            cursor: isSql ? 'default' : 'pointer',
                                            fontSize: '0.85rem',
                                            outline: 'none',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                                        }}
                                    >
                                        {Object.keys(LANGUAGE_CONFIG).map(lang => (
                                            <option key={lang} value={lang} disabled={isSql && lang !== 'SQL'}>{lang}</option>
                                        ))}
                                    </select>
                                </div>

                                {!isSql && (
                                    <button
                                        onClick={() => handleRunCode(currentQ.id, codeOrSql, currentLang, currentQ.sqlSchema)}
                                        disabled={isRunning}
                                        style={{
                                            padding: '0.5rem 1.25rem',
                                            background: isRunning ? '#374151' : 'linear-gradient(135deg, #10b981, #059669)',
                                            border: 'none',
                                            borderRadius: '8px',
                                            color: 'white',
                                            fontWeight: 600,
                                            cursor: isRunning ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.6rem',
                                            boxShadow: isRunning ? 'none' : '0 4px 10px rgba(37, 99, 235, 0.3)',
                                            transition: 'all 0.2s',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        {isRunning ? (
                                            <>
                                                <div className="animate-spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }}></div>
                                                Running...
                                            </>
                                        ) : (
                                            <>
                                                <Play size={16} fill="white" /> Run Code
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                <div style={{ flex: 1, position: 'relative', minHeight: '200px' }}>
                                    <Editor
                                        height="100%"
                                        defaultLanguage={isSql ? 'sql' : 'python'}
                                        language={LANGUAGE_CONFIG[currentLang]?.monacoLang || 'python'}
                                        theme="vs-dark"
                                        value={codeOrSql}
                                        onChange={v => setAnswers(prev => ({ ...prev, [currentQ.id]: v || '' }))}
                                        options={{ minimap: { enabled: false }, fontSize: 14, padding: { top: 16 } }}
                                    />
                                </div>

                                {/* COLLAPSIBLE CONSOLE AREA */}
                                <div
                                    ref={consoleResizeRef}
                                    style={{
                                        height: !isConsoleOpen ? '40px' : `${consoleHeight}px`,
                                        flex: 0,
                                        minHeight: isConsoleOpen ? '400px' : '40px',
                                        transition: isResizingRef.current ? 'none' : 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                        borderTop: '2px solid rgba(59, 130, 246, 0.3)',
                                        background: 'linear-gradient(180deg, #0a0f1a 0%, #020617 100%)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        flexShrink: 0,
                                        position: 'relative',
                                        overflow: 'hidden',
                                        boxShadow: '0 -4px 20px rgba(0,0,0,0.3)'
                                    }}>

                                    {/* Resize Handle - Works for both SQL and coding */}
                                    {isConsoleOpen && (
                                        <div
                                            onMouseDown={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                isResizingRef.current = true
                                                const startY = e.clientY
                                                const startHeight = consoleHeight
                                                document.body.style.cursor = 'ns-resize'
                                                document.body.style.userSelect = 'none'

                                                const handleMouseMove = (moveEvent) => {
                                                    moveEvent.preventDefault()
                                                    const deltaY = startY - moveEvent.clientY
                                                    const newHeight = Math.min(Math.max(startHeight + deltaY, 120), 600)
                                                    setConsoleHeight(newHeight)
                                                }

                                                const handleMouseUp = () => {
                                                    isResizingRef.current = false
                                                    document.body.style.cursor = ''
                                                    document.body.style.userSelect = ''
                                                    document.removeEventListener('mousemove', handleMouseMove)
                                                    document.removeEventListener('mouseup', handleMouseUp)
                                                }

                                                document.addEventListener('mousemove', handleMouseMove)
                                                document.addEventListener('mouseup', handleMouseUp)
                                            }}
                                            style={{
                                                position: 'absolute',
                                                top: '-4px',
                                                left: 0,
                                                right: 0,
                                                height: '12px',
                                                cursor: 'ns-resize',
                                                background: 'transparent',
                                                zIndex: 20,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                        >
                                            <div style={{
                                                width: '60px',
                                                height: '5px',
                                                background: 'linear-gradient(90deg, transparent, #3b82f6, transparent)',
                                                borderRadius: '3px',
                                                opacity: 0.7,
                                                transition: 'opacity 0.2s, width 0.2s'
                                            }}
                                                onMouseEnter={(e) => { e.target.style.opacity = '1'; e.target.style.width = '80px'; }}
                                                onMouseLeave={(e) => { e.target.style.opacity = '0.7'; e.target.style.width = '60px'; }}
                                            />
                                        </div>
                                    )}

                                    {/* Console Toggle Header (Only visible when closed) */}
                                    {!isConsoleOpen && (
                                        <div
                                            onClick={() => setIsConsoleOpen(true)}
                                            style={{
                                                flex: 1,
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '0 1.5rem',
                                                cursor: 'pointer',
                                                background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
                                                gap: '0.75rem',
                                                color: '#94a3b8',
                                                fontSize: '0.85rem',
                                                justifyContent: 'space-between',
                                                borderTop: '1px solid rgba(59, 130, 246, 0.2)',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'linear-gradient(180deg, #1e293b 0%, #334155 100%)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)'}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <div style={{
                                                    padding: '0.35rem',
                                                    background: 'rgba(59, 130, 246, 0.2)',
                                                    borderRadius: '6px',
                                                    display: 'flex',
                                                    alignItems: 'center'
                                                }}>
                                                    <ChevronUp size={16} color="#3b82f6" />
                                                </div>
                                                <span style={{ fontWeight: 600 }}>Console & Test Results</span>
                                            </div>
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: '#64748b',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem'
                                            }}>
                                                <kbd style={{
                                                    padding: '2px 6px',
                                                    background: 'rgba(255,255,255,0.1)',
                                                    borderRadius: '4px',
                                                    fontSize: '0.7rem'
                                                }}>Click</kbd>
                                                to expand
                                            </div>
                                        </div>
                                    )}

                                    {/* SQL TOOLS PANEL */}
                                    {isSql && isConsoleOpen && (
                                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                            <div style={{
                                                padding: '0.75rem 1.25rem',
                                                background: '#0f172a',
                                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <div style={{ display: 'flex', gap: '1.25rem' }}>
                                                    <button onClick={() => setSqlTool('validator')} style={{ padding: '0.5rem 0.75rem', background: 'transparent', color: sqlTool === 'validator' ? '#3b82f6' : '#94a3b8', border: 'none', borderBottom: `2px solid ${sqlTool === 'validator' ? '#3b82f6' : 'transparent'}`, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'all 0.2s', marginTop: '2px' }}>
                                                        <Shield size={16} /> Validator
                                                    </button>
                                                    <button onClick={() => setSqlTool('visualizer')} style={{ padding: '0.5rem 0.75rem', background: 'transparent', color: sqlTool === 'visualizer' ? '#8b5cf6' : '#94a3b8', border: 'none', borderBottom: `2px solid ${sqlTool === 'visualizer' ? '#8b5cf6' : 'transparent'}`, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'all 0.2s', marginTop: '2px' }}>
                                                        <Database size={16} /> ER Diagram
                                                    </button>
                                                    <button onClick={() => setSqlTool('debugger')} style={{ padding: '0.5rem 0.75rem', background: 'transparent', color: sqlTool === 'debugger' ? '#10b981' : '#94a3b8', border: 'none', borderBottom: `2px solid ${sqlTool === 'debugger' ? '#10b981' : 'transparent'}`, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'all 0.2s', marginTop: '2px' }}>
                                                        <Layers size={16} /> Debugger
                                                    </button>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', fontWeight: 500, textTransform: 'uppercase' }}>Advanced SQL Tools</div>
                                                    <button onClick={() => setIsConsoleOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}><ChevronDown size={18} /></button>
                                                </div>
                                            </div>
                                            <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem', background: 'radial-gradient(circle at top left, rgba(30,41,59,0.2), transparent)', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                {sqlTool === 'validator' && <SQLValidator query={codeOrSql} schemaContext={currentQ.sqlSchema || currentQ.starterCode} />}
                                                {sqlTool === 'visualizer' && <SQLVisualizer schema={currentQ.sqlSchema || currentQ.starterCode} />}
                                                {sqlTool === 'debugger' && <SQLDebugger query={codeOrSql} schema={currentQ.sqlSchema || currentQ.starterCode} />}
                                            </div>
                                        </div>
                                    )}

                                    {/* STANDARD CONSOLE OUTPUT (FOR NON-SQL) */}
                                    {!isSql && isConsoleOpen && (
                                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                            {/* Tabs */}
                                            <div style={{ display: 'flex', borderBottom: '1px solid rgba(59, 130, 246, 0.1)', background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.8) 0%, rgba(15, 23, 42, 0.5) 100%)', justifyContent: 'space-between', paddingRight: '1rem' }}>
                                                <div style={{ display: 'flex' }}>
                                                    {['input', 'output', 'tests'].map(tab => {
                                                        const isActive = (activeTab[currentQ.id] || 'input') === tab
                                                        return (
                                                            <button
                                                                key={tab}
                                                                onClick={() => setActiveTab(prev => ({ ...prev, [currentQ.id]: tab }))}
                                                                style={{
                                                                    padding: '1rem 1.5rem',
                                                                    background: isActive ? 'rgba(30, 41, 59, 0.8)' : 'transparent',
                                                                    border: 'none',
                                                                    borderBottom: isActive ? `3px solid ${tab === 'input' ? '#f59e0b' : tab === 'output' ? '#3b82f6' : '#10b981'}` : '3px solid transparent',
                                                                    color: isActive ? (tab === 'input' ? '#fbbf24' : tab === 'output' ? '#60a5fa' : '#4ade80') : '#94a3b8',
                                                                    cursor: 'pointer',
                                                                    fontSize: '0.9rem',
                                                                    fontWeight: 600,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.75rem',
                                                                    transition: 'all 0.2s'
                                                                }}
                                                            >
                                                                {tab === 'input' && <><FileText size={14} /> Custom Input</>}
                                                                {tab === 'output' && <><Code size={14} /> Output <span style={{ width: 6, height: 6, borderRadius: '50%', background: consoleOutput[currentQ.id] ? '#10b981' : 'transparent', marginLeft: 4 }}></span></>}
                                                                {tab === 'tests' && <><CheckCircle size={14} /> Test Cases
                                                                    {testResults[currentQ.id] && (
                                                                        <span style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: 4, marginLeft: 4 }}>
                                                                            {testResults[currentQ.id].passed}/{testResults[currentQ.id].total}
                                                                        </span>
                                                                    )}
                                                                </>}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <button
                                                        onClick={() => setIsConsoleOpen(false)}
                                                        title="Collapse"
                                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: '4px' }}
                                                    >
                                                        <ChevronDown size={18} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Tab Content - With better spacing */}
                                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
                                                {(activeTab[currentQ.id] || 'input') === 'input' && (
                                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                        <textarea
                                                            value={customInputs[currentQ.id] || ''}
                                                            onChange={(e) => setCustomInputs(prev => ({ ...prev, [currentQ.id]: e.target.value }))}
                                                            placeholder="Enter custom input here..."
                                                            style={{
                                                                width: '100%',
                                                                flex: 1,
                                                                background: 'rgba(15, 23, 42, 0.6)',
                                                                color: '#e2e8f0',
                                                                border: '1px solid rgba(59, 130, 246, 0.2)',
                                                                borderRadius: '12px',
                                                                padding: '1.25rem',
                                                                fontFamily: 'monospace',
                                                                resize: 'none',
                                                                outline: 'none',
                                                                fontSize: '0.9rem',
                                                                lineHeight: '1.6'
                                                            }}
                                                        />
                                                    </div>
                                                )}

                                                {(activeTab[currentQ.id] || 'input') === 'output' && (
                                                    <div style={{ padding: '1.5rem', fontFamily: 'monospace', color: '#e2e8f0', fontSize: '0.9rem', whiteSpace: 'pre-wrap', flex: 1, overflow: 'auto', maxHeight: '100%', lineHeight: '1.6' }}>
                                                        {consoleOutput[currentQ.id] || 'No output yet. Run your code to see results.'}
                                                    </div>
                                                )}

                                                {(activeTab[currentQ.id] || 'input') === 'tests' && (
                                                    <div style={{ padding: '1.5rem', overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                        <CodeOutputPreview
                                                            problemId={currentQ.id}
                                                            code={codeOrSql}
                                                            language={currentLang}
                                                            isGlobalTest={true}
                                                            onRunComplete={(results) => {
                                                                if (results?.testResults) {
                                                                    const passed = results.testResults.filter(r => r.passed).length
                                                                    const total = results.testResults.length

                                                                    setTestResults(prev => ({
                                                                        ...prev,
                                                                        [currentQ.id]: {
                                                                            passed,
                                                                            total
                                                                        }
                                                                    }))

                                                                    // Emit progress to live monitoring
                                                                    if (user && socketService) {
                                                                        const progress = Math.round((passed / total) * 100)
                                                                        socketService.emitProgressUpdate(user.id, currentQ.id, progress, null)
                                                                    }
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>
                    </>
                )}
            </div>

            {/* GLOBAL SUBMIT FOOTER */}
            <div style={{
                padding: '0.75rem 2rem',
                borderTop: '1px solid rgba(139,92,246,0.2)',
                background: 'linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(15,23,42,0.95) 100%)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.2)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        Question {allQuestions.indexOf(currentQ) + 1} of {totalQuestions}
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={prevQuestion}
                            style={{
                                padding: '0.5rem 1rem',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.05)',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                transition: 'all 0.2s'
                            }}
                        >
                            <ChevronLeft size={16} /> Prev
                        </button>
                        <button
                            onClick={nextQuestion}
                            style={{
                                padding: '0.5rem 1rem',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.05)',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                transition: 'all 0.2s'
                            }}
                        >
                            Next <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
                <button
                    onClick={() => handleSubmit(false)}
                    disabled={isSubmitting}
                    style={{
                        padding: '0.75rem 2rem',
                        borderRadius: 12,
                        border: 'none',
                        background: isSubmitting ? '#374151' : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                        color: 'white',
                        fontWeight: 700,
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        boxShadow: isSubmitting ? 'none' : '0 4px 20px rgba(139, 92, 246, 0.4)',
                        transition: 'all 0.2s',
                        fontSize: '0.95rem'
                    }}
                >
                    <Send size={18} /> {isSubmitting ? 'Submitting...' : 'Submit Test'}
                </button>
            </div>

            {/* Hidden Canvas for Proctoring */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
    )
}
