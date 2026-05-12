import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Brain, Clock, Target, CheckCircle, XCircle, Play, Eye, ArrowRight, AlertTriangle, RotateCcw, Camera, Maximize, Shield, Monitor, EyeOff, Smartphone, ArrowLeftRight } from 'lucide-react';
import SkillMCQTest from './SkillMCQTest';
import SkillCodingTest from './SkillCodingTest';
import SkillSQLTest from './SkillSQLTest';
import SkillAIInterview from './SkillAIInterview';
import SkillTestReport from './SkillTestReport';
import socketService from '../services/socketService';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function SkillTestPortal({ user }) {
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeAttempt, setActiveAttempt] = useState(null);
    const [attemptData, setAttemptData] = useState(null);
    const [currentView, setCurrentView] = useState('list'); // list, mcq, coding, sql, interview, report
    const [error, setError] = useState('');

    // Proctoring state
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [cameraStream, setCameraStream] = useState(null);
    const [cameraError, setCameraError] = useState('');
    const [showProctoringSetup, setShowProctoringSetup] = useState(false);
    const [pendingTestId, setPendingTestId] = useState(null);
    const [pendingResumeId, setPendingResumeId] = useState(null);
    const containerRef = useRef(null);
    const videoRef = useRef(null);

    // Proctoring stats
    const [proctoringStats, setProctoringStats] = useState({
        violationCount: 0,
        tabSwitchCount: 0,
        cameraBlocks: 0,
        phoneDetections: 0,
        fullscreenExits: 0,
        cameraActive: false
    });

    // Violation warning overlay
    const [violationWarning, setViolationWarning] = useState(null);
    const warningTimerRef = useRef(null);
    const canvasRef = useRef(null);
    const monitorIntervalRef = useRef(null);
    const logProctoringRef = useRef(null);

    const [modelLoaded, setModelLoaded] = useState(false);
    const phoneDetectionCooldown = useRef(0); // timestamp of last phone alert

    const [model, setModel] = useState(null);

    // Agent termination state
    const [agentTerminated, setAgentTerminated] = useState(false);
    const [agentTerminateReason, setAgentTerminateReason] = useState('');
    const terminatedRef = useRef(false);
    const MAX_VIOLATIONS = 10;

    // Multiple monitor detection
    const [multipleMonitors, setMultipleMonitors] = useState(false);
    const multiMonitorIntervalRef = useRef(null);

    useEffect(() => {
        loadTests();
        loadProctoringModel();
    }, []);

    // ── Finalize attempt as terminated on the backend ──
    const terminateAttempt = useCallback(async (reason) => {
        if (terminatedRef.current) return;
        terminatedRef.current = true;
        setAgentTerminated(true);
        setAgentTerminateReason(reason);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        if (activeAttempt) {
            try {
                await axios.post(`${API}/api/skill-tests/attempt/${activeAttempt}/terminate`, { reason });
            } catch (err) {
                console.error('Failed to terminate attempt on server:', err);
            }
        }
    }, [activeAttempt]);

    // ── Agent terminate listener — receives real-time kill signal from Proctor Agent ──
    useEffect(() => {
        if (!activeAttempt || !user?.id) return;
        socketService.connect();
        socketService.joinStudentSession(user.id, String(activeAttempt));

        const handleTerminate = (data) => {
            console.error('[ProctorAgent] SKILL TEST TERMINATED BY AGENT:', data);
            terminateAttempt(data?.reason || 'Your test has been terminated by the Proctoring Intelligence Agent due to integrity violations.');
        };
        socketService.onAgentTerminate(handleTerminate);
        return () => { socketService.removeListener('agent_terminate'); };
    }, [activeAttempt, user?.id, terminateAttempt]);

    const loadProctoringModel = async () => {
        try {
            // Wait for scripts loaded via index.html <script defer>
            const waitForCocoSsd = () => new Promise((resolve) => {
                if (window.cocoSsd) return resolve();
                // Check every 200ms for up to 30 seconds
                let elapsed = 0;
                const check = setInterval(() => {
                    elapsed += 200;
                    if (window.cocoSsd) { clearInterval(check); resolve(); }
                    else if (elapsed > 30000) { clearInterval(check); resolve(); } // timeout
                }, 200);
            });

            console.log('⏳ Waiting for TensorFlow.js & COCO-SSD scripts...');
            await waitForCocoSsd();

            if (!window.cocoSsd) {
                console.error('❌ COCO-SSD scripts failed to load from CDN');
                return;
            }

            console.log('📦 Scripts ready. Loading COCO-SSD model weights...');
            const m = await window.cocoSsd.load({ base: 'mobilenet_v2' }); // More accurate model
            setModel(m);
            setModelLoaded(true);
            console.log('✅ AI Proctoring Model loaded successfully!');

            // Warm-up detection
            try {
                const warmupCanvas = document.createElement('canvas');
                warmupCanvas.width = 64;
                warmupCanvas.height = 64;
                await m.detect(warmupCanvas);
                console.log('🔥 Model warmed up and ready for real-time detection');
            } catch (e) { }
        } catch (e) { console.error("Model load error:", e); }
    };


    // Cleanup camera on unmount
    useEffect(() => {
        return () => {
            if (cameraStream) {
                cameraStream.getTracks().forEach(t => t.stop());
            }
        };
    }, [cameraStream]);

    // Fullscreen change listener
    useEffect(() => {
        const handleFSChange = () => {
            const isFull = !!document.fullscreenElement;
            setIsFullscreen(isFull);
            if (!isFull && activeAttempt && currentView !== 'list' && currentView !== 'report') {
                logProctoringRef.current?.('fullscreen_exit', 'Student exited fullscreen mode', 'high');
            }
        };
        document.addEventListener('fullscreenchange', handleFSChange);
        return () => document.removeEventListener('fullscreenchange', handleFSChange);
    }, [activeAttempt, currentView]);

    const showViolationWarning = useCallback((title, message, severity) => {
        setViolationWarning({ title, message, severity });
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        warningTimerRef.current = setTimeout(() => setViolationWarning(null), 4000);
    }, []);

    const logProctoring = useCallback(async (eventType, details, severity = 'medium') => {
        if (!activeAttempt || attemptData?.proctoring_enabled === false || terminatedRef.current) return;
        try {
            await axios.post(`${API}/api/skill-tests/proctoring/log`, {
                attemptId: activeAttempt,
                testStage: currentView,
                eventType, details, severity
            });
            // Emit to Socket.IO for live monitoring
            socketService.emitProctoringViolation(
                user?.id, user?.name || user?.email || 'Student',
                eventType, severity, null
            );
            setProctoringStats(prev => {
                const next = {
                    ...prev,
                    violationCount: prev.violationCount + 1,
                    tabSwitchCount: eventType === 'tab_switch' ? prev.tabSwitchCount + 1 : prev.tabSwitchCount,
                    fullscreenExits: eventType === 'fullscreen_exit' ? prev.fullscreenExits + 1 : prev.fullscreenExits,
                    phoneDetections: eventType === 'phone_detected' ? prev.phoneDetections + 1 : prev.phoneDetections,
                    cameraBlocks: eventType === 'camera_blocked' ? prev.cameraBlocks + 1 : prev.cameraBlocks,
                };
                // Auto-terminate at MAX_VIOLATIONS
                if (next.violationCount >= MAX_VIOLATIONS && !terminatedRef.current) {
                    terminateAttempt(`Maximum proctoring violations reached (${next.violationCount}/${MAX_VIOLATIONS}). Your test has been automatically terminated.`);
                }
                return next;
            });
            const warningMessages = {
                'tab_switch': { title: '⚠️ Tab Switch Detected!', msg: 'Switching tabs is monitored. Return to your test immediately.' },
                'fullscreen_exit': { title: '⚠️ Fullscreen Exited!', msg: 'You must stay in fullscreen mode. Please re-enter fullscreen.' },
                'camera_blocked': { title: '📷 Camera Blocked!', msg: 'Your camera appears to be covered or blocked. Please uncover it.' },
                'phone_detected': { title: '📱 Suspicious Activity!', msg: 'Device or object detected near camera. Keep your area clear.' },
            };
            const wm = warningMessages[eventType] || { title: '⚠️ Violation!', msg: details };
            showViolationWarning(wm.title, wm.msg, severity);
        } catch { }
    }, [activeAttempt, currentView, attemptData, showViolationWarning, terminateAttempt]);

    useEffect(() => {
        logProctoringRef.current = logProctoring;
    }, [logProctoring]);

    // Block Copy/Paste/Right-click
    useEffect(() => {
        if (!activeAttempt || currentView === 'list' || currentView === 'report' || attemptData?.proctoring_enabled === false) return;
        const preventEvent = (e) => { e.preventDefault(); };
        window.addEventListener('copy', preventEvent);
        window.addEventListener('paste', preventEvent);
        window.addEventListener('cut', preventEvent);
        window.addEventListener('contextmenu', preventEvent);
        return () => {
            window.removeEventListener('copy', preventEvent);
            window.removeEventListener('paste', preventEvent);
            window.removeEventListener('cut', preventEvent);
            window.removeEventListener('contextmenu', preventEvent);
        };
    }, [activeAttempt, currentView, attemptData]);

    // Tab switch / visibility change detection
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden && activeAttempt && currentView !== 'list' && currentView !== 'report') {
                logProctoringRef.current?.('tab_switch', 'Student switched tabs or minimized window', 'high');
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [activeAttempt, currentView]);

    // Window blur detection (separate from visibilitychange – catches Alt+Tab, clicking outside)
    useEffect(() => {
        if (!activeAttempt || currentView === 'list' || currentView === 'report' || attemptData?.proctoring_enabled === false) return;
        const handleBlur = () => {
            logProctoringRef.current?.('window_blur', 'Window lost focus (possible Alt+Tab or clicking outside)', 'high');
        };
        window.addEventListener('blur', handleBlur);
        return () => window.removeEventListener('blur', handleBlur);
    }, [activeAttempt, currentView, attemptData]);

    // DevTools blocking
    useEffect(() => {
        if (!activeAttempt || currentView === 'list' || currentView === 'report' || attemptData?.proctoring_enabled === false) return;
        const blockDevTools = (e) => {
            if (
                e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) ||
                (e.ctrlKey && e.key.toUpperCase() === 'U') ||
                e.key === 'PrintScreen'
            ) {
                e.preventDefault();
                e.stopPropagation();
                logProctoringRef.current?.('devtools_attempt', `Blocked key: ${e.key}`, 'high');
            }
        };
        window.addEventListener('keydown', blockDevTools, true);
        return () => window.removeEventListener('keydown', blockDevTools, true);
    }, [activeAttempt, currentView, attemptData]);

    // Multiple monitor detection
    useEffect(() => {
        if (!activeAttempt || currentView === 'list' || currentView === 'report' || attemptData?.proctoring_enabled === false) return;
        const checkMonitors = async () => {
            let detected = false;
            // Method 1: screen.isExtended
            if (typeof screen !== 'undefined' && screen.isExtended) detected = true;
            // Method 2: dimension heuristics
            if (typeof screen !== 'undefined') {
                if (screen.width > 2560 || screen.availWidth > 2560) detected = true;
                if (screen.availLeft < 0 || screen.availTop < 0) detected = true;
                if (screen.width - screen.availWidth > 200) detected = true;
            }
            // Method 3: Screen Details API
            try {
                if (typeof window !== 'undefined' && 'getScreenDetails' in window) {
                    const details = await window.getScreenDetails();
                    if (details.screens && details.screens.length > 1) detected = true;
                }
            } catch {}
            if (detected && !multipleMonitors) {
                setMultipleMonitors(true);
                logProctoringRef.current?.('multiple_monitors', 'Multiple monitors detected', 'high');
            }
        };
        checkMonitors();
        multiMonitorIntervalRef.current = setInterval(checkMonitors, 5000);
        return () => { if (multiMonitorIntervalRef.current) clearInterval(multiMonitorIntervalRef.current); };
    }, [activeAttempt, currentView, attemptData, multipleMonitors]);

    // Fullscreen re-enforcement (re-request when student escapes)
    useEffect(() => {
        if (!activeAttempt || currentView === 'list' || currentView === 'report' || attemptData?.proctoring_enabled === false) return;
        const handleFSReinforce = () => {
            if (!document.fullscreenElement && !terminatedRef.current) {
                setTimeout(() => {
                    const target = containerRef.current || document.documentElement;
                    target.requestFullscreen().catch(() => {});
                }, 500);
            }
        };
        document.addEventListener('fullscreenchange', handleFSReinforce);
        return () => document.removeEventListener('fullscreenchange', handleFSReinforce);
    }, [activeAttempt, currentView, attemptData]);

    // Update camera active status
    useEffect(() => {
        setProctoringStats(prev => ({ ...prev, cameraActive: !!cameraStream }));
    }, [cameraStream]);

    // Camera monitoring - detect camera blocked, phones, or multiple people
    useEffect(() => {
        if (!cameraStream || !activeAttempt || currentView === 'list' || currentView === 'report') {
            if (monitorIntervalRef.current) {
                clearInterval(monitorIntervalRef.current);
                monitorIntervalRef.current = null;
            }
            return;
        }

        // Create hidden canvas for frame analysis
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        canvasRef.current = canvas;

        // Create a video element specifically for frame analysis
        const monitorVideo = document.createElement('video');
        monitorVideo.srcObject = cameraStream;
        monitorVideo.muted = true;
        monitorVideo.playsInline = true;
        monitorVideo.width = 640;
        monitorVideo.height = 480;
        monitorVideo.play().catch(e => console.warn("Video play error:", e));

        let darkFrameCount = 0;
        const DARK_THRESHOLD = 20;
        const DARK_FRAMES_TRIGGER = 3;
        const PHONE_COOLDOWN_MS = 8000; // 8 seconds between phone alerts

        monitorIntervalRef.current = setInterval(async () => {
            try {
                if (!monitorVideo || monitorVideo.paused || monitorVideo.ended || monitorVideo.readyState < 2) return;
                if (!ctx) return;

                // 1. Basic Brightness / Blocked Check
                try {
                    ctx.drawImage(monitorVideo, 0, 0, 640, 480);
                    const imageData = ctx.getImageData(0, 0, 640, 480);
                    const data = imageData.data;
                    let totalBrightness = 0;
                    for (let i = 0; i < data.length; i += 16) {
                        totalBrightness += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
                    }
                    const avgBrightness = totalBrightness / (data.length / 16);
                    if (avgBrightness < DARK_THRESHOLD) {
                        darkFrameCount++;
                        if (darkFrameCount === DARK_FRAMES_TRIGGER) {
                            logProctoringRef.current?.('camera_blocked', 'Camera appears to be covered', 'high');
                            darkFrameCount = 0;
                        }
                    } else {
                        darkFrameCount = 0;
                    }
                } catch (e) { return; }

                // 2. AI Model Detection (Phone / Person / Objects)
                if (model && monitorVideo.readyState >= 2) {
                    try {
                        const predictions = await model.detect(monitorVideo);

                        // Only log non-person detections
                        const nonPersonDetections = predictions.filter(p => p.class !== 'person');
                        if (nonPersonDetections.length > 0) {
                            console.log('🔍 AI:', nonPersonDetections.map(p => `${p.class}(${(p.score * 100).toFixed(0)}%)`).join(', '));
                        }

                        // Standardized Device Detection (Phone, Remote, Laptop group)
                        // Grouping these as requested by user to count as "Phone" violations
                        const deviceClasses = ['cell phone', 'remote', 'laptop', 'mouse', 'tablet'];
                        const deviceObj = predictions.find(p => deviceClasses.includes(p.class) && p.score >= 0.40);

                        if (deviceObj) {
                            const now = Date.now();
                            if (now - phoneDetectionCooldown.current > PHONE_COOLDOWN_MS) {
                                phoneDetectionCooldown.current = now;
                                console.warn(`🚨 SUSPICIOUS DEVICE: ${deviceObj.class} (${(deviceObj.score * 100).toFixed(0)}%)`);
                                // All these classes map to 'phone_detected' to increment the phone count in UI
                                logProctoringRef.current?.('phone_detected', `Suspicious activity: ${deviceObj.class} detected (${(deviceObj.score * 100).toFixed(0)}% confidence)`, 'high');
                            }
                        }

                        // Suspicious objects (books, keyboards outside of student's own)
                        const suspiciousObjects = predictions.filter(p =>
                            ['book', 'keyboard'].includes(p.class) && p.score > 0.45
                        );
                        if (suspiciousObjects.length > 0) {
                            console.warn('⚠️ Suspicious:', suspiciousObjects.map(o => `${o.class}(${(o.score * 100).toFixed(0)}%)`).join(', '));
                            const now = Date.now();
                            if (now - phoneDetectionCooldown.current > PHONE_COOLDOWN_MS) {
                                phoneDetectionCooldown.current = now;
                                logProctoringRef.current?.('phone_detected', `${suspiciousObjects[0].class} detected`, 'medium');
                            }
                        }

                        // Multiple people detection
                        const persons = predictions.filter(p => p.class === 'person' && p.score > 0.35);
                        if (persons.length > 1) {
                            logProctoringRef.current?.('phone_detected', `Multiple people detected (${persons.length} persons)`, 'high');
                        }
                    } catch (e) {
                        console.warn("Detection error:", e.message);
                    }
                }

            } catch (e) { console.error(e); }
        }, 500); // Check every 500ms for fast detection

        return () => {
            if (monitorIntervalRef.current) {
                clearInterval(monitorIntervalRef.current);
                monitorIntervalRef.current = null;
            }
            monitorVideo.pause();
            monitorVideo.srcObject = null;
        };
    }, [cameraStream, activeAttempt, currentView, model]);

    // Cleanup warning timer on unmount
    useEffect(() => {
        return () => {
            if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
            if (monitorIntervalRef.current) clearInterval(monitorIntervalRef.current);
        };
    }, []);

    const loadTests = async () => {
        try {
            setLoading(true);
            const { data } = await axios.get(`${API}/api/skill-tests/student/available`, {
                params: { studentId: user?.id || user?.email || 'student' }
            });
            setTests(data);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    // Start proctoring setup before test
    const initiateTest = (testId) => {
        const test = tests.find(t => t.id === testId);
        if (test && test.proctoring_enabled === false) {
            startTest(testId);
            return;
        }
        setPendingTestId(testId);
        setPendingResumeId(null);
        setShowProctoringSetup(true);
        setCameraError('');
    };

    const initiateResume = (attemptId) => {
        // Find if proctoring needed
        let proctoringEnabled = true;
        for (const t of tests) {
            const att = t.my_attempts?.find(a => a.id === attemptId);
            if (att) {
                if (t.proctoring_enabled === false) proctoringEnabled = false;
                break;
            }
        }

        if (!proctoringEnabled) {
            resumeTest(attemptId);
            return;
        }

        setPendingResumeId(attemptId);
        setPendingTestId(null);
        setShowProctoringSetup(true);
        setCameraError('');
    };

    // Enable camera — pick first local webcam to avoid Windows phone-camera picker
    const enableCamera = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const webcam = devices.find(d => d.kind === 'videoinput' && d.deviceId);
            const videoConstraints = webcam?.deviceId
                ? { deviceId: { exact: webcam.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
                : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };
            const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
            setCameraStream(stream);
            setCameraError('');
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            return true;
        } catch (err) {
            setCameraError('Camera access denied. Please allow camera access and try again.');
            return false;
        }
    };

    // Enter fullscreen
    const enterFullscreen = async () => {
        try {
            if (containerRef.current && !document.fullscreenElement) {
                await containerRef.current.requestFullscreen();
            }
            setIsFullscreen(true);
            return true;
        } catch (err) {
            return false;
        }
    };

    // Start test after proctoring setup
    const proceedAfterSetup = async () => {
        // Enter fullscreen
        await enterFullscreen();

        setShowProctoringSetup(false);

        if (pendingTestId) {
            await startTest(pendingTestId);
        } else if (pendingResumeId) {
            await resumeTest(pendingResumeId);
        }
        setPendingTestId(null);
        setPendingResumeId(null);
    };

    const startTest = async (testId) => {
        try {
            setError('');
            const { data } = await axios.post(`${API}/api/skill-tests/${testId}/start`, {
                studentId: user?.id || user?.email || 'student',
                studentName: user?.name || user?.username || 'Student'
            });
            setActiveAttempt(data.attemptId);
            socketService.emitSubmissionStarted({
                testId,
                studentId: user?.id,
                studentName: user?.name || user?.email,
                type: 'skill_test'
            });
            await loadAttemptData(data.attemptId);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        }
    };

    const resumeTest = async (attemptId) => {
        try {
            setError('');
            setActiveAttempt(attemptId);
            await loadAttemptData(attemptId);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        }
    };

    const loadAttemptData = async (attemptId) => {
        try {
            const { data } = await axios.get(`${API}/api/skill-tests/attempt/${attemptId}`);
            setAttemptData(data);
            if (data.overall_status === 'completed' || data.overall_status === 'failed') {
                setCurrentView('report');
            } else {
                setCurrentView(data.current_stage || 'mcq');
            }
        } catch (err) {
            setError(err.message);
        }
    };

    const viewReport = async (attemptId) => {
        setActiveAttempt(attemptId);
        await loadAttemptData(attemptId);
        setCurrentView('report');
    };

    const onStageComplete = async (stage, result) => {
        await loadAttemptData(activeAttempt);
        // Re-enter fullscreen after stage transition
        // Use a short delay to let the DOM update
        setTimeout(() => {
            if (!document.fullscreenElement) {
                const target = containerRef.current || document.documentElement;
                target.requestFullscreen().catch(() => {
                    // Fullscreen may fail if not triggered by user gesture
                    // The proctoring bar will show the "Re-enter Fullscreen" button
                    console.warn('Could not re-enter fullscreen after stage change');
                });
            }
        }, 200);
    };

    const goBack = () => {
        // Exit fullscreen
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
        }
        // Stop camera
        if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            setCameraStream(null);
        }
        setActiveAttempt(null);
        setAttemptData(null);
        setCurrentView('list');
        loadTests();
    };

    // Proctoring Setup Screen
    if (showProctoringSetup) {
        return (
            <div ref={containerRef} style={{
                minHeight: '100vh', background: '#0f172a', color: '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px'
            }}>
                <div style={{
                    maxWidth: '500px', width: '100%', background: '#1e293b', borderRadius: '20px',
                    padding: '40px', border: '1px solid #334155', textAlign: 'center'
                }}>
                    <div style={{
                        width: '64px', height: '64px', borderRadius: '16px', margin: '0 auto 20px',
                        background: 'rgba(139,92,246,0.15)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Shield size={32} color="#8b5cf6" />
                    </div>
                    <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 8px', color: '#f1f5f9' }}>
                        Proctoring Setup
                    </h2>
                    <p style={{ fontSize: '14px', color: '#94a3b8', margin: '0 0 28px' }}>
                        This test requires camera access and fullscreen mode for proctoring.
                    </p>

                    {/* Camera Preview */}
                    <div style={{
                        width: '240px', height: '180px', margin: '0 auto 20px', borderRadius: '12px',
                        overflow: 'hidden', border: '2px solid ' + (cameraStream ? '#22c55e' : '#475569'),
                        background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        {cameraStream ? (
                            <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                        ) : (
                            <Camera size={40} color="#475569" />
                        )}
                    </div>

                    {cameraError && (
                        <div style={{ fontSize: '12px', color: '#fca5a5', margin: '0 0 16px', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: '8px' }}>
                            {cameraError}
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                        {/* Enable Camera Button */}
                        <button onClick={enableCamera} style={{
                            padding: '12px 24px', borderRadius: '10px', cursor: 'pointer',
                            fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: '8px', width: '100%',
                            background: cameraStream ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
                            color: cameraStream ? '#34d399' : '#60a5fa',
                            border: '1px solid ' + (cameraStream ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.3)')
                        }}>
                            {cameraStream ? <><CheckCircle size={16} /> Camera Enabled</> : <><Camera size={16} /> Enable Camera</>}
                        </button>

                        {/* Checklist */}
                        <div style={{ textAlign: 'left', fontSize: '13px', padding: '12px 16px', background: '#0f172a', borderRadius: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: cameraStream ? '#34d399' : '#94a3b8' }}>
                                {cameraStream ? <CheckCircle size={14} /> : <XCircle size={14} />} Camera access
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#94a3b8' }}>
                                <Maximize size={14} /> Fullscreen will activate on start
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                                <Monitor size={14} /> Tab switches are monitored
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => { setShowProctoringSetup(false); setPendingTestId(null); setPendingResumeId(null); }} style={{
                            flex: 1, padding: '12px', background: '#334155', color: '#94a3b8', border: 'none',
                            borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '14px'
                        }}>Cancel</button>
                        <button onClick={proceedAfterSetup} disabled={!cameraStream} style={{
                            flex: 2, padding: '12px',
                            background: cameraStream ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)' : '#334155',
                            color: cameraStream ? 'white' : '#64748b',
                            border: 'none', borderRadius: '10px',
                            cursor: cameraStream ? 'pointer' : 'not-allowed',
                            fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: '8px',
                            boxShadow: cameraStream ? '0 2px 10px rgba(139,92,246,0.3)' : 'none'
                        }}>
                            <Play size={16} /> Start Assessment
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Active test view (fullscreen with camera pip)
    if (activeAttempt && attemptData) {
        const stageOrder = ['mcq', 'coding', 'sql', 'interview'];
        const currentStageIdx = stageOrder.indexOf(attemptData.current_stage);

        if (currentView === 'report') {
            return <SkillTestReport attemptId={activeAttempt} onBack={goBack} />;
        }

        return (
            <div ref={containerRef} style={{
                minHeight: '100vh', background: '#0f172a', color: '#f1f5f9',
                display: 'flex', overflow: 'hidden'
            }}>
                <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>

                {/* Left Sidebar - Camera & Proctoring */}
                {cameraStream && (
                    <div style={{
                        width: '260px', minWidth: '260px', background: '#0b1120',
                        borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column',
                        padding: '12px', gap: '10px', height: '100vh', position: 'sticky', top: 0
                    }}>
                        {/* Camera Feed */}
                        <div style={{
                            width: '100%', aspectRatio: '3/4', borderRadius: '12px', overflow: 'hidden',
                            border: '2px solid #8b5cf6', boxShadow: '0 4px 20px rgba(139,92,246,0.2)',
                            background: '#000', position: 'relative'
                        }}>
                            <video ref={el => { if (el && cameraStream) el.srcObject = cameraStream; }}
                                autoPlay muted playsInline
                                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                            <div style={{
                                position: 'absolute', top: '6px', left: '6px', background: 'rgba(239,68,68,0.9)',
                                borderRadius: '4px', padding: '2px 8px', fontSize: '10px', color: 'white',
                                fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px'
                            }}>
                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white', animation: 'blink 1s infinite' }} />
                                REC
                            </div>
                        </div>

                        {/* Proctoring Status Cards */}
                        <div style={{
                            background: '#1e293b', borderRadius: '10px', padding: '10px',
                            border: '1px solid #334155'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '8px' }}>
                                <Shield size={13} color="#8b5cf6" /> Proctoring
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <div style={{
                                    padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                                    background: modelLoaded ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)',
                                    color: modelLoaded ? '#22c55e' : '#eab308',
                                    border: `1px solid ${modelLoaded ? 'rgba(34,197,94,0.2)' : 'rgba(234,179,8,0.2)'}`,
                                    display: 'flex', alignItems: 'center', gap: '5px'
                                }}>
                                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: modelLoaded ? '#22c55e' : '#eab308', boxShadow: `0 0 6px ${modelLoaded ? '#22c55e' : '#eab308'}`, animation: modelLoaded ? 'none' : 'blink 1s infinite' }} />
                                    {modelLoaded ? '● AI Active' : '◌ AI Loading...'}
                                </div>
                                <div style={{
                                    padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                                    background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)',
                                    display: 'flex', alignItems: 'center', gap: '5px'
                                }}>
                                    <Camera size={10} /> Camera ON
                                </div>
                            </div>
                        </div>

                        {/* Violation Stats */}
                        <div style={{
                            background: '#1e293b', borderRadius: '10px', padding: '10px',
                            border: '1px solid #334155'
                        }}>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Monitoring
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                                    <span style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <ArrowLeftRight size={10} /> Tab Switches
                                    </span>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: proctoringStats.tabSwitchCount > 0 ? '#fbbf24' : '#64748b' }}>
                                        {proctoringStats.tabSwitchCount}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                                    <span style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Smartphone size={10} /> Phone
                                    </span>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: proctoringStats.phoneDetections > 0 ? '#fbbf24' : '#64748b' }}>
                                        {proctoringStats.phoneDetections}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                                    <span style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Maximize size={10} /> FS Exits
                                    </span>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: proctoringStats.fullscreenExits > 0 ? '#fbbf24' : '#64748b' }}>
                                        {proctoringStats.fullscreenExits}
                                    </span>
                                </div>
                                {proctoringStats.violationCount > 0 && (
                                    <div style={{
                                        marginTop: '4px', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                                        background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)',
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        justifyContent: 'center'
                                    }}>
                                        <AlertTriangle size={10} /> {proctoringStats.violationCount}/{MAX_VIOLATIONS} Violations
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Content Area */}
                <div style={{ flex: 1, overflow: 'auto', height: '100vh' }}>
                    <div style={{ padding: '12px 20px', paddingBottom: '80px' }}>
                        {/* Progress Header */}
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f1f5f9' }}>{attemptData.test_title || attemptData.title || 'Skill Test'}</h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {!isFullscreen && (
                                        <button onClick={enterFullscreen} style={{
                                            padding: '6px 12px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
                                            borderRadius: '8px', cursor: 'pointer', fontSize: '11px', color: '#fbbf24',
                                            fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                                        }}><Maximize size={13} /> Re-enter Fullscreen</button>
                                    )}
                                    <button onClick={goBack} style={{
                                        padding: '6px 14px', background: '#334155', border: '1px solid #475569',
                                        borderRadius: '8px', cursor: 'pointer', fontSize: '12px', color: '#94a3b8'
                                    }}>← Exit Test</button>
                                </div>
                            </div>

                            {/* Stage Progress Bar */}
                            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                                {stageOrder.map((stage, idx) => {
                                    const stageStatus = attemptData[`${stage}_status`] ||
                                        (stage === 'interview' ? attemptData.interview_status : 'pending');
                                    let bg = '#334155';
                                    if (stageStatus === 'completed' || stageStatus === 'passed') bg = '#22c55e';
                                    else if (stageStatus === 'failed') bg = '#ef4444';
                                    else if (stageStatus === 'in_progress') bg = '#f59e0b';
                                    else if (idx === currentStageIdx) bg = '#3b82f6';

                                    return (
                                        <div key={stage} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                                            <div style={{ width: '100%', height: '5px', borderRadius: '3px', background: bg }} />
                                            <span style={{
                                                fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
                                                color: idx === currentStageIdx ? '#60a5fa' : '#64748b'
                                            }}>
                                                {stage === 'mcq' ? 'MCQ' : stage.charAt(0).toUpperCase() + stage.slice(1)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Proctoring Stats Bar (only when no camera sidebar) */}
                            {attemptData.proctoring_enabled !== false && !cameraStream && (
                                <div style={{
                                    display: 'flex', gap: '10px', padding: '8px 14px', background: '#1e293b',
                                    borderRadius: '8px', border: '1px solid #334155', flexWrap: 'wrap', alignItems: 'center'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600 }}>
                                        <Shield size={13} color="#8b5cf6" />
                                        <span style={{ color: '#94a3b8' }}>Proctoring:</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                                        <div style={{ fontSize: '10px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px', background: '#0f172a', padding: '3px 7px', borderRadius: '6px', border: '1px solid #334155' }}>
                                            <ArrowLeftRight size={9} /> Tabs: <span style={{ color: proctoringStats.tabSwitchCount > 0 ? '#fbbf24' : '#94a3b8' }}>{proctoringStats.tabSwitchCount}</span>
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px', background: '#0f172a', padding: '3px 7px', borderRadius: '6px', border: '1px solid #334155' }}>
                                            <Smartphone size={9} /> Phone: <span style={{ color: proctoringStats.phoneDetections > 0 ? '#fbbf24' : '#94a3b8' }}>{proctoringStats.phoneDetections}</span>
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px', background: '#0f172a', padding: '3px 7px', borderRadius: '6px', border: '1px solid #334155' }}>
                                            <Maximize size={9} /> FS: <span style={{ color: proctoringStats.fullscreenExits > 0 ? '#fbbf24' : '#94a3b8' }}>{proctoringStats.fullscreenExits}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Stage Components */}
                        {
                            currentView === 'mcq' && (
                                <SkillMCQTest
                                    attemptId={activeAttempt}
                                    attemptData={attemptData}
                                    onComplete={(result) => onStageComplete('mcq', result)}
                                    onFailed={() => { loadAttemptData(activeAttempt); setCurrentView('report'); }}
                                />
                            )
                        }
                        {
                            currentView === 'coding' && (
                                <SkillCodingTest
                                    attemptId={activeAttempt}
                                    attemptData={attemptData}
                                    onComplete={(result) => onStageComplete('coding', result)}
                                    onFailed={() => { loadAttemptData(activeAttempt); setCurrentView('report'); }}
                                />
                            )
                        }
                        {
                            currentView === 'sql' && (
                                <SkillSQLTest
                                    attemptId={activeAttempt}
                                    attemptData={attemptData}
                                    onComplete={(result) => onStageComplete('sql', result)}
                                    onFailed={() => { loadAttemptData(activeAttempt); setCurrentView('report'); }}
                                />
                            )
                        }
                        {
                            currentView === 'interview' && (
                                <SkillAIInterview
                                    attemptId={activeAttempt}
                                    attemptData={attemptData}
                                    onComplete={(result) => onStageComplete('interview', result)}
                                    onFailed={() => { loadAttemptData(activeAttempt); setCurrentView('report'); }}
                                />
                            )
                        }
                    </div>
                </div>

                {/* Violation Warning Overlay */}
                {violationWarning && (
                    <div style={{
                        position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
                        zIndex: 10000, minWidth: '320px', maxWidth: '400px',
                        background: violationWarning.severity === 'high' ? '#ef4444' : '#f59e0b',
                        color: 'white', padding: '20px', borderRadius: '16px',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                        animation: 'slideIn 0.3s ease-out',
                        display: 'flex', gap: '16px', alignItems: 'flex-start'
                    }}>
                        <style>{`
                            @keyframes slideIn { from { transform: translate(-50%, -40px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
                        `}</style>
                        <AlertTriangle size={24} style={{ marginTop: '2px' }} />
                        <div>
                            <div style={{ fontWeight: 800, fontSize: '18px', marginBottom: '4px' }}>{violationWarning.title}</div>
                            <div style={{ fontSize: '14px', opacity: 0.9, lineHeight: '1.4' }}>{violationWarning.message}</div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Test List View
    return (
        <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
            {/* AGENT TERMINATION OVERLAY */}
            {agentTerminated && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0, 0, 0, 0.95)', zIndex: 10010,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '2rem'
                }}>
                    <div style={{
                        background: 'linear-gradient(145deg, #1e293b, #0f172a)',
                        border: '2px solid #dc2626',
                        borderRadius: 20, padding: '3rem', maxWidth: 520, width: '100%',
                        textAlign: 'center', boxShadow: '0 0 60px rgba(220, 38, 38, 0.3)'
                    }}>
                        <div style={{
                            width: 72, height: 72, borderRadius: '50%',
                            background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 1.5rem'
                        }}>
                            <Shield size={36} color="#fff" />
                        </div>
                        <h2 style={{ color: '#ef4444', margin: '0 0 0.5rem', fontSize: '1.5rem' }}>
                            Test Terminated
                        </h2>
                        <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
                            {agentTerminateReason}
                        </p>
                        <div style={{
                            background: '#dc262622', border: '1px solid #dc262644',
                            borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.5rem',
                            fontSize: '0.8rem', color: '#fca5a5'
                        }}>
                            This action was taken by the Proctoring Intelligence Agent. Your exam session
                            has been recorded and flagged for review. Contact your administrator for more information.
                        </div>
                        <button
                            onClick={() => { setAgentTerminated(false); terminatedRef.current = false; setCurrentView('list'); setActiveAttempt(null); setAttemptData(null); loadTests(); }}
                            style={{
                                padding: '10px 28px', borderRadius: 10, border: '1px solid #334155',
                                background: '#1e293b', color: '#e2e8f0', fontSize: '0.9rem',
                                fontWeight: 600, cursor: 'pointer'
                            }}
                        >
                            Return to Tests
                        </button>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{
                    width: '42px', height: '42px', borderRadius: '12px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)'
                }}>
                    <Brain size={22} color="white" />
                </div>
                <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#f1f5f9' }}>Skill Assessments</h2>
            </div>

            {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#fca5a5', fontSize: '13px' }}>
                    <AlertTriangle size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                    {error}
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading available tests...</div>
            ) : tests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                    <Brain size={48} style={{ marginBottom: '12px', opacity: 0.5 }} />
                    <p style={{ fontSize: '16px', color: '#e2e8f0' }}>No skill tests available yet</p>
                    <p style={{ fontSize: '13px' }}>Tests will appear here when your admin creates them</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {tests.map(test => {
                        const latestAttempt = test.my_attempts?.[0];
                        const hasCompleted = test.my_attempts?.some(a => a.overall_status === 'completed');
                        const hasInProgress = test.my_attempts?.some(a => a.overall_status === 'in_progress');
                        const inProgressAttempt = test.my_attempts?.find(a => a.overall_status === 'in_progress');

                        return (
                            <div key={test.id} style={{
                                background: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
                                padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                transition: 'box-shadow 0.2s',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 700, color: '#f1f5f9' }}>{test.title}</h3>
                                        {test.description && <p style={{ margin: '0 0 10px', color: '#94a3b8', fontSize: '13px' }}>{test.description}</p>}

                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
                                            {(test.skills && Array.isArray(test.skills) ? test.skills : []).map(s => (
                                                <span key={s} style={{ padding: '2px 8px', background: 'rgba(139,92,246,0.15)', color: '#a78bfa', borderRadius: '12px', fontSize: '11px', border: '1px solid rgba(139,92,246,0.25)' }}>{s}</span>
                                            ))}
                                        </div>

                                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#94a3b8', flexWrap: 'wrap' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Target size={13} /> MCQ: {test.mcq_count} | Coding: {test.coding_count} | SQL: {test.sql_count} | Interview: {test.interview_count}
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={13} /> {test.mcq_duration_minutes}min MCQ
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <RotateCcw size={13} /> {test.attempts_used || 0}/{test.attempt_limit} attempts
                                            </span>
                                        </div>

                                        {/* Previous Attempts */}
                                        {test.my_attempts && test.my_attempts.length > 0 && (
                                            <div style={{ marginTop: '10px', padding: '8px 12px', background: '#0f172a', borderRadius: '8px' }}>
                                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>Previous Attempts:</span>
                                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                                                    {test.my_attempts.map(a => (
                                                        <button key={a.id} onClick={() => {
                                                            if (a.overall_status === 'in_progress') initiateResume(a.id);
                                                            else viewReport(a.id);
                                                        }} style={{
                                                            padding: '4px 10px', borderRadius: '16px', fontSize: '11px', cursor: 'pointer',
                                                            border: 'none', fontWeight: 600,
                                                            background: a.overall_status === 'completed' ? 'rgba(16,185,129,0.15)' : a.overall_status === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                                            color: a.overall_status === 'completed' ? '#34d399' : a.overall_status === 'failed' ? '#fca5a5' : '#fbbf24'
                                                        }}>
                                                            #{a.attempt_number}: {a.overall_status === 'in_progress' ? `In Progress (${a.current_stage})` : a.overall_status}
                                                            {a.overall_status !== 'in_progress' && ` - MCQ: ${Math.round(a.mcq_score)}%`}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginLeft: '16px' }}>
                                        {hasInProgress && (
                                            <button onClick={() => initiateResume(inProgressAttempt.id)} style={{
                                                padding: '10px 20px', background: '#f59e0b', color: 'white',
                                                border: 'none', borderRadius: '8px', cursor: 'pointer',
                                                fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                <Play size={16} /> Resume
                                            </button>
                                        )}
                                        {test.can_attempt && (
                                            <button onClick={() => initiateTest(test.id)} style={{
                                                padding: '10px 20px', background: '#8b5cf6', color: 'white',
                                                border: 'none', borderRadius: '8px', cursor: 'pointer',
                                                fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                <ArrowRight size={16} /> {test.attempts_used > 0 ? 'Retry' : 'Start Test'}
                                            </button>
                                        )}
                                        {!test.can_attempt && !hasInProgress && (
                                            <span style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>
                                                {hasCompleted ? '✓ Completed' : 'No attempts left'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
