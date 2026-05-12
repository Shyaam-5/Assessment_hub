/**
 * Proctoring hooks for GlobalTestInterface.
 * Extracted from the monolithic component for modularity.
 *
 * Modes:
 *   standard     — timer + basic tab-switch warning only
 *   enhanced     — tab tracking, fullscreen, copy/paste/DevTools block, multi-monitor
 *   ai_proctored — everything in enhanced + camera/audio, TF.js detection, behavior tracking
 */
import { useState, useEffect, useRef, useCallback } from 'react'

const MAX_VIOLATIONS = 10

// ── Tab & Window Tracking ────────────────────────────────────────
export function useTabTracking(enabled, maxSwitches, onViolation) {
    const [tabSwitches, setTabSwitches] = useState(0)
    const tabRef = useRef(0)

    useEffect(() => {
        if (!enabled) return
        const onVisChange = () => {
            if (document.hidden) {
                tabRef.current += 1
                setTabSwitches(tabRef.current)
                onViolation?.('tab_switch', tabRef.current)
            }
        }
        document.addEventListener('visibilitychange', onVisChange)
        return () => {
            document.removeEventListener('visibilitychange', onVisChange)
        }
    }, [enabled, onViolation])

    return { tabSwitches, tabSwitchesRef: tabRef }
}

// ── Fullscreen Enforcement ───────────────────────────────────────
export function useFullscreen(enabled, submittedRef) {
    useEffect(() => {
        if (!enabled) return
        const enterFS = () => {
            if (!submittedRef?.current && !document.fullscreenElement) {
                document.documentElement.requestFullscreen?.().catch(() => {})
            }
        }
        enterFS()
        const onFSChange = () => {
            if (!document.fullscreenElement && !submittedRef?.current) {
                setTimeout(enterFS, 300)
            }
        }
        document.addEventListener('fullscreenchange', onFSChange)
        return () => document.removeEventListener('fullscreenchange', onFSChange)
    }, [enabled, submittedRef])
}

// ── Copy/Paste & DevTools Block ──────────────────────────────────
export function useCopyPasteBlock(enabled) {
    const [copyPasteAttempts, setCopyPasteAttempts] = useState(0)
    const cpRef = useRef(0)

    useEffect(() => {
        if (!enabled) return
        const block = (e) => { e.preventDefault(); cpRef.current += 1; setCopyPasteAttempts(cpRef.current) }
        const blockCtx = (e) => e.preventDefault()
        const blockKeys = (e) => {
            if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && 'IJC'.includes(e.key.toUpperCase())) ||
                (e.ctrlKey && e.key === 'u') || e.key === 'PrintScreen') {
                e.preventDefault()
            }
        }
        document.addEventListener('copy', block)
        document.addEventListener('paste', block)
        document.addEventListener('contextmenu', blockCtx)
        document.addEventListener('keydown', blockKeys)
        return () => {
            document.removeEventListener('copy', block)
            document.removeEventListener('paste', block)
            document.removeEventListener('contextmenu', blockCtx)
            document.removeEventListener('keydown', blockKeys)
        }
    }, [enabled])

    return { copyPasteAttempts, copyPasteRef: cpRef }
}

// ── Multi-Monitor Detection ──────────────────────────────────────
export function useMultiMonitorDetection(enabled) {
    const [multipleMonitorCount, setCount] = useState(0)

    useEffect(() => {
        if (!enabled) return
        const check = () => {
            const isExt = window.screen?.isExtended
            const wOff = Math.abs(window.screenX) > 10 || Math.abs(window.screenY) > 50
            const avail = window.screen && (window.screen.availWidth > window.screen.width * 1.5)
            if (isExt || wOff || avail) setCount(c => c + 1)
        }
        const id = setInterval(check, 15000)
        check()
        return () => clearInterval(id)
    }, [enabled])

    return { multipleMonitorCount }
}

