import React, { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { Mic, MicOff, Volume2, BookOpen, MessageSquare, PenTool, BarChart3, Play, Square, RefreshCw, CheckCircle, XCircle, ChevronRight, Award, Target, TrendingUp, Clock, Headphones, ArrowRight, ArrowLeft, HelpCircle, Sparkles, Shield, Camera, CameraOff, AlertTriangle, Eye, Smartphone, Monitor, Users, Ban, Lock } from 'lucide-react'
import socketService from '../services/socketService'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/communication'
const BACKEND_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const MAX_VIOLATIONS = 10


/* ═══════════════════════════════════════════════════════════════
   STRICT Proctoring Hook — auto-terminates on excessive violations
   Tab-switch, window blur, webcam, camera-blocked, phone/device,
   multiple people, dual monitor, right-click, DevTools, fullscreen
   ═══════════════════════════════════════════════════════════════ */
const DEFAULT_PROCTOR_CONFIG = { camera: true, fullscreen: true, tab_switch: true, copy_paste: true, phone_detect: true, multi_monitor_detect: true, multiple_people_detect: true }

function useProctoring(userId, sessionId, active = true, config = DEFAULT_PROCTOR_CONFIG, onAutoTerminate = null) {
    const cfg = { ...DEFAULT_PROCTOR_CONFIG, ...config }
    const [tabSwitchCount, setTabSwitchCount] = useState(0)
    const [cameraBlocked, setCameraBlocked] = useState(false)
    const [cameraBlockedCount, setCameraBlockedCount] = useState(0)
    const [cameraReady, setCameraReady] = useState(false)
    const [cameraError, setCameraError] = useState(null)
    const [mediaStream, setMediaStream] = useState(null)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [fullscreenExitCount, setFullscreenExitCount] = useState(0)

    // AI-powered detection
    const [modelLoaded, setModelLoaded] = useState(false)
    const [phoneDetected, setPhoneDetected] = useState(false)
    const [phoneDetectionCount, setPhoneDetectionCount] = useState(0)
    const [multiplePeople, setMultiplePeople] = useState(false)
    const [multiplePeopleCount, setMultiplePeopleCount] = useState(0)
    const [noFaceCount, setNoFaceCount] = useState(0)
    const [multipleFaceCount, setMultipleFaceCount] = useState(0)
    const [multipleMonitors, setMultipleMonitors] = useState(false)
    const [multipleMonitorCount, setMultipleMonitorCount] = useState(0)
    const [violationWarning, setViolationWarning] = useState(null)

    // Strict mode
    const [autoTerminated, setAutoTerminated] = useState(false)
    const [totalViolations, setTotalViolations] = useState(0)
    const terminatedRef = useRef(false)

    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const cameraCheckRef = useRef(null)
    const cameraBlockedRef = useRef(false)
    const modelRef = useRef(null)
    const faceModelRef = useRef(null)
    const aiMonitorRef = useRef(null)
    const monitorCheckRef = useRef(null)
    const phoneCooldownRef = useRef(0)
    const peopleCooldownRef = useRef(0)
    const faceCooldownRef = useRef(0)
    const noFaceStreakRef = useRef(0)
    const faceMultiStreakRef = useRef(0)
    const warningTimerRef = useRef(null)
    const onAutoTerminateRef = useRef(onAutoTerminate)
    useEffect(() => { onAutoTerminateRef.current = onAutoTerminate }, [onAutoTerminate])

    // Central violation counter — triggers auto-terminate
    const addViolation = useCallback((count = 1) => {
        if (terminatedRef.current) return
        setTotalViolations(prev => {
            const next = prev + count
            if (next >= MAX_VIOLATIONS && !terminatedRef.current) {
                terminatedRef.current = true
                setAutoTerminated(true)
                if (onAutoTerminateRef.current) onAutoTerminateRef.current()
            }
            return next
        })
    }, [])

    const logViolation = useCallback(async (eventType, severity = 'low', details = '') => {
        if (terminatedRef.current) return
        addViolation(1)
        // Emit to Socket.IO for real-time admin live monitoring
        socketService.emitProctoringViolation(userId, '', eventType, severity, null)
        try {
            await axios.post(`${API_BASE}/proctoring/log`, {
                userId, sessionId, eventType, severity, details
            })
        } catch { /* silent */ }
    }, [userId, sessionId, addViolation])

    const showWarning = useCallback((title, message, severity = 'medium') => {
        setViolationWarning({ title, message, severity })
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
        warningTimerRef.current = setTimeout(() => setViolationWarning(null), 4000)
    }, [])

    // ─── Load COCO-SSD AI Model ───
    const needsAI = cfg.phone_detect || cfg.multiple_people_detect
    useEffect(() => {
        if (!active || !needsAI) return
        let cancelled = false
        const loadModel = async () => {
            try {
                const waitForModels = () => new Promise((resolve) => {
                    const check = setInterval(() => {
                        if (window.cocoSsd && window.blazeface) { clearInterval(check); resolve() }
                    }, 200)
                    setTimeout(() => { clearInterval(check); resolve() }, 30000)
                })
                await waitForModels()
                if (cancelled) return
                
                if (window.cocoSsd) {
                    modelRef.current = await window.cocoSsd.load({ base: 'mobilenet_v2' })
                }
                if (window.blazeface) {
                    faceModelRef.current = await window.blazeface.load()
                }

                setModelLoaded(true)
                console.log('✅ AI Proctoring Models (COCO + BlazeFace) loaded')
            } catch (e) { console.error('AI model load error:', e) }
        }
        loadModel()
        return () => { cancelled = true }
    }, [active, needsAI])

    // ─── Tab-switch + window blur detection ───
    useEffect(() => {
        if (!active || !cfg.tab_switch) return
        const handleVisibility = () => {
            if (document.hidden) {
                setTabSwitchCount(prev => {
                    const nc = prev + 1
                    logViolation('tab_switch', nc >= 2 ? 'high' : 'medium', `Tab switch #${nc}`)
                    showWarning('🚫 Tab Switch Detected!', `Warning ${nc}: Switching tabs is strictly prohibited. Your test will be auto-submitted after ${MAX_VIOLATIONS} total violations.`, 'high')
                    return nc
                })
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility)
        }
    }, [active, logViolation, showWarning])

    // ─── Copy-paste, right-click, DevTools, print-screen, drag-drop prevention ───
    useEffect(() => {
        if (!active || !cfg.copy_paste) return
        const prevent = (e) => { e.preventDefault(); logViolation('copy_paste', 'medium', e.type) }
        const preventContext = (e) => { e.preventDefault() }
        const preventKeys = (e) => {
            // Block F12, Ctrl+Shift+I/J/C (DevTools), Ctrl+U (view source), PrintScreen
            if (e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && ['I','i','J','j','C','c'].includes(e.key)) ||
                (e.ctrlKey && ['u','U'].includes(e.key)) ||
                e.key === 'PrintScreen') {
                e.preventDefault()
                e.stopPropagation()
                logViolation('devtools_attempt', 'high', `Blocked key: ${e.key}`)
                showWarning('🚫 Blocked!', 'Developer tools and screen capture are disabled during the assessment.', 'high')
            }
        }
        const preventDrag = (e) => { e.preventDefault() }
        document.addEventListener('copy', prevent)
        document.addEventListener('paste', prevent)
        document.addEventListener('cut', prevent)
        document.addEventListener('contextmenu', preventContext)
        document.addEventListener('keydown', preventKeys, true)
        document.addEventListener('dragstart', preventDrag)
        document.addEventListener('drop', preventDrag)
        return () => {
            document.removeEventListener('copy', prevent)
            document.removeEventListener('paste', prevent)
            document.removeEventListener('cut', prevent)
            document.removeEventListener('contextmenu', preventContext)
            document.removeEventListener('keydown', preventKeys, true)
            document.removeEventListener('dragstart', preventDrag)
            document.removeEventListener('drop', preventDrag)
        }
    }, [active, logViolation, showWarning])

    // ─── Camera initialization ───
    const initCamera = useCallback(async () => {
        if (!cfg.camera) return
        try {
            // Pick first local webcam to avoid Windows phone-camera picker
            const devices = await navigator.mediaDevices.enumerateDevices()
            const webcam = devices.find(d => d.kind === 'videoinput' && d.deviceId)
            const videoConstraints = webcam?.deviceId
                ? { deviceId: { exact: webcam.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
                : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
            const stream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints,
                audio: false
            })
            setMediaStream(stream)
            setCameraReady(true)
            setCameraError(null)
            if (videoRef.current) { videoRef.current.srcObject = stream }
        } catch (err) {
            setCameraError(err.message || 'Camera access denied')
            setCameraReady(false)
            logViolation('camera_denied', 'critical', err.message)
        }
    }, [logViolation])

    // ─── Camera blocked detection (stricter: 1s interval) ───
    useEffect(() => {
        if (!active || !cameraReady || !mediaStream) return
        let darkFrameStreak = 0
        const checkCamera = () => {
            if (!videoRef.current || !canvasRef.current) return
            const video = videoRef.current
            const canvas = canvasRef.current
            const ctx = canvas.getContext('2d')
            canvas.width = 160; canvas.height = 120
            ctx.drawImage(video, 0, 0, 160, 120)
            const imageData = ctx.getImageData(0, 0, 160, 120)
            const pixels = imageData.data
            const totalPixels = pixels.length / 4

            let totalBrightness = 0, darkPixels = 0
            let colorSum = { r: 0, g: 0, b: 0 }
            for (let i = 0; i < pixels.length; i += 4) {
                const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
                const brightness = (r + g + b) / 3
                totalBrightness += brightness
                colorSum.r += r; colorSum.g += g; colorSum.b += b
                if (brightness < 30) darkPixels++
            }
            const avgBrightness = totalBrightness / totalPixels
            const darkRatio = darkPixels / totalPixels
            const avgColor = { r: colorSum.r / totalPixels, g: colorSum.g / totalPixels, b: colorSum.b / totalPixels }

            let variance = 0
            for (let i = 0; i < pixels.length; i += 4) {
                variance += Math.abs(pixels[i] - avgColor.r) + Math.abs(pixels[i + 1] - avgColor.g) + Math.abs(pixels[i + 2] - avgColor.b)
            }
            variance = variance / totalPixels / 3
            const isBlocked = darkRatio > 0.85 || avgBrightness < 18 || variance < 10

            if (isBlocked) {
                darkFrameStreak++
                if (darkFrameStreak >= 2 && !cameraBlockedRef.current) {
                    cameraBlockedRef.current = true
                    setCameraBlocked(true)
                    setCameraBlockedCount(prev => {
                        const nc = prev + 1
                        logViolation('camera_blocked', 'critical', `Camera blocked #${nc} (streak: ${darkFrameStreak})`)
                        showWarning('📷 Camera Blocked!', 'Your camera is covered or blocked. Uncover it NOW or your test will be terminated.', 'critical')
                        return nc
                    })
                }
            } else {
                darkFrameStreak = 0
                if (cameraBlockedRef.current) {
                    cameraBlockedRef.current = false
                    setCameraBlocked(false)
                }
            }
        }
        cameraCheckRef.current = setInterval(checkCamera, 1000)
        return () => { if (cameraCheckRef.current) clearInterval(cameraCheckRef.current) }
    }, [active, cameraReady, mediaStream, logViolation, showWarning])

    // ─── AI Detection: phone/device + people (strict: 400ms, lower thresholds, shorter cooldowns) ───
    const noPersonStreakRef = useRef(0)
    const multiplePeopleStreakRef = useRef(0)
    useEffect(() => {
        if (!active || !needsAI || !cameraReady || !mediaStream || !modelRef.current) return
        // Use the existing in-DOM video element — offscreen video never reliably produces frames
        const vid = videoRef.current
        if (!vid) return

        const PHONE_COOLDOWN = 4000
        const PEOPLE_COOLDOWN = 5000
        const NO_PERSON_STREAK_THRESHOLD = 5  // 5 consecutive frames (~2s) with no person before violation
        const MULTI_PEOPLE_STREAK_THRESHOLD = 3  // 3 consecutive frames (~1.2s) before flagging multiple people
        noPersonStreakRef.current = 0
        multiplePeopleStreakRef.current = 0

        // Wait for video to be ready before starting detection
        const startDetection = () => {
            aiMonitorRef.current = setInterval(async () => {
                try {
                    if (!vid || vid.paused || vid.ended || vid.readyState < 2) return
                    if (!modelRef.current) return
                    const predictions = await modelRef.current.detect(vid)

                    // Strict device detection (threshold: 0.30)
                    const deviceClasses = ['cell phone', 'remote', 'laptop', 'mouse', 'tablet']
                    const deviceObj = cfg.phone_detect ? predictions.find(p => deviceClasses.includes(p.class) && p.score >= 0.30) : null
                    if (deviceObj) {
                        const now = Date.now()
                        if (now - phoneCooldownRef.current > PHONE_COOLDOWN) {
                            phoneCooldownRef.current = now
                            setPhoneDetected(true)
                            setPhoneDetectionCount(prev => {
                                const nc = prev + 1
                                logViolation('phone_detected', 'critical', `${deviceObj.class} (${(deviceObj.score * 100).toFixed(0)}%)`)
                                showWarning('📱 DEVICE DETECTED!', `${deviceObj.class} detected. Remove ALL electronic devices immediately!`, 'critical')
                                return nc
                            })
                            setTimeout(() => setPhoneDetected(false), 4000)
                        }
                    }

                    // Strict suspicious objects (threshold: 0.35)
                    const suspicious = cfg.phone_detect ? predictions.filter(p =>
                        ['book', 'keyboard'].includes(p.class) && p.score > 0.35
                    ) : []
                    if (suspicious.length > 0) {
                        const now = Date.now()
                        if (now - phoneCooldownRef.current > PHONE_COOLDOWN) {
                            phoneCooldownRef.current = now
                            logViolation('suspicious_object', 'high', `${suspicious[0].class} detected (${(suspicious[0].score * 100).toFixed(0)}%)`)
                            showWarning('⚠️ Suspicious Object!', `${suspicious[0].class} detected. Remove unauthorized materials.`, 'high')
                        }
                    }

                    // Person detection — multiple people AND no-person
                    const persons = predictions.filter(p => p.class === 'person' && p.score > 0.45)

                    // Multiple people detection — streak-based to prevent false positives
                    if (cfg.multiple_people_detect && persons.length > 1) {
                        multiplePeopleStreakRef.current++
                        if (multiplePeopleStreakRef.current >= MULTI_PEOPLE_STREAK_THRESHOLD) {
                            const now = Date.now()
                            if (now - peopleCooldownRef.current > PEOPLE_COOLDOWN) {
                                peopleCooldownRef.current = now
                                setMultiplePeople(true)
                                setMultiplePeopleCount(prev => {
                                    const nc = prev + 1
                                    logViolation('multiple_people', 'critical', `${persons.length} persons detected`)
                                    showWarning('👥 Multiple People Detected', `${persons.length} people detected in frame. Only the test candidate should be visible.`, 'critical')
                                    return nc
                                })
                                setTimeout(() => setMultiplePeople(false), 4000)
                            }
                            multiplePeopleStreakRef.current = 0
                        }
                    } else {
                        multiplePeopleStreakRef.current = 0
                    }

                    // No-person detection — streak-based to prevent false positives
                    if (cfg.multiple_people_detect) {
                        const anyPerson = persons.length > 0
                        if (!anyPerson) {
                            noPersonStreakRef.current++
                            if (noPersonStreakRef.current >= NO_PERSON_STREAK_THRESHOLD) {
                                const now = Date.now()
                                if (now - peopleCooldownRef.current > PEOPLE_COOLDOWN) {
                                    peopleCooldownRef.current = now
                                    logViolation('no_person', 'high', `No person visible for ${noPersonStreakRef.current} consecutive frames`)
                                    showWarning('⚠️ No Person Detected!', 'You must remain visible in the camera at all times.', 'high')
                                }
                                noPersonStreakRef.current = 0  // reset after firing
                            }
                        } else {
                            noPersonStreakRef.current = 0
                        }
                    }

                    // BlazeFace - Face Missing & Multi Face
                    if (cfg.multiple_people_detect && faceModelRef.current) {
                        const faces = await faceModelRef.current.estimateFaces(vid, false)
                        const now = Date.now()

                        if (faces.length === 0) {
                            noFaceStreakRef.current++
                            if (noFaceStreakRef.current >= 6) { // ~2.4s
                                if (now - faceCooldownRef.current > 6000) {
                                    faceCooldownRef.current = now
                                    logViolation('no_face', 'high', 'No face detected via BlazeFace')
                                    setNoFaceCount(prev => prev + 1)
                                    showWarning('👤 No Face Detected!', 'Please ensure your face is clearly visible to the camera.', 'high')
                                }
                                noFaceStreakRef.current = 0
                            }
                        } else {
                            noFaceStreakRef.current = 0
                        }

                        if (faces.length > 1) {
                            faceMultiStreakRef.current++
                            if (faceMultiStreakRef.current >= 3) {
                                if (now - faceCooldownRef.current > 6000) {
                                    faceCooldownRef.current = now
                                    logViolation('multiple_faces', 'critical', `${faces.length} faces detected`)
                                    setMultipleFaceCount(prev => prev + 1)
                                    showWarning('👥 Multi-Face Detected', 'Multiple faces detected in frame. Cheating is strictly prohibited.', 'critical')
                                }
                                faceMultiStreakRef.current = 0
                            }
                        } else {
                            faceMultiStreakRef.current = 0
                        }
                    }
                } catch (err) {
                    console.warn('AI detection frame error:', err)
                }
            }, 400)
        }

        // Ensure video is actually playing before we start detecting
        if (vid.readyState >= 2) {
            startDetection()
        } else {
            const onReady = () => { startDetection(); vid.removeEventListener('loadeddata', onReady) }
            vid.addEventListener('loadeddata', onReady)
        }

        return () => {
            if (aiMonitorRef.current) clearInterval(aiMonitorRef.current)
            noPersonStreakRef.current = 0
            multiplePeopleStreakRef.current = 0
        }
    }, [active, needsAI, cameraReady, mediaStream, modelLoaded, logViolation, showWarning])

    // Start camera when active
    useEffect(() => {
        if (active) initCamera()
        return () => {
            if (mediaStream) mediaStream.getTracks().forEach(t => t.stop())
            if (cameraCheckRef.current) clearInterval(cameraCheckRef.current)
            if (aiMonitorRef.current) clearInterval(aiMonitorRef.current)
        }
    }, [active])

    // ─── Multiple Monitor Detection (strict: 3s interval) ───
    const triggerMonitorViolation = useCallback((reason) => {
        setMultipleMonitors(true)
        setMultipleMonitorCount(prev => {
            const nc = prev + 1
            logViolation('multiple_monitors', 'critical', reason)
            showWarning('🖥️ MULTI-MONITOR DETECTED!', 'Disconnect ALL external displays immediately or your test will be terminated.', 'critical')
            return nc
        })
    }, [logViolation, showWarning])

    const detectMultipleMonitors = useCallback(() => {
        let detected = false
        let reason = ''
        if ('isExtended' in window.screen) {
            if (window.screen.isExtended) { detected = true; reason = 'screen.isExtended — multi-screen' }
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
            detected = true; reason = `Available area exceeds screen`
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
        if (!active || !cfg.multi_monitor_detect) return
        detectMultipleMonitors()
        monitorCheckRef.current = setInterval(detectMultipleMonitors, 3000)
        const handleResize = () => detectMultipleMonitors()
        window.addEventListener('resize', handleResize)
        const handleScreenChange = () => detectMultipleMonitors()
        if (window.screen?.addEventListener) window.screen.addEventListener('change', handleScreenChange)
        return () => {
            if (monitorCheckRef.current) clearInterval(monitorCheckRef.current)
            window.removeEventListener('resize', handleResize)
            if (window.screen?.removeEventListener) window.screen.removeEventListener('change', handleScreenChange)
        }
    }, [active, detectMultipleMonitors])

    // ─── Fullscreen management (strict: 200ms re-entry) ───
    const enterFullscreen = useCallback(async () => {
        if (!cfg.fullscreen) return
        const el = containerRef.current || document.documentElement
        try {
            if (el.requestFullscreen) await el.requestFullscreen()
            else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
            else if (el.msRequestFullscreen) await el.msRequestFullscreen()
            setIsFullscreen(true)
        } catch (err) { console.warn('Fullscreen failed:', err) }
    }, [])

    useEffect(() => {
        if (!active || !cfg.fullscreen) return
        const handleFsChange = () => {
            const isFull = !!document.fullscreenElement || !!document.webkitFullscreenElement
            setIsFullscreen(isFull)
            if (!isFull && active) {
                setFullscreenExitCount(prev => {
                    const nc = prev + 1
                    logViolation('fullscreen_exit', nc >= 2 ? 'critical' : 'high', `Fullscreen exit #${nc}`)
                    showWarning('🚫 FULLSCREEN EXITED!', `You MUST stay in fullscreen. Violation #${nc} recorded. Re-entering automatically...`, 'critical')
                    return nc
                })
                setTimeout(() => { if (active) enterFullscreen() }, 200)
            }
        }
        document.addEventListener('fullscreenchange', handleFsChange)
        document.addEventListener('webkitfullscreenchange', handleFsChange)
        enterFullscreen()
        return () => {
            document.removeEventListener('fullscreenchange', handleFsChange)
            document.removeEventListener('webkitfullscreenchange', handleFsChange)
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
            if (warningTimerRef.current) clearTimeout(warningTimerRef.current)
        }
    }, [active, logViolation, enterFullscreen, showWarning])

    // ── Agent terminate listener — receives real-time kill signal from Proctor Agent ──
    const [agentTerminateReason, setAgentTerminateReason] = useState(null)
    useEffect(() => {
        if (!active) return
        socketService.connect()
        socketService.joinStudentSession(userId, sessionId)

        const handleTerminate = (data) => {
            console.error('[ProctorAgent] TEST TERMINATED BY AGENT:', data)
            terminatedRef.current = true
            setAutoTerminated(true)
            setAgentTerminateReason(data?.reason || 'Your test has been terminated by the Proctoring Intelligence Agent.')
            if (onAutoTerminateRef.current) onAutoTerminateRef.current()
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        }
        socketService.onAgentTerminate(handleTerminate)
        return () => { socketService.removeListener('agent_terminate') }
    }, [active, userId, sessionId])

    return {
        tabSwitchCount, cameraBlocked, cameraBlockedCount, cameraReady, cameraError,
        isFullscreen, fullscreenExitCount, containerRef,
        videoRef, canvasRef, logViolation, enterFullscreen,
        modelLoaded, phoneDetected, phoneDetectionCount,
        multiplePeople, multiplePeopleCount,
        noFaceCount, multipleFaceCount,
        multipleMonitors, multipleMonitorCount,
        violationWarning,
        // Strict mode
        autoTerminated, totalViolations,
        agentTerminateReason
    }
}


/* ═══════════════════════════════════════════════════════════════
   STRICT Proctoring Bar — violation countdown, blocking overlays
   ═══════════════════════════════════════════════════════════════ */
function ProctoringBar({ proctoring }) {
    const { tabSwitchCount, cameraBlocked, cameraBlockedCount, cameraReady, cameraError,
        isFullscreen, fullscreenExitCount, videoRef, canvasRef, enterFullscreen,
        modelLoaded, phoneDetected, phoneDetectionCount,
        multiplePeople, multiplePeopleCount,
        noFaceCount, multipleFaceCount,
        multipleMonitors, multipleMonitorCount,
        violationWarning, autoTerminated, totalViolations, agentTerminateReason } = proctoring

    const remaining = MAX_VIOLATIONS - totalViolations
    const dangerZone = remaining <= 3 && remaining > 0
    const hasCritical = cameraBlocked || multipleMonitors || phoneDetected || multiplePeople

    const barBorderColor = autoTerminated ? '#dc2626' : dangerZone ? '#f59e0b' : totalViolations > 0 ? '#ef4444' : 'var(--border-color)'

    return (
        <div style={{ marginBottom: '1rem', position: 'relative' }}>
            {/* ── Violation Warning Toast (floating) ── */}
            {violationWarning && (
                <div style={{
                    position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)',
                    zIndex: 10000, maxWidth: 520, width: '92%',
                    background: violationWarning.severity === 'critical' ? 'linear-gradient(135deg, #7f1d1d, #991b1b)' :
                        violationWarning.severity === 'high' ? 'linear-gradient(135deg, #dc2626, #b91c1c)' :
                            'linear-gradient(135deg, #d97706, #b45309)',
                    border: `2px solid ${violationWarning.severity === 'critical' ? '#fca5a5' : violationWarning.severity === 'high' ? '#fca5a5' : '#fbbf24'}`,
                    borderRadius: '0.75rem', padding: '1rem 1.25rem',
                    boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
                    animation: 'slideDown 0.3s ease-out'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <AlertTriangle size={18} color="#fff" />
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>{violationWarning.title}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.9)', marginBottom: '0.4rem' }}>{violationWarning.message}</div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '0.35rem' }}>
                        {remaining > 0
                            ? `⚠ ${remaining} violation${remaining !== 1 ? 's' : ''} remaining before auto-termination`
                            : '🚫 Maximum violations reached — test terminated'}
                    </div>
                </div>
            )}

            {/* ── Blocking overlay when camera blocked or critical active ── */}
            {hasCritical && !autoTerminated && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9998,
                    background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1e1e2e, #2a1a2a)',
                        border: '2px solid #ef4444', borderRadius: '1rem',
                        padding: '2rem', maxWidth: 440, textAlign: 'center',
                        boxShadow: '0 20px 60px rgba(239,68,68,0.3)'
                    }}>
                        <Ban size={48} color="#ef4444" style={{ marginBottom: '1rem' }} />
                        <h3 style={{ margin: '0 0 0.5rem', color: '#f87171', fontSize: '1.2rem' }}>
                            {cameraBlocked ? '📷 Camera Blocked!' : phoneDetected ? '📱 Device Detected!' : multiplePeople ? '👥 Multiple People!' : '🖥️ Multiple Monitors!'}
                        </h3>
                        <p style={{ color: '#fca5a5', fontSize: '0.85rem', margin: '0 0 1rem', lineHeight: 1.5 }}>
                            {cameraBlocked ? 'Your camera appears to be covered. Uncover it immediately to continue.'
                                : phoneDetected ? 'An electronic device was detected. Remove ALL devices from your area.'
                                    : multiplePeople ? 'Multiple people detected in frame. Only the candidate must be visible.'
                                        : 'External monitor detected. Disconnect all additional displays.'}
                        </p>
                        <div style={{
                            background: 'rgba(239,68,68,0.15)', borderRadius: '0.5rem',
                            padding: '0.6rem', fontSize: '0.78rem', color: '#fca5a5'
                        }}>
                            <Lock size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                            Test content blocked until resolved · {remaining} violation{remaining !== 1 ? 's' : ''} remaining
                        </div>
                    </div>
                </div>
            )}

            {/* ── Webcam + Status Row ── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem',
                background: 'var(--bg-card)', border: `1px solid ${barBorderColor}`,
                borderRadius: '0.75rem', marginBottom: '0.5rem'
            }}>
                {/* Camera Preview */}
                <div style={{
                    width: 100, height: 75, borderRadius: '0.5rem', overflow: 'hidden',
                    background: '#000', border: `2px solid ${cameraBlocked ? '#ef4444' : cameraReady ? '#10b981' : '#64748b'}`,
                    position: 'relative', flexShrink: 0
                }}>
                    <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                    {cameraBlocked && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(239,68,68,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CameraOff size={20} color="#fff" />
                        </div>
                    )}
                    {phoneDetected && (
                        <div style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(239,68,68,0.95)', borderRadius: '0.25rem', padding: '1px 4px', fontSize: '0.55rem', color: '#fff', fontWeight: 700, animation: 'pulse-glow 1s infinite' }}>📱</div>
                    )}
                    {multiplePeople && (
                        <div style={{ position: 'absolute', bottom: 2, right: 2, background: 'rgba(239,68,68,0.95)', borderRadius: '0.25rem', padding: '1px 4px', fontSize: '0.55rem', color: '#fff', fontWeight: 700, animation: 'pulse-glow 1s infinite' }}>👥</div>
                    )}
                    {!cameraReady && !cameraError && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#94a3b8' }}>Loading…</div>
                    )}
                </div>

                {/* Status Info */}
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                        <Shield size={14} color={totalViolations > 0 ? '#ef4444' : '#10b981'} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                            Strict Proctoring
                        </span>
                        {modelLoaded && (
                            <span style={{ fontSize: '0.6rem', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', padding: '1px 6px', borderRadius: '0.25rem', fontWeight: 600 }}>AI</span>
                        )}
                        {/* Violation counter w/ danger zone indicator */}
                        <span style={{
                            fontSize: '0.65rem', fontWeight: 700,
                            padding: '1px 8px', borderRadius: '0.5rem',
                            background: dangerZone ? 'rgba(245,158,11,0.2)' : totalViolations > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.1)',
                            color: dangerZone ? '#fbbf24' : totalViolations > 0 ? '#f87171' : '#10b981',
                            animation: dangerZone ? 'pulse-glow 1.5s infinite' : 'none'
                        }}>
                            {totalViolations}/{MAX_VIOLATIONS} violations
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.7rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            {cameraReady ? <Camera size={10} color="#10b981" /> : <CameraOff size={10} color="#ef4444" />}
                            {cameraReady ? 'Cam' : 'No cam'}
                        </span>
                        <span style={{ color: tabSwitchCount > 0 ? '#f59e0b' : 'inherit' }}>
                            Tab:{tabSwitchCount}
                        </span>
                        <span style={{ color: isFullscreen ? '#10b981' : '#ef4444' }}>
                            {isFullscreen ? '🔒FS' : '⚠️FS'}
                        </span>
                        {fullscreenExitCount > 0 && <span style={{ color: '#ef4444' }}>FS:{fullscreenExitCount}</span>}
                        {cameraBlockedCount > 0 && <span style={{ color: '#ef4444' }}>Blk:{cameraBlockedCount}</span>}
                        {phoneDetectionCount > 0 && <span style={{ color: '#ef4444' }}>📱{phoneDetectionCount}</span>}
                        {multiplePeopleCount > 0 && <span style={{ color: '#ef4444' }}>👥{multiplePeopleCount}</span>}
                        {noFaceCount > 0 && <span style={{ color: '#ef4444' }}>👤{noFaceCount}</span>}
                        {multipleFaceCount > 0 && <span style={{ color: '#ef4444' }}>👨‍👩‍👧{multipleFaceCount}</span>}
                        {multipleMonitorCount > 0 && <span style={{ color: '#ef4444' }}>🖥{multipleMonitorCount}</span>}
                    </div>
                </div>
            </div>

            {/* ── Danger zone progress bar ── */}
            {totalViolations > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{ height: 4, borderRadius: 2, background: '#1e293b', overflow: 'hidden' }}>
                        <div style={{
                            height: '100%', borderRadius: 2, transition: 'width 0.3s, background 0.3s',
                            width: `${(totalViolations / MAX_VIOLATIONS) * 100}%`,
                            background: dangerZone ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #ef4444, #dc2626)'
                        }} />
                    </div>
                    {dangerZone && (
                        <div style={{ fontSize: '0.68rem', color: '#fbbf24', marginTop: '0.2rem', textAlign: 'center', fontWeight: 600 }}>
                            ⚠ DANGER: {remaining} violation{remaining !== 1 ? 's' : ''} until auto-termination!
                        </div>
                    )}
                </div>
            )}

            {/* ── Persistent warning banners ── */}
            {!isFullscreen && (
                <div onClick={enterFullscreen} style={{
                    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)',
                    borderRadius: '0.5rem', padding: '0.5rem 0.75rem', marginBottom: '0.5rem',
                    fontSize: '0.78rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'
                }}>
                    <AlertTriangle size={14} />
                    Fullscreen is REQUIRED. Click to re-enter. Violations are being counted.
                </div>
            )}
        </div>
    )
}