// ── Camera & Object Detection (AI-Proctored only) ────────────────
export function useCamera(enabled) {
    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const [mediaStream, setMediaStream] = useState(null)
    const [videoEnabled, setVideoEnabled] = useState(false)
    const [audioEnabled, setAudioEnabled] = useState(false)
    const [cameraBlocked, setCameraBlocked] = useState(false)
    const [cameraBlockedCount, setCameraBlockedCount] = useState(0)
    const [cameraAccessDenied, setCameraAccessDenied] = useState(false)
    const camBlockRef = useRef(0)
    const camCheckRef = useRef(null)

    const initializeCamera = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            const webcam = devices.find(d => d.kind === 'videoinput' && d.deviceId)
            const videoConstraints = webcam?.deviceId
                ? { deviceId: { exact: webcam.deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
                : { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
            const stream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints,
                audio: true
            })
            setMediaStream(stream)
            setVideoEnabled(true)
            setAudioEnabled(true)
            setCameraAccessDenied(false)
            if (videoRef.current) videoRef.current.srcObject = stream
            return true
        } catch {
            setCameraAccessDenied(true)
            return false
        }
    }, [])

    useEffect(() => {
        if (!enabled || !mediaStream) return
        const checkBlocked = () => {
            const video = videoRef.current
            const canvas = canvasRef.current
            if (!video || !canvas || video.videoWidth === 0) return
            const ctx = canvas.getContext('2d')
            canvas.width = 64; canvas.height = 48
            ctx.drawImage(video, 0, 0, 64, 48)
            const data = ctx.getImageData(0, 0, 64, 48).data
            let total = 0
            for (let i = 0; i < data.length; i += 4) total += data[i] + data[i + 1] + data[i + 2]
            const avg = total / (data.length / 4 * 3)
            if (avg < 15) {
                setCameraBlocked(true)
                camBlockRef.current += 1
                setCameraBlockedCount(camBlockRef.current)
            } else {
                setCameraBlocked(false)
            }
        }
        camCheckRef.current = setInterval(checkBlocked, 5000)
        return () => clearInterval(camCheckRef.current)
    }, [enabled, mediaStream])

    const stopCamera = useCallback(() => {
        if (mediaStream) mediaStream.getTracks().forEach(t => t.stop())
        if (camCheckRef.current) clearInterval(camCheckRef.current)
    }, [mediaStream])

    return {
        videoRef, canvasRef, mediaStream, videoEnabled, audioEnabled,
        cameraBlocked, cameraBlockedCount, cameraAccessDenied,
        camBlockRef, initializeCamera, stopCamera,
    }
}

export function useObjectDetection(enabled, videoRef) {
    const [phoneDetectionCount, setPhoneCount] = useState(0)
    const [faceMissingCount, setFaceMissing] = useState(0)
    const phoneRef = useRef(0)
    const faceRef = useRef(0)
    const modelRef = useRef(null)

    useEffect(() => {
        if (!enabled) return
        let mounted = true
        let intervalId = null
        let lastPhoneAlert = 0
        let lastFaceMissAlert = 0
        const PHONE_COOLDOWN_MS = 3000   // 3s between phone alerts (was 8s)
        const FACE_COOLDOWN_MS = 3000    // 3s between face-missing alerts
        const DETECT_INTERVAL_MS = 800   // Run detection every 800ms (was 1500ms)
        const CONFIDENCE_THRESHOLD = 0.3 // Lower threshold for better sensitivity (was 0.4)

        const loadAndDetect = async () => {
            try {
                const tf = await import('@tensorflow/tfjs')
                await tf.ready()
                const cocoSsd = await import('@tensorflow-models/coco-ssd')
                modelRef.current = await cocoSsd.load({ base: 'lite_mobilenet_v2' })
                if (!mounted) return
                console.log('✅ Object detection model loaded for proctoring')

                intervalId = setInterval(async () => {
                    if (!videoRef.current || videoRef.current.readyState < 2 || !modelRef.current) return
                    try {
                        const preds = await modelRef.current.detect(videoRef.current)
                        const deviceClasses = ['cell phone', 'laptop', 'book', 'remote']
                        const hasDevice = preds.some(p => deviceClasses.includes(p.class) && p.score > CONFIDENCE_THRESHOLD)
                        const hasFace = preds.some(p => p.class === 'person' && p.score > CONFIDENCE_THRESHOLD)
                        const now = Date.now()

                        if (hasDevice && now - lastPhoneAlert > PHONE_COOLDOWN_MS) {
                            lastPhoneAlert = now
                            phoneRef.current += 1
                            setPhoneCount(phoneRef.current)
                        }
                        if (!hasFace && now - lastFaceMissAlert > FACE_COOLDOWN_MS) {
                            lastFaceMissAlert = now
                            faceRef.current += 1
                            setFaceMissing(faceRef.current)
                        }
                    } catch { /* ignore detection errors */ }
                }, DETECT_INTERVAL_MS)
            } catch (err) { console.error('Object detection model load failed:', err) }
        }

        loadAndDetect()
        return () => { mounted = false; if (intervalId) clearInterval(intervalId) }
    }, [enabled, videoRef])

    return { phoneDetectionCount, faceMissingCount, phoneRef, faceRef }
}