export default function CommunicationHub({ user }) {
    const [view, setView] = useState('loading') // loading | tests | practice | test-runner | test-complete
    const [availableTests, setAvailableTests] = useState([])
    const [activeModule, setActiveModule] = useState('overview')
    const [report, setReport] = useState(null)
    const [loadingReport, setLoadingReport] = useState(false)
    const [activeTest, setActiveTest] = useState(null)
    const [activeAttempt, setActiveAttempt] = useState(null)
    const [currentTestModule, setCurrentTestModule] = useState('A')
    const [moduleScores, setModuleScores] = useState({})
    const sessionId = useRef(crypto.randomUUID ? crypto.randomUUID() : `s_${Date.now()}`).current

    const [wasAutoTerminated, setWasAutoTerminated] = useState(false)

    // Proctoring — active in test-runner or in practice exercise modules
    const isProctoredModule = view === 'test-runner' || (view === 'practice' && activeModule !== 'overview')
    const proctoringConfig = activeTest?.proctoring_config || DEFAULT_PROCTOR_CONFIG

    // Auto-terminate callback — fires when violations >= MAX_VIOLATIONS or agent terminates
    const handleAutoTerminate = useCallback(async () => {
        if (!activeAttempt) return
        setWasAutoTerminated(true)
        try {
            await axios.post(`${API_BASE}/tests/attempt/${activeAttempt}/finish`, {
                proctoring_violations: MAX_VIOLATIONS,
                auto_terminated: true,
                violation_details: {
                    reason: 'Auto-terminated: maximum violations exceeded or agent-initiated termination'
                }
            })
        } catch {}
        setView('test-complete')
    }, [activeAttempt])

    const proctoring = useProctoring(user?.id, sessionId, isProctoredModule, proctoringConfig, handleAutoTerminate)

    // Fetch available tests on mount
    useEffect(() => {
        const loadTests = async () => {
            try {
                const res = await axios.get(`${API_BASE}/tests/student/available`, { params: { studentId: user?.id } })
                setAvailableTests(res.data || [])
                setView(res.data?.length > 0 ? 'tests' : 'practice')
            } catch {
                setView('practice')
            }
        }
        if (user?.id) loadTests()
    }, [user?.id])

    const fetchReport = useCallback(async () => {
        if (!user?.id) return
        setLoadingReport(true)
        try {
            const res = await axios.get(`${API_BASE}/report`, { params: { userId: user.id, sessionId } })
            setReport(res.data)
        } catch { /* ignore */ }
        setLoadingReport(false)
    }, [user?.id, sessionId])

    useEffect(() => { if (view === 'practice') fetchReport() }, [view, fetchReport])

    // Start a test attempt
    const startTest = async (test) => {
        try {
            const res = await axios.post(`${API_BASE}/tests/${test.id}/start`, {
                studentId: user.id,
                studentName: user.name || user.username || ''
            })
            setActiveTest(res.data.test)
            setActiveAttempt(res.data.attemptId)
            setCurrentTestModule('A')
            setModuleScores({})
            setView('test-runner')
        } catch (err) {
            alert(err.response?.data?.detail || 'Failed to start test')
        }
    }

    // Handle module completion in test mode
    const handleModuleDone = async (module, score, data) => {
        const newScores = { ...moduleScores, [module]: score }
        setModuleScores(newScores)
        try {
            const res = await axios.post(`${API_BASE}/tests/attempt/${activeAttempt}/submit-module`, {
                module, score, data
            })
            if (res.data.completed) {
                setView('test-complete')
            } else if (res.data.next_module) {
                setCurrentTestModule(res.data.next_module)
            }
        } catch (err) {
            console.error('Failed to submit module:', err)
            const next = { A: 'B', B: 'C', C: 'D' }
            if (next[module]) setCurrentTestModule(next[module])
            else setView('test-complete')
        }
    }

    const finishTest = async () => {
        try {
            await axios.post(`${API_BASE}/tests/attempt/${activeAttempt}/finish`, {
                proctoring_violations: proctoring.totalViolations,
                auto_terminated: wasAutoTerminated,
                violation_details: {
                    tab_switches: proctoring.tabSwitchCount,
                    camera_blocked: proctoring.cameraBlockedCount,
                    fullscreen_exits: proctoring.fullscreenExitCount,
                    phone_detected: proctoring.phoneDetectionCount,
                    multiple_people: proctoring.multiplePeopleCount,
                    multiple_monitors: proctoring.multipleMonitorCount
                }
            })
        } catch {}
        setWasAutoTerminated(false)
        setView('tests')
        try {
            const res = await axios.get(`${API_BASE}/tests/student/available`, { params: { studentId: user?.id } })
            setAvailableTests(res.data || [])
        } catch {}
    }

    const modules = [
        { key: 'overview', label: 'Overview', icon: <BarChart3 size={18} /> },
        { key: 'read', label: 'Read & Speak', icon: <BookOpen size={18} /> },
        { key: 'listen', label: 'Listen & Repeat', icon: <Headphones size={18} /> },
        { key: 'topic', label: 'Topic Speaking', icon: <MessageSquare size={18} /> },
        { key: 'grammar', label: 'Grammar Quiz', icon: <PenTool size={18} /> },
    ]

    if (view === 'loading') return <div className="loading-spinner" />

    /* ── TEST SELECTION VIEW ── */
    if (view === 'tests') return (
        <div ref={proctoring.containerRef} className="animate-fadeIn" style={{ minHeight: '100%', background: 'var(--bg-main, #0f172a)' }}>
            <TestSelectionScreen tests={availableTests} onStartTest={startTest} onPractice={() => setView('practice')} user={user} />
        </div>
    )

    /* ── TEST RUNNER VIEW ── */
    if (view === 'test-runner') return (
        <div ref={proctoring.containerRef} className="animate-fadeIn" style={{ minHeight: '100%', background: 'var(--bg-main, #0f172a)' }}>
            {/* Test header */}
            <div style={{
                background: 'linear-gradient(135deg, #1e40af, #7c3aed)',
                borderRadius: '1rem', padding: '1.25rem 1.5rem', color: '#fff',
                marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{activeTest?.title}</h3>
                    <p style={{ margin: '0.25rem 0 0', opacity: 0.85, fontSize: '0.8rem' }}>{activeTest?.description}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Module</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{currentTestModule} / D</div>
                </div>
            </div>

            {/* Module progress bar */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                {['A', 'B', 'C', 'D'].map(m => (
                    <div key={m} style={{
                        flex: 1, height: 6, borderRadius: 3,
                        background: moduleScores[m] !== undefined ? '#10b981' : m === currentTestModule ? 'var(--primary)' : 'var(--border-color)',
                        transition: 'background 0.3s'
                    }} />
                ))}
            </div>

            {/* Proctoring bar */}
            <ProctoringBar proctoring={proctoring} />

            {/* Active module content */}
            {currentTestModule === 'A' && (
                <ReadAndSpeak user={user} sessionId={sessionId} onDone={fetchReport}
                    testSentences={activeTest?.module_a_sentences}
                    onModuleDone={(score, data) => handleModuleDone('A', score, data)} />
            )}
            {currentTestModule === 'B' && (
                <ListenAndRepeat user={user} sessionId={sessionId} onDone={fetchReport}
                    testSentences={activeTest?.module_b_sentences}
                    onModuleDone={(score, data) => handleModuleDone('B', score, data)} />
            )}
            {currentTestModule === 'C' && (
                <TopicSpeaking user={user} sessionId={sessionId} onDone={fetchReport}
                    testTopics={activeTest?.module_c_topics}
                    onModuleDone={(score, data) => handleModuleDone('C', score, data)} />
            )}
            {currentTestModule === 'D' && (
                <GrammarQuiz user={user} sessionId={sessionId} onDone={fetchReport}
                    testQuestions={activeTest?.module_d_questions}
                    onModuleDone={(score, data) => handleModuleDone('D', score, data)} />
            )}
        </div>
    )

    /* ── TEST COMPLETE VIEW ── */
    if (view === 'test-complete') return (
        <div ref={proctoring.containerRef} className="animate-fadeIn" style={{ minHeight: '100%', background: 'var(--bg-main, #0f172a)' }}>
            <div style={{
                maxWidth: 600, margin: '2rem auto', textAlign: 'center',
                background: 'var(--bg-card)',
                border: `1px solid ${wasAutoTerminated || proctoring.autoTerminated ? '#dc2626' : 'var(--border-color)'}`,
                borderRadius: '1rem', padding: '2.5rem'
            }}>
                {(wasAutoTerminated || proctoring.autoTerminated) ? (
                    <>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚫</div>
                        <h2 style={{ margin: '0 0 0.5rem', color: '#ef4444' }}>Test Terminated</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{activeTest?.title}</p>
                        <div style={{
                            padding: '1.25rem', background: 'rgba(239,68,68,0.08)', borderRadius: '0.75rem',
                            border: '1px solid rgba(239,68,68,0.2)',
                            marginBottom: '1.5rem', lineHeight: 1.6, color: '#fca5a5', fontSize: '0.9rem'
                        }}>
                            {proctoring.agentTerminateReason
                                ? proctoring.agentTerminateReason
                                : `Your test was automatically terminated due to excessive proctoring violations (${MAX_VIOLATIONS} violations reached). This has been recorded and will be reviewed by your instructor.`
                            }
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                        <h2 style={{ margin: '0 0 0.5rem', color: 'var(--text-main)' }}>Test Submitted!</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{activeTest?.title}</p>
                        <div style={{
                            padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '0.75rem',
                            marginBottom: '1.5rem', lineHeight: 1.6, color: 'var(--text-muted)', fontSize: '0.9rem'
                        }}>
                            Your responses have been recorded successfully. Results will be reviewed and made available by your instructor.
                        </div>
                    </>
                )}

                <button onClick={finishTest} style={{
                    padding: '0.75rem 2rem', borderRadius: '0.5rem',
                    background: wasAutoTerminated || proctoring.autoTerminated ? '#dc2626' : 'var(--primary)', color: '#fff',
                    border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem'
                }}>
                    Back to Tests
                </button>
            </div>
        </div>
    )

    /* ── PRACTICE MODE (free play, same as before) ── */
    return (
        <div ref={proctoring.containerRef} className="animate-fadeIn" style={{ minHeight: '100%', background: 'var(--bg-main, #0f172a)' }}>
            {/* Back to tests button */}
            {availableTests.length > 0 && (
                <button onClick={() => setView('tests')} style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                    background: 'none', border: 'none', color: 'var(--primary)',
                    cursor: 'pointer', fontSize: '0.85rem', marginBottom: '0.75rem', padding: 0
                }}>
                    <ArrowLeft size={16} /> Back to Tests
                </button>
            )}

            {/* Module Tab Bar */}
            <div style={{
                display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
                padding: '0.75rem 0', marginBottom: '1rem',
                borderBottom: '1px solid var(--border-color)'
            }}>
                {modules.map(m => (
                    <button key={m.key} onClick={() => setActiveModule(m.key)} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.6rem 1.1rem', borderRadius: '0.5rem',
                        border: activeModule === m.key ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                        background: activeModule === m.key ? 'var(--primary)' : 'var(--bg-card)',
                        color: activeModule === m.key ? '#fff' : 'var(--text-main)',
                        fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}>
                        {m.icon}{m.label}
                    </button>
                ))}
            </div>

            {activeModule !== 'overview' && <ProctoringBar proctoring={proctoring} />}

            {activeModule === 'overview' && <OverviewPanel report={report} loading={loadingReport} onRefresh={fetchReport} onGoTo={setActiveModule} />}
            {activeModule === 'read' && <ReadAndSpeak user={user} sessionId={sessionId} onDone={fetchReport} />}
            {activeModule === 'listen' && <ListenAndRepeat user={user} sessionId={sessionId} onDone={fetchReport} />}
            {activeModule === 'topic' && <TopicSpeaking user={user} sessionId={sessionId} onDone={fetchReport} />}
            {activeModule === 'grammar' && <GrammarQuiz user={user} sessionId={sessionId} onDone={fetchReport} />}
        </div>
    )
}


/* ═══════════════════════════════════════════════════════════════
   Test Selection Screen — student picks a test or practice mode
   ═══════════════════════════════════════════════════════════════ */
function TestSelectionScreen({ tests, onStartTest, onPractice }) {
    return (
        <div>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, #1e40af, #7c3aed)',
                borderRadius: '1rem', padding: '2rem', color: '#fff',
                marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap'
            }}>
                <div style={{ flex: 1 }}>
                    <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Communication Tests</h2>
                    <p style={{ margin: '0.5rem 0 0', opacity: 0.85 }}>Complete assigned communication assessments or practice freely</p>
                </div>
                <button onClick={onPractice} style={{
                    background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: '0.5rem', color: '#fff', padding: '0.6rem 1.2rem',
                    cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem'
                }}>
                    Free Practice →
                </button>
            </div>

            {/* Proctoring Notice */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '0.75rem', marginBottom: '1.5rem'
            }}>
                <Shield size={18} color="#ef4444" />
                <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>Proctoring Enabled</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        📹 Camera · 🔒 Fullscreen · 👁️ Tab tracking · 📋 Copy/paste · 📱 Phone detect · 🖥️ Multi-monitor · 👥 People detect
                    </div>
                </div>
            </div>

            {/* Test Cards */}
            <div style={{ display: 'grid', gap: '1rem' }}>
                {tests.map(test => {
                    const pConfig = test.proctoring_config || {}
                    const hasAttempts = test.attempts_used > 0
                    const completedAttempt = test.my_attempts?.find(a => a.status === 'completed')
                    const bestScore = completedAttempt?.overall_score

                    return (
                        <div key={test.id} style={{
                            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                            borderRadius: '0.75rem', padding: '1.5rem'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                                <div>
                                    <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.1rem' }}>{test.title}</h3>
                                    {test.description && (
                                        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{test.description}</p>
                                    )}
                                </div>
                                {bestScore !== undefined && bestScore !== null && (
                                    <div style={{ textAlign: 'center', padding: '0.5rem 1rem', background: 'var(--bg-secondary)', borderRadius: '0.5rem' }}>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: bestScore >= 70 ? '#10b981' : bestScore >= 40 ? '#f59e0b' : '#ef4444' }}>
                                            {Math.round(bestScore)}%
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Best Score</div>
                                    </div>
                                )}
                            </div>

                            {/* Module counts */}
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                                {[
                                    { label: 'Read & Speak', count: test.module_a_sentences?.length || test.module_a_count, color: '#3b82f6' },
                                    { label: 'Listen & Repeat', count: test.module_b_sentences?.length || test.module_b_count, color: '#8b5cf6' },
                                    { label: 'Topics', count: test.module_c_topics?.length || test.module_c_count, color: '#10b981' },
                                    { label: 'Grammar', count: test.module_d_questions?.length || test.module_d_count, color: '#f59e0b' },
                                ].map(m => (
                                    <span key={m.label} style={{
                                        fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: '99px',
                                        background: m.color + '18', color: m.color, fontWeight: 600
                                    }}>
                                        {m.label}: {m.count}
                                    </span>
                                ))}
                            </div>

                            {/* Meta info */}
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                <span>⏱ {test.duration_minutes} min</span>
                                <span>🔄 {test.attempts_used}/{test.attempt_limit} attempts</span>
                                {pConfig.camera && <span>📹 Camera</span>}
                                {pConfig.fullscreen && <span>🔒 Fullscreen</span>}
                                {pConfig.tab_switch && <span>👁️ Tab tracking</span>}
                            </div>

                            {/* Start button */}
                            <button onClick={() => onStartTest(test)} disabled={!test.can_attempt} style={{
                                padding: '0.65rem 1.5rem', borderRadius: '0.5rem',
                                background: test.can_attempt ? 'var(--primary)' : 'var(--border-color)',
                                color: test.can_attempt ? '#fff' : 'var(--text-muted)',
                                border: 'none', fontWeight: 600, cursor: test.can_attempt ? 'pointer' : 'default',
                                fontSize: '0.88rem'
                            }}>
                                {test.can_attempt ? (hasAttempts ? 'Retake Test' : 'Start Test') : 'No Attempts Left'}
                            </button>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}


/* ═══════════════════════════════════════════════════════════════
   Overview Panel
   ═══════════════════════════════════════════════════════════════ */
function OverviewPanel({ report, loading, onRefresh, onGoTo }) {
    const moduleCards = [
        { key: 'read',   label: 'Module A – Read & Speak',    desc: 'Read a sentence aloud and get AI feedback on pronunciation & fluency.',     color: '#3b82f6', moduleName: 'Module A - Read & Speak' },
        { key: 'listen', label: 'Module B – Listen & Repeat',  desc: 'Listen to a sentence, then repeat it from memory for pronunciation practice.', color: '#8b5cf6', moduleName: 'Module B - Listen & Repeat' },
        { key: 'topic',  label: 'Module C – Topic Speaking',   desc: 'Speak freely on a given topic. AI evaluates relevance, grammar & vocabulary.',  color: '#10b981', moduleName: 'Module C - Topic Speaking' },
        { key: 'grammar',label: 'Module D – Grammar Quiz',     desc: 'Fill-in-the-blank grammar quiz covering tenses, prepositions, articles & adverbs.', color: '#f59e0b', moduleName: 'Module D - Grammar Quiz' },
    ]

    const getModuleStat = name => report?.modules?.find(m => m.name === name)

    return (
        <div>
            {/* Overall Score Banner */}
            <div style={{
                background: 'linear-gradient(135deg, #1e40af, #7c3aed)',
                borderRadius: '1rem', padding: '2rem', color: '#fff',
                marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap'
            }}>
                <div style={{ flex: 1 }}>
                    <h2 style={{ margin: 0, fontSize: '1.5rem' }}>English Communication Skills</h2>
                    <p style={{ margin: '0.5rem 0 0', opacity: 0.85 }}>Practice speaking, listening, and grammar with AI-powered feedback</p>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem', fontWeight: 700 }}>{report?.overall_score ?? '–'}%</div>
                    <div style={{ opacity: 0.8, fontSize: '0.85rem' }}>Overall Score</div>
                    <div style={{ opacity: 0.7, fontSize: '0.8rem' }}>{report?.total_questions ?? 0} questions completed</div>
                </div>
                <button onClick={onRefresh} disabled={loading} style={{
                    background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '0.5rem',
                    color: '#fff', padding: '0.5rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem'
                }}>
                    <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
                </button>
            </div>

            {/* Proctoring Notice */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '0.75rem', marginBottom: '1.5rem'
            }}>
                <Shield size={18} color="#ef4444" />
                <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>Proctoring Enabled</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        📹 Camera monitoring &nbsp;·&nbsp; 🔒 Fullscreen enforcement &nbsp;·&nbsp; 👁️ Tab switch tracking &nbsp;·&nbsp; 📋 Copy/paste prevention
                    </div>
                </div>
            </div>

            {/* Module Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {moduleCards.map(mc => {
                    const stat = getModuleStat(mc.moduleName)
                    return (
                        <div key={mc.key} onClick={() => onGoTo(mc.key)} style={{
                            background: 'var(--bg-card)', borderRadius: '0.75rem',
                            border: '1px solid var(--border-color)',
                            padding: '1.5rem', cursor: 'pointer',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                        }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)' }}
                            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                                <div style={{ width: 40, height: 40, borderRadius: '0.5rem', background: mc.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: mc.color }}>
                                    {mc.key === 'read' && <BookOpen size={20} />}
                                    {mc.key === 'listen' && <Headphones size={20} />}
                                    {mc.key === 'topic' && <MessageSquare size={20} />}
                                    {mc.key === 'grammar' && <PenTool size={20} />}
                                </div>
                                <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
                            </div>
                            <h3 style={{ margin: '0 0 0.4rem', fontSize: '1rem', color: 'var(--text-main)' }}>{mc.label}</h3>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{mc.desc}</p>
                            {stat && (
                                <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', fontSize: '0.8rem' }}>
                                    <span style={{ color: mc.color, fontWeight: 600 }}>{stat.percentage}%</span>
                                    <span style={{ color: 'var(--text-muted)' }}>{stat.questions_completed} done</span>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}


/* ═══════════════════════════════════════════════════════════════
   Shared Speech Recognition Hook
   ═══════════════════════════════════════════════════════════════ */
function useSpeechRecognition() {
    const [isListening, setIsListening] = useState(false)
    const [transcript, setTranscript] = useState('')
    const recognitionRef = useRef(null)
    const startTimeRef = useRef(0)
    const [duration, setDuration] = useState(0)

    const startListening = useCallback(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
        if (!SpeechRecognition) {
            alert('Speech Recognition is not supported in this browser. Please use Chrome.')
            return
        }
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'

        let finalTranscript = ''
        recognition.onresult = (e) => {
            let interim = ''
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) {
                    finalTranscript += e.results[i][0].transcript + ' '
                } else {
                    interim += e.results[i][0].transcript
                }
            }
            setTranscript((finalTranscript + interim).trim())
        }
        recognition.onerror = () => setIsListening(false)
        recognition.onend = () => {
            setIsListening(false)
            setDuration((Date.now() - startTimeRef.current) / 1000)
        }

        startTimeRef.current = Date.now()
        recognitionRef.current = recognition
        recognition.start()
        setIsListening(true)
        setTranscript('')
    }, [])

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.stop()
        }
        setDuration((Date.now() - startTimeRef.current) / 1000)
        setIsListening(false)
    }, [])

    return { isListening, transcript, duration, startListening, stopListening, setTranscript }
}