// ── Face Detection (BlazeFace) ───────────────────────────────────
export function useFaceDetection(enabled, videoRef) {
    const [noFaceCount, setNoFaceCount] = useState(0)
    const [multipleFaceCount, setMultipleFaceCount] = useState(0)
    const noFaceRef = useRef(0)
    const multiFaceRef = useRef(0)
    const modelRef = useRef(null)

    useEffect(() => {
        if (!enabled) return
        let mounted = true
        let intervalId = null

        let lastNoFaceAlert = 0
        let lastMultiFaceAlert = 0
        const COOLDOWN_MS = 8000
        let noFaceStreak = 0
        const NO_FACE_STREAK_THRESHOLD = 4

        const loadAndDetect = async () => {
            try {
                const tf = await import('@tensorflow/tfjs')
                await tf.ready()
                const blazeface = await import('@tensorflow-models/blazeface')
                modelRef.current = await blazeface.load()
                if (!mounted) return
                console.log('✅ BlazeFace model loaded for face detection')

                intervalId = setInterval(async () => {
                    if (!videoRef.current || videoRef.current.readyState < 2 || !modelRef.current) return
                    try {
                        const predictions = await modelRef.current.estimateFaces(videoRef.current, false)
                        const now = Date.now()

                        if (predictions.length === 0) {
                            noFaceStreak++
                            if (noFaceStreak >= NO_FACE_STREAK_THRESHOLD && now - lastNoFaceAlert > COOLDOWN_MS) {
                                lastNoFaceAlert = now
                                noFaceRef.current += 1
                                setNoFaceCount(noFaceRef.current)
                                noFaceStreak = 0
                            }
                        } else {
                            noFaceStreak = 0
                        }

                        if (predictions.length > 1 && now - lastMultiFaceAlert > COOLDOWN_MS) {
                            lastMultiFaceAlert = now
                            multiFaceRef.current += 1
                            setMultipleFaceCount(multiFaceRef.current)
                        }
                    } catch { /* ignore detection errors */ }
                }, 2000)
            } catch (err) { console.error('BlazeFace model load failed:', err) }
        }

        loadAndDetect()
        return () => { mounted = false; if (intervalId) clearInterval(intervalId) }
    }, [enabled, videoRef])

    return { noFaceCount, multipleFaceCount, noFaceRef, multiFaceRef }
}

// ── Behavior Tracking (AI-Proctored) ─────────────────────────────
export function useBehaviorTracking(enabled, userId, testId) {
    const behaviorSessionId = useRef(`beh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    const eventsBuffer = useRef([])
    const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

    const flush = useCallback(async () => {
        if (eventsBuffer.current.length === 0) return
        const batch = [...eventsBuffer.current]
        eventsBuffer.current = []
        try {
            await fetch(`${API_BASE}/behavior/log-events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: behaviorSessionId.current, user_id: userId, events: batch }),
            })
        } catch { /* ignore flush errors */ }
    }, [userId, testId, API_BASE])

    useEffect(() => {
        if (!enabled) return
        const track = (type) => (e) => {
            eventsBuffer.current.push({
                type, ts: Date.now(),
                x: e.clientX || e.pageX || 0, y: e.clientY || e.pageY || 0,
            })
        }
        const onMove = track('mouse_move')
        const onScroll = track('scroll')
        const onFocus = track('focus')
        const onBlurEv = track('blur')

        let lastMove = 0
        const throttledMove = (e) => { if (Date.now() - lastMove > 2000) { lastMove = Date.now(); onMove(e) } }

        document.addEventListener('mousemove', throttledMove)
        document.addEventListener('scroll', onScroll)
        window.addEventListener('focus', onFocus)
        window.addEventListener('blur', onBlurEv)

        const flushId = setInterval(flush, 30000)
        return () => {
            document.removeEventListener('mousemove', throttledMove)
            document.removeEventListener('scroll', onScroll)
            window.removeEventListener('focus', onFocus)
            window.removeEventListener('blur', onBlurEv)
            clearInterval(flushId)
            flush()
        }
    }, [enabled, flush])

    return { behaviorSessionId, flushBehaviorEvents: flush }
}

// ── Agent Termination Listener ───────────────────────────────────
export function useAgentTermination(enabled, userId, sessionId, onTerminate) {
    const [agentTerminated, setAgentTerminated] = useState(false)
    const [terminateReason, setTerminateReason] = useState('')

    useEffect(() => {
        if (!enabled) return
        // Lazy-load socketService to avoid module initialization conflicts
        let cleanup = () => {}
        import('@/services/socketService').then(({ default: socketService }) => {
            socketService.connect()
            if (userId && sessionId) socketService.joinStudentSession(userId, sessionId)
            socketService.onAgentTerminate((data) => {
                console.error('[ProctorAgent] TEST TERMINATED BY AGENT:', data)
                setAgentTerminated(true)
                setTerminateReason(data?.reason || 'Test terminated by proctor.')
                onTerminate?.(data)
            })
            cleanup = () => socketService.removeListener('agent_terminate')
        })
        return () => cleanup()
    }, [enabled, userId, sessionId, onTerminate])

    return { agentTerminated, terminateReason }
}

export { MAX_VIOLATIONS }