/* ═══════════════════════════════════════════════════════════════
   Shared Result Card
   ═══════════════════════════════════════════════════════════════ */
function ResultCard({ result, onNext, nextLabel }) {
    const score = result.pronunciation_score ?? result.score ?? 0
    const scoreColor = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'

    return (
        <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: '0.75rem', padding: '1.5rem', marginTop: '1rem'
        }}>
            {/* Score */}
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <div style={{ fontSize: '3rem', fontWeight: 700, color: scoreColor }}>{score}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>out of 100</div>
            </div>

            {/* Feedback */}
            {result.feedback && (
                <div style={{
                    background: 'var(--bg-secondary)', borderRadius: '0.5rem',
                    padding: '1rem', marginBottom: '1rem', fontSize: '0.9rem', lineHeight: 1.6,
                    color: 'var(--text-main)'
                }}>
                    <strong>Feedback:</strong> {result.feedback}
                </div>
            )}

            {/* Strengths & Improvements */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                {result.strengths?.length > 0 && (
                    <div>
                        <h4 style={{ margin: '0 0 0.5rem', color: '#10b981', fontSize: '0.85rem' }}>✓ Strengths</h4>
                        {result.strengths.map((s, i) => (
                            <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.2rem 0' }}>• {s}</div>
                        ))}
                    </div>
                )}
                {result.improvements?.length > 0 && (
                    <div>
                        <h4 style={{ margin: '0 0 0.5rem', color: '#f59e0b', fontSize: '0.85rem' }}>⚡ Improvements</h4>
                        {result.improvements.map((s, i) => (
                            <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.2rem 0' }}>• {s}</div>
                        ))}
                    </div>
                )}
            </div>

            <button onClick={onNext} style={{
                width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
                background: 'var(--primary)', color: '#fff',
                border: 'none', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
            }}>
                {nextLabel || 'Next Exercise'} <ArrowRight size={16} />
            </button>
        </div>
    )
}


/* ═══════════════════════════════════════════════════════════════
   Module A: Read & Speak
   ═══════════════════════════════════════════════════════════════ */
function ReadAndSpeak({ user, sessionId, onDone, testSentences, onModuleDone }) {
    const [sentence, setSentence] = useState(null)
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [result, setResult] = useState(null)
    const [testIndex, setTestIndex] = useState(0)
    const [testScores, setTestScores] = useState([])
    const [testDetails, setTestDetails] = useState([])
    const isTestMode = !!testSentences?.length
    const { isListening, transcript, duration, startListening, stopListening, setTranscript } = useSpeechRecognition()

    const fetchSentence = async () => {
        setLoading(true); setResult(null); setTranscript('')
        if (isTestMode) {
            setSentence({ sentence: testSentences[testIndex], sentence_id: testIndex + 1 })
            setLoading(false)
            return
        }
        try {
            const res = await axios.get(`${API_BASE}/moduleA/sentence`, { params: { userId: user.id } })
            setSentence(res.data)
        } catch (e) { console.error(e) }
        setLoading(false)
    }

    useEffect(() => { fetchSentence() }, [testIndex])

    const handleSubmit = async () => {
        if (!transcript.trim()) return
        setSubmitting(true)
        try {
            const res = await axios.post(`${API_BASE}/moduleA`, {
                userId: user.id, sessionId,
                sentenceId: sentence.sentence_id,
                targetSentence: sentence.sentence,
                transcribedText: transcript,
                duration
            })
            setResult(res.data)
            onDone?.()
            // In test mode, auto-advance without showing score
            if (isTestMode) {
                const score = res.data.pronunciation_score ?? res.data.score ?? 0
                const newScores = [...testScores, score]
                const newDetails = [...testDetails, {
                    sentence: sentence.sentence,
                    transcript,
                    score,
                    feedback: res.data.feedback,
                    strengths: res.data.strengths,
                    improvements: res.data.improvements
                }]
                setTestScores(newScores)
                setTestDetails(newDetails)
                if (testIndex + 1 < testSentences.length) {
                    setTestIndex(prev => prev + 1)
                } else {
                    const avg = newScores.reduce((a, b) => a + b, 0) / newScores.length
                    onModuleDone?.(avg, { scores: newScores, details: newDetails })
                }
            }
        } catch (e) { console.error(e) }
        setSubmitting(false)
    }

    if (loading) return <div className="loading-spinner" />

    const handleNext = () => {
        if (isTestMode) return // handled in handleSubmit
        fetchSentence()
    }

    return (
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <div style={{
                background: 'linear-gradient(135deg, #1e40af, #3b82f6)', borderRadius: '1rem',
                padding: '1.5rem 2rem', color: '#fff', marginBottom: '1.5rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <div>
                    <h3 style={{ margin: '0 0 0.25rem' }}>📖 Read & Speak</h3>
                    <p style={{ margin: 0, opacity: 0.85, fontSize: '0.85rem' }}>Read the sentence below aloud. Click the mic, speak clearly, then submit for AI feedback.</p>
                </div>
                {isTestMode && (
                    <div style={{ textAlign: 'center', flexShrink: 0, marginLeft: '1rem' }}>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{testIndex + 1}/{testSentences.length}</div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Sentences</div>
                    </div>
                )}
            </div>

            {sentence && !result && (
                <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    borderRadius: '0.75rem', padding: '2rem', textAlign: 'center'
                }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Read this sentence:</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.6, marginBottom: '2rem' }}>
                        "{sentence.sentence}"
                    </div>

                    {/* Mic Button */}
                    <button onClick={isListening ? stopListening : startListening} style={{
                        width: 80, height: 80, borderRadius: '50%',
                        border: `3px solid ${isListening ? '#ef4444' : '#3b82f6'}`,
                        background: isListening ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                        color: isListening ? '#ef4444' : '#3b82f6',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1rem', transition: 'all 0.3s'
                    }}>
                        {isListening ? <Square size={28} /> : <Mic size={28} />}
                    </button>
                    <div style={{ fontSize: '0.82rem', color: isListening ? '#ef4444' : 'var(--text-muted)', fontWeight: isListening ? 600 : 400 }}>
                        {isListening ? '🔴 Recording… Click to stop' : 'Click to start recording'}
                    </div>

                    {/* Transcript — hidden in test mode */}
                    {transcript && !isTestMode && (
                        <div style={{
                            marginTop: '1.5rem', padding: '1rem', borderRadius: '0.5rem',
                            background: 'var(--bg-secondary)', fontSize: '0.9rem',
                            color: 'var(--text-main)', textAlign: 'left'
                        }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your speech:</div>
                            {transcript}
                        </div>
                    )}

                    {/* Submit */}
                    {transcript && !isListening && (
                        <button onClick={handleSubmit} disabled={submitting} style={{
                            marginTop: '1rem', padding: '0.75rem 2rem', borderRadius: '0.5rem',
                            background: '#3b82f6', color: '#fff', border: 'none',
                            fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
                            opacity: submitting ? 0.7 : 1
                        }}>
                            {submitting ? (isTestMode ? 'Submitting…' : 'Evaluating…') : (isTestMode ? 'Submit' : 'Submit for AI Evaluation')}
                        </button>
                    )}
                </div>
            )}

            {result && !isTestMode && <ResultCard result={result} onNext={handleNext} />}
        </div>
    )
}


/* ═══════════════════════════════════════════════════════════════
   Module B: Listen & Repeat
   ═══════════════════════════════════════════════════════════════ */
function ListenAndRepeat({ user, sessionId, onDone, testSentences, onModuleDone }) {
    const [sentence, setSentence] = useState(null)
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [result, setResult] = useState(null)
    const [played, setPlayed] = useState(false)
    const [audioError, setAudioError] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)
    const [testIndex, setTestIndex] = useState(0)
    const [testScores, setTestScores] = useState([])
    const [testDetails, setTestDetails] = useState([])
    const isTestMode = !!testSentences?.length
    const audioRef = useRef(null)
    const { isListening, transcript, duration, startListening, stopListening, setTranscript } = useSpeechRecognition()

    const fetchSentence = async () => {
        setLoading(true); setResult(null); setTranscript(''); setPlayed(false); setAudioError(false); setIsPlaying(false)
        if (isTestMode) {
            setSentence({ sentence: testSentences[testIndex], sentence_id: testIndex + 1, audio_url: null })
            setLoading(false)
            return
        }
        try {
            const res = await axios.get(`${API_BASE}/moduleB/sentence`, { params: { userId: user.id } })
            setSentence(res.data)
        } catch (e) { console.error(e) }
        setLoading(false)
    }

    useEffect(() => { fetchSentence() }, [testIndex])

    // Browser SpeechSynthesis fallback
    const speakWithBrowser = (text) => {
        return new Promise((resolve, reject) => {
            if (!window.speechSynthesis) { reject('SpeechSynthesis not supported'); return }
            window.speechSynthesis.cancel()
            const utterance = new SpeechSynthesisUtterance(text)
            utterance.lang = 'en-GB'
            utterance.rate = 0.9
            utterance.pitch = 1
            // Try to pick a good English voice
            const voices = window.speechSynthesis.getVoices()
            const enVoice = voices.find(v => v.lang.startsWith('en-GB')) || voices.find(v => v.lang.startsWith('en'))
            if (enVoice) utterance.voice = enVoice
            utterance.onend = resolve
            utterance.onerror = reject
            window.speechSynthesis.speak(utterance)
        })
    }

    const playAudio = async () => {
        if (!sentence) return
        setIsPlaying(true)

        // Try backend TTS audio first
        if (sentence.audio_url && audioRef.current) {
            try {
                audioRef.current.src = `${BACKEND_BASE}${sentence.audio_url}`
                await audioRef.current.play()
                setPlayed(true)
                audioRef.current.onended = () => setIsPlaying(false)
                return
            } catch (err) {
                console.warn('Backend audio failed, using browser TTS:', err)
            }
        }

        // Fallback: browser SpeechSynthesis
        try {
            setAudioError(true)
            await speakWithBrowser(sentence.sentence)
            setPlayed(true)
        } catch (err) {
            console.error('All TTS methods failed:', err)
        }
        setIsPlaying(false)
    }

    const handleSubmit = async () => {
        if (!transcript.trim()) return
        setSubmitting(true)
        try {
            const res = await axios.post(`${API_BASE}/moduleB`, {
                userId: user.id, sessionId,
                sentenceId: sentence.sentence_id,
                targetSentence: sentence.sentence,
                transcribedText: transcript,
                duration
            })
            setResult(res.data)
            onDone?.()
            // In test mode, auto-advance without showing score
            if (isTestMode) {
                const score = res.data.pronunciation_score ?? res.data.score ?? 0
                const newScores = [...testScores, score]
                const newDetails = [...testDetails, {
                    sentence: sentence.sentence,
                    transcript,
                    score,
                    feedback: res.data.feedback,
                    strengths: res.data.strengths,
                    improvements: res.data.improvements
                }]
                setTestScores(newScores)
                setTestDetails(newDetails)
                if (testIndex + 1 < testSentences.length) {
                    setTestIndex(prev => prev + 1)
                } else {
                    const avg = newScores.reduce((a, b) => a + b, 0) / newScores.length
                    onModuleDone?.(avg, { scores: newScores, details: newDetails })
                }
            }
        } catch (e) { console.error(e) }
        setSubmitting(false)
    }

    if (loading) return <div className="loading-spinner" />

    const handleNext = () => {
        if (isTestMode) return // handled in handleSubmit
        fetchSentence()
    }

    return (
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <audio ref={audioRef} />
            <div style={{
                background: 'linear-gradient(135deg, #6d28d9, #8b5cf6)', borderRadius: '1rem',
                padding: '1.5rem 2rem', color: '#fff', marginBottom: '1.5rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <div>
                    <h3 style={{ margin: '0 0 0.25rem' }}>🎧 Listen & Repeat</h3>
                    <p style={{ margin: 0, opacity: 0.85, fontSize: '0.85rem' }}>Listen to the audio, then repeat what you heard. Your pronunciation will be evaluated by AI.</p>
                </div>
                {isTestMode && (
                    <div style={{ textAlign: 'center', flexShrink: 0, marginLeft: '1rem' }}>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{testIndex + 1}/{testSentences.length}</div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Sentences</div>
                    </div>
                )}
            </div>

            {sentence && !result && (
                <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    borderRadius: '0.75rem', padding: '2rem', textAlign: 'center'
                }}>
                    {/* Play Button */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <button onClick={playAudio} disabled={isPlaying} style={{
                            width: 80, height: 80, borderRadius: '50%',
                            border: `3px solid ${isPlaying ? '#f59e0b' : '#8b5cf6'}`,
                            background: isPlaying ? 'rgba(245,158,11,0.1)' : 'rgba(139,92,246,0.1)',
                            color: isPlaying ? '#f59e0b' : '#8b5cf6', cursor: isPlaying ? 'default' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto', transition: 'all 0.3s'
                        }}>
                            {isPlaying ? <Play size={28} className="spin" /> : <Volume2 size={28} />}
                        </button>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {isPlaying ? '🔊 Playing…' : played ? 'Click to listen again' : 'Click to listen'}
                        </div>
                        {audioError && (
                            <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: '#f59e0b' }}>
                                Using browser speech synthesis
                            </div>
                        )}
                    </div>

                    {/* After listening, show mic */}
                    {played && (
                        <>
                            <div style={{ borderTop: '1px solid var(--border-color)', margin: '1rem 0', padding: '1rem 0 0' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Now repeat what you heard:</div>
                                <button onClick={isListening ? stopListening : startListening} style={{
                                    width: 70, height: 70, borderRadius: '50%',
                                    border: `3px solid ${isListening ? '#ef4444' : '#3b82f6'}`,
                                    background: isListening ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                                    color: isListening ? '#ef4444' : '#3b82f6',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto'
                                }}>
                                    {isListening ? <Square size={24} /> : <Mic size={24} />}
                                </button>
                                <div style={{ fontSize: '0.82rem', color: isListening ? '#ef4444' : 'var(--text-muted)', marginTop: '0.4rem' }}>
                                    {isListening ? '🔴 Recording…' : 'Click to record'}
                                </div>
                            </div>

                            {/* Transcript — hidden in test mode */}
                            {transcript && !isTestMode && (
                                <div style={{
                                    marginTop: '1rem', padding: '1rem', borderRadius: '0.5rem',
                                    background: 'var(--bg-secondary)', fontSize: '0.9rem',
                                    color: 'var(--text-main)', textAlign: 'left'
                                }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your speech:</div>
                                    {transcript}
                                </div>
                            )}

                            {transcript && !isListening && (
                                <button onClick={handleSubmit} disabled={submitting} style={{
                                    marginTop: '1rem', padding: '0.75rem 2rem', borderRadius: '0.5rem',
                                    background: '#8b5cf6', color: '#fff', border: 'none',
                                    fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
                                    opacity: submitting ? 0.7 : 1
                                }}>
                                    {submitting ? (isTestMode ? 'Submitting…' : 'Evaluating…') : (isTestMode ? 'Submit' : 'Submit for AI Evaluation')}
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}

            {result && !isTestMode && <ResultCard result={result} onNext={handleNext} />}
        </div>
    )
}


/* ═══════════════════════════════════════════════════════════════
   Module C: Topic Speaking
   ═══════════════════════════════════════════════════════════════ */
function TopicSpeaking({ user, sessionId, onDone, testTopics, onModuleDone }) {
    const [topic, setTopic] = useState(null)
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [result, setResult] = useState(null)
    const [testIndex, setTestIndex] = useState(0)
    const [testScores, setTestScores] = useState([])
    const [testDetails, setTestDetails] = useState([])
    const isTestMode = !!testTopics?.length
    const { isListening, transcript, duration, startListening, stopListening, setTranscript } = useSpeechRecognition()

    const fetchTopic = async () => {
        setLoading(true); setResult(null); setTranscript('')
        if (isTestMode) {
            setTopic({ topic: testTopics[testIndex], topic_id: testIndex + 1 })
            setLoading(false)
            return
        }
        try {
            const res = await axios.get(`${API_BASE}/moduleC/topic`, { params: { userId: user.id } })
            setTopic(res.data)
        } catch (e) { console.error(e) }
        setLoading(false)
    }

    useEffect(() => { fetchTopic() }, [testIndex])

    const handleSubmit = async () => {
        if (!transcript.trim()) return
        setSubmitting(true)
        try {
            const res = await axios.post(`${API_BASE}/moduleC`, {
                userId: user.id, sessionId,
                topicId: topic.topic_id,
                transcribedText: transcript
            })
            setResult(res.data)
            onDone?.()
            // In test mode, auto-advance without showing score
            if (isTestMode) {
                const score = res.data.score ?? 0
                const newScores = [...testScores, score]
                const newDetails = [...testDetails, {
                    topic: topic.topic,
                    transcript,
                    score,
                    relevance_score: res.data.relevance_score,
                    grammar_score: res.data.grammar_score,
                    vocabulary_score: res.data.vocabulary_score,
                    coherence_score: res.data.coherence_score,
                    feedback: res.data.feedback,
                    strengths: res.data.strengths,
                    improvements: res.data.improvements
                }]
                setTestScores(newScores)
                setTestDetails(newDetails)
                if (testIndex + 1 < testTopics.length) {
                    setTestIndex(prev => prev + 1)
                } else {
                    const avg = newScores.reduce((a, b) => a + b, 0) / newScores.length
                    onModuleDone?.(avg, { scores: newScores, details: newDetails })
                }
            }
        } catch (e) { console.error(e) }
        setSubmitting(false)
    }

    if (loading) return <div className="loading-spinner" />

    const handleNext = () => {
        if (isTestMode) return // handled in handleSubmit
        fetchTopic()
    }

    return (
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <div style={{
                background: 'linear-gradient(135deg, #047857, #10b981)', borderRadius: '1rem',
                padding: '1.5rem 2rem', color: '#fff', marginBottom: '1.5rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <div>
                    <h3 style={{ margin: '0 0 0.25rem' }}>💬 Topic Speaking</h3>
                    <p style={{ margin: 0, opacity: 0.85, fontSize: '0.85rem' }}>Speak about the topic below for 30-60 seconds. AI will evaluate relevance, grammar, vocabulary, and coherence.</p>
                </div>
                {isTestMode && (
                    <div style={{ textAlign: 'center', flexShrink: 0, marginLeft: '1rem' }}>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{testIndex + 1}/{testTopics.length}</div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Topics</div>
                    </div>
                )}
            </div>

            {topic && !result && (
                <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    borderRadius: '0.75rem', padding: '2rem', textAlign: 'center'
                }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your topic:</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '2rem', lineHeight: 1.5 }}>
                        "{topic.topic}"
                    </div>

                    <button onClick={isListening ? stopListening : startListening} style={{
                        width: 80, height: 80, borderRadius: '50%',
                        border: `3px solid ${isListening ? '#ef4444' : '#10b981'}`,
                        background: isListening ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                        color: isListening ? '#ef4444' : '#10b981',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto'
                    }}>
                        {isListening ? <Square size={28} /> : <Mic size={28} />}
                    </button>
                    <div style={{ fontSize: '0.82rem', color: isListening ? '#ef4444' : 'var(--text-muted)', marginTop: '0.5rem' }}>
                        {isListening ? '🔴 Recording… Speak about the topic' : 'Click to start speaking'}
                    </div>

                    {/* Transcript — hidden in test mode */}
                    {transcript && !isTestMode && (
                        <div style={{
                            marginTop: '1.5rem', padding: '1rem', borderRadius: '0.5rem',
                            background: 'var(--bg-secondary)', fontSize: '0.9rem',
                            color: 'var(--text-main)', textAlign: 'left', maxHeight: 200, overflow: 'auto'
                        }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your speech:</div>
                            {transcript}
                        </div>
                    )}

                    {transcript && !isListening && (
                        <button onClick={handleSubmit} disabled={submitting} style={{
                            marginTop: '1rem', padding: '0.75rem 2rem', borderRadius: '0.5rem',
                            background: '#10b981', color: '#fff', border: 'none',
                            fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
                            opacity: submitting ? 0.7 : 1
                        }}>
                            {submitting ? (isTestMode ? 'Submitting…' : 'Evaluating…') : (isTestMode ? 'Submit' : 'Submit for AI Evaluation')}
                        </button>
                    )}
                </div>
            )}

            {/* Result with sub-scores — hidden in test mode */}
            {result && !isTestMode && (
                <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    borderRadius: '0.75rem', padding: '1.5rem', marginTop: '1rem'
                }}>
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '3rem', fontWeight: 700, color: result.score >= 70 ? '#10b981' : result.score >= 40 ? '#f59e0b' : '#ef4444' }}>{result.score}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>out of 100</div>
                    </div>

                    {/* Sub-scores */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                        {[
                            { label: 'Relevance', score: result.relevance_score, max: 25, color: '#3b82f6' },
                            { label: 'Grammar', score: result.grammar_score, max: 25, color: '#8b5cf6' },
                            { label: 'Vocabulary', score: result.vocabulary_score, max: 25, color: '#10b981' },
                            { label: 'Coherence', score: result.coherence_score, max: 25, color: '#f59e0b' },
                        ].map(s => (
                            <div key={s.label} style={{ background: 'var(--bg-secondary)', borderRadius: '0.5rem', padding: '0.75rem' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.label}</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                                    <span style={{ fontSize: '1.3rem', fontWeight: 700, color: s.color }}>{s.score}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ {s.max}</span>
                                </div>
                                <div style={{ marginTop: '0.4rem', height: 4, borderRadius: 2, background: 'var(--border-color)' }}>
                                    <div style={{ height: '100%', borderRadius: 2, width: `${(s.score / s.max) * 100}%`, background: s.color }} />
                                </div>
                            </div>
                        ))}
                    </div>

                    {result.feedback && (
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem', fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-main)' }}>
                            <strong>Feedback:</strong> {result.feedback}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        {result.strengths?.length > 0 && (
                            <div>
                                <h4 style={{ margin: '0 0 0.5rem', color: '#10b981', fontSize: '0.85rem' }}>✓ Strengths</h4>
                                {result.strengths.map((s, i) => <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.2rem 0' }}>• {s}</div>)}
                            </div>
                        )}
                        {result.improvements?.length > 0 && (
                            <div>
                                <h4 style={{ margin: '0 0 0.5rem', color: '#f59e0b', fontSize: '0.85rem' }}>⚡ Improvements</h4>
                                {result.improvements.map((s, i) => <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.2rem 0' }}>• {s}</div>)}
                            </div>
                        )}
                    </div>

                    <button onClick={handleNext} style={{
                        width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
                        background: '#10b981', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                    }}>
                        Next Topic <ArrowRight size={16} />
                    </button>
                </div>
            )}
        </div>
    )
}


/* ═══════════════════════════════════════════════════════════════
   Module D: Grammar Quiz
   ═══════════════════════════════════════════════════════════════ */
function GrammarQuiz({ user, sessionId, onDone, testQuestions, onModuleDone }) {
    const [quiz, setQuiz] = useState(null)
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [answers, setAnswers] = useState({})
    const [result, setResult] = useState(null)
    const isTestMode = !!testQuestions?.length

    const fetchQuiz = async () => {
        setLoading(true); setResult(null); setAnswers({})
        if (isTestMode) {
            // Use admin-provided questions directly
            // Backend stores correct answer in "answer" field, normalize to "correct"
            const questions = testQuestions.map((q, i) => ({
                id: q.id ?? i + 1,
                sentence: q.sentence,
                options: q.options || [],
                correct: q.correct || q.answer || '',
                category: q.category || 'grammar'
            }))
            setQuiz({ questions })
            setLoading(false)
            return
        }
        try {
            const res = await axios.get(`${API_BASE}/moduleD/quiz`, { params: { userId: user.id } })
            setQuiz(res.data)
        } catch (e) { console.error(e) }
        setLoading(false)
    }

    useEffect(() => { fetchQuiz() }, [])

    const handleSubmit = async () => {
        if (!quiz?.questions?.length) return
        setSubmitting(true)

        if (isTestMode) {
            // Evaluate locally for test mode
            let correct = 0
            const review = quiz.questions.map(q => {
                const userAnswer = (answers[q.id] || '').trim().toLowerCase()
                const correctAnswer = (q.correct || '').trim().toLowerCase()
                const isCorrect = userAnswer === correctAnswer
                if (isCorrect) correct++
                return {
                    sentence: q.sentence,
                    user_answer: answers[q.id] || '',
                    correct_answer: q.correct,
                    correct: isCorrect
                }
            })
            const percentage = Math.round((correct / quiz.questions.length) * 100)
            setResult({ percentage, correct_count: correct, total: quiz.questions.length, review })

            // Also try backend submission for records
            try {
                const formatted = quiz.questions.map(q => ({ id: q.id, answer: answers[q.id] || '' }))
                await axios.post(`${API_BASE}/moduleD/submit`, { userId: user.id, sessionId, answers: formatted })
            } catch {}

            onDone?.()
            // Auto-advance in test mode without showing results
            onModuleDone?.(percentage, { correct, total: quiz.questions.length, review })
            setSubmitting(false)
            return
        }

        const formatted = quiz.questions.map(q => ({ id: q.id, answer: answers[q.id] || '' }))
        try {
            const res = await axios.post(`${API_BASE}/moduleD/submit`, {
                userId: user.id, sessionId, answers: formatted
            })
            setResult(res.data)
            onDone?.()
        } catch (e) { console.error(e) }
        setSubmitting(false)
    }

    const handleNextOrComplete = () => {
        if (isTestMode && result) {
            onModuleDone?.(result.percentage, { correct: result.correct_count, total: result.total })
        } else {
            fetchQuiz()
        }
    }

    if (loading) return <div className="loading-spinner" />

    return (
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <div style={{
                background: 'linear-gradient(135deg, #d97706, #f59e0b)', borderRadius: '1rem',
                padding: '1.5rem 2rem', color: '#fff', marginBottom: '1.5rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <div>
                    <h3 style={{ margin: '0 0 0.25rem' }}>✏️ Grammar Quiz</h3>
                    <p style={{ margin: 0, opacity: 0.85, fontSize: '0.85rem' }}>Fill in the blanks with the correct word. Test your knowledge of tenses, prepositions, articles, and adverbs.</p>
                </div>
                {isTestMode && quiz && (
                    <div style={{ textAlign: 'center', flexShrink: 0, marginLeft: '1rem' }}>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{quiz.questions.length}</div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Questions</div>
                    </div>
                )}
            </div>

            {/* Quiz Questions */}
            {quiz && !result && (
                <div>
                    {quiz.questions.map((q, idx) => (
                        <div key={q.id} style={{
                            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                            borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '0.75rem'
                        }}>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'start' }}>
                                <div style={{
                                    width: 30, height: 30, borderRadius: '50%',
                                    background: 'var(--primary)', color: '#fff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.8rem', fontWeight: 700, flexShrink: 0
                                }}>{idx + 1}</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                                        {q.sentence}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input
                                            type="text"
                                            placeholder="Your answer…"
                                            value={answers[q.id] || ''}
                                            onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                            style={{
                                                flex: 1, padding: '0.6rem 0.75rem', borderRadius: '0.4rem',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--bg-card)', color: 'var(--text-main)',
                                                fontSize: '0.9rem', outline: 'none'
                                            }}
                                        />
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{q.category.replace(/_/g, ' ')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    <button onClick={handleSubmit} disabled={submitting} style={{
                        width: '100%', padding: '0.85rem', borderRadius: '0.5rem',
                        background: '#f59e0b', color: '#fff', border: 'none',
                        fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem',
                        opacity: submitting ? 0.7 : 1
                    }}>
                        {submitting ? 'Checking…' : `Submit Answers (${Object.values(answers).filter(Boolean).length}/${quiz.questions.length})`}
                    </button>
                </div>
            )}

            {/* Quiz Results — hidden in test mode (auto-advances) */}
            {result && !isTestMode && (
                <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    borderRadius: '0.75rem', padding: '1.5rem'
                }}>
                    {/* Score Banner */}
                    <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                        <div style={{
                            fontSize: '3rem', fontWeight: 700,
                            color: result.percentage >= 70 ? '#10b981' : result.percentage >= 40 ? '#f59e0b' : '#ef4444'
                        }}>{result.percentage}%</div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            {result.correct_count} / {result.total} correct
                        </div>
                    </div>

                    {/* Question Review */}
                    {result.review?.map((r, i) => (
                        <div key={i} style={{
                            display: 'flex', gap: '0.75rem', padding: '0.75rem 0',
                            borderTop: i > 0 ? '1px solid var(--border-color)' : 'none',
                            alignItems: 'center'
                        }}>
                            {r.correct ? <CheckCircle size={20} color="#10b981" /> : <XCircle size={20} color="#ef4444" />}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>{r.sentence}</div>
                                <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                                    <span style={{ color: r.correct ? '#10b981' : '#ef4444' }}>Your answer: {r.user_answer}</span>
                                    {!r.correct && (
                                        <span style={{ color: '#10b981', marginLeft: '0.75rem' }}>Correct: {r.correct_answer}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    <button onClick={handleNextOrComplete} style={{
                        width: '100%', padding: '0.75rem', borderRadius: '0.5rem',
                        background: '#f59e0b', color: '#fff', border: 'none',
                        fontWeight: 600, cursor: 'pointer', marginTop: '1rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                    }}>
                        New Quiz <ArrowRight size={16} />
                    </button>
                </div>
            )}
        </div>
    )
}
