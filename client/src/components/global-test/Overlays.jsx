import { Award, XCircle, Layers, Shield, Video, AlertTriangle, VideoOff } from 'lucide-react'

const anim = `@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes scaleIn{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}`

export function ResultOverlay({ result, onClose, onComplete }) {
    const ss = result.sectionScores || {}
    const pass = result.status === 'passed'
    const gc = pass ? '#10b981' : '#ef4444'
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(135deg,#0f172a,#1e293b)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', overflow: 'auto', animation: 'fadeIn .3s' }}>
            <style>{anim}</style>
            <div style={{ background: 'rgba(30,41,59,0.98)', borderRadius: 24, border: `2px solid ${gc}66`, maxWidth: 800, width: '100%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: `0 25px 50px -12px ${gc}40`, animation: 'scaleIn .4s' }}>
                <div style={{ padding: '2rem', background: `linear-gradient(135deg,${gc}22,${gc}11)`, borderBottom: `1px solid ${gc}33`, textAlign: 'center' }}>
                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: `linear-gradient(135deg,${gc},${pass ? '#06b6d4' : '#f97316'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', boxShadow: `0 8px 24px ${gc}66`, animation: pass ? 'pulse 2s infinite' : 'none' }}>
                        {pass ? <Award size={40} color="white" /> : <XCircle size={40} color="white" />}
                    </div>
                    <h2 style={{ margin: '0 0 .5rem', color: 'white', fontSize: '1.75rem', fontWeight: 800 }}>{pass ? '🎉 Congratulations!' : 'Test Completed'}</h2>
                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)' }}>{pass ? 'You passed!' : 'Keep practicing.'}</p>
                </div>
                <div style={{ padding: '2rem', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <div style={{ padding: '1.5rem 2.5rem', background: `${gc}22`, borderRadius: 16, border: `2px solid ${gc}66`, textAlign: 'center', minWidth: 180 }}>
                            <div style={{ fontSize: '3.5rem', fontWeight: 900, color: gc }}>{result.score ?? result.overallPercentage}%</div>
                            <div style={{ fontSize: '.9rem', color: 'rgba(255,255,255,0.6)', marginTop: '.5rem', textTransform: 'uppercase', letterSpacing: 2, fontWeight: 600 }}>Overall Score</div>
                        </div>
                        <div style={{ padding: '1.5rem 2rem', background: 'rgba(139,92,246,0.1)', borderRadius: 16, border: '1px solid rgba(139,92,246,0.3)', textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#a78bfa' }}>{result.correctCount || 0}/{result.totalQuestions || 0}</div>
                            <div style={{ fontSize: '.85rem', color: 'rgba(255,255,255,0.5)', marginTop: '.25rem' }}>Correct Answers</div>
                        </div>
                    </div>
                    <h3 style={{ margin: '0 0 1rem', color: 'white', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '.5rem' }}><Layers size={18} color="#8b5cf6" /> Section Performance</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: '.75rem' }}>
                        {Object.entries(ss).map(([sec, score]) => (
                            <div key={sec} style={{ padding: '1rem', background: 'rgba(30,41,59,0.8)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444' }}>{score}%</div>
                                <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize', marginTop: '.25rem' }}>{sec}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{ padding: '1.25rem 2rem', borderTop: '1px solid rgba(139,92,246,0.2)', display: 'flex', justifyContent: 'center', background: 'rgba(15,23,42,0.5)' }}>
                    <button type="button" onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); onClose(); onComplete?.(result) }}
                        style={{ padding: '.85rem 2.5rem', background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', border: 'none', borderRadius: 12, color: 'white', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(139,92,246,0.4)' }}>
                        Close & View Results
                    </button>
                </div>
            </div>
        </div>
    )
}

export function SubmittingOverlay() {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.95)', zIndex: 100000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>
            <style>{anim}</style>
            <div style={{ width: 80, height: 80, borderRadius: '50%', border: '4px solid rgba(139,92,246,0.2)', borderTopColor: '#8b5cf6', animation: 'spin 1s linear infinite' }} />
            <h2 style={{ margin: 0, color: 'white', fontSize: '1.5rem', fontWeight: 700 }}>Submitting Your Test...</h2>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)' }}>Please wait while we evaluate your answers</p>
        </div>
    )
}

export function CameraSetupOverlay({ proctoring, cameraAccessDenied, onAllow, onCancel }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.98)', zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e293b,#0f172a)', borderRadius: 20, padding: '3rem', maxWidth: 500, width: '100%', border: '1px solid rgba(139,92,246,0.3)', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}><Video size={40} color="#8b5cf6" /></div>
                    <h2 style={{ margin: 0, color: 'white', fontSize: '1.75rem', fontWeight: 700, marginBottom: '.75rem' }}>Camera Access Required</h2>
                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>This is a proctored test. You must allow camera and microphone access.</p>
                </div>
                <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, padding: '1rem', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem' }}>
                        <Shield size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ fontSize: '.9rem', color: '#fbbf24', lineHeight: 1.5 }}>
                            <strong>Proctoring features enabled:</strong>
                            <ul style={{ margin: '.5rem 0 0', paddingLeft: '1.25rem' }}>
                                {proctoring.enableVideoAudio && <li>Camera & Audio monitoring</li>}
                                {proctoring.detectCameraBlocking && <li>Camera obstruction detection</li>}
                                {proctoring.detectPhoneUsage && <li>Phone usage detection</li>}
                                {proctoring.disableCopyPaste && <li>Copy/Paste disabled</li>}
                            </ul>
                        </div>
                    </div>
                </div>
                {cameraAccessDenied && (
                    <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 12, padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                        <AlertTriangle size={20} color="#ef4444" />
                        <div style={{ color: '#fca5a5', fontSize: '.9rem' }}>Camera access denied. Please allow in browser settings.</div>
                    </div>
                )}
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={onCancel} style={{ flex: 1, padding: '1rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={onAllow} style={{ flex: 2, padding: '1rem', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#8b5cf6,#6366f1)', color: 'white', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', boxShadow: '0 4px 15px rgba(139,92,246,0.4)' }}>
                        <Video size={20} /> Allow Camera & Start Test
                    </button>
                </div>
            </div>
        </div>
    )
}

export function TerminationOverlay({ reason }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.98)', zIndex: 100002, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', maxWidth: 500, padding: '2rem' }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#ef4444,#dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', boxShadow: '0 8px 24px rgba(239,68,68,0.4)' }}>
                    <Shield size={40} color="white" />
                </div>
                <h2 style={{ color: '#ef4444', fontSize: '1.75rem', fontWeight: 800, margin: '0 0 1rem' }}>Test Terminated</h2>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', lineHeight: 1.6 }}>{reason}</p>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '.85rem', marginTop: '1.5rem' }}>Your answers have been submitted. Redirecting...</p>
            </div>
        </div>
    )
}

export function CameraBlockedOverlay({ count }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(239,68,68,0.95)', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <style>{anim}</style>
            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: '3rem', textAlign: 'center', maxWidth: 500 }}>
                <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', animation: 'pulse 1.5s infinite' }}>
                    <VideoOff size={50} color="white" />
                </div>
                <h2 style={{ margin: 0, color: 'white', fontSize: '2rem', fontWeight: 700, marginBottom: '1rem' }}>Camera Blocked!</h2>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.9)', fontSize: '1.1rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                    Your camera appears to be covered. Please uncover your camera to continue.
                </p>
                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem' }}>
                    <AlertTriangle size={20} color="white" />
                    <span style={{ color: 'white', fontWeight: 600 }}>Violations logged: {count}</span>
                </div>
            </div>
        </div>
    )
}

export function WarningBanner({ message }) {
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, padding: '.75rem 2rem', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#1f2937', textAlign: 'center', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.75rem', boxShadow: '0 4px 20px rgba(245,158,11,0.4)', animation: 'slideDown .3s' }}>
            <style>{`@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}`}</style>
            <AlertTriangle size={20} />
            <span style={{ fontWeight: 600 }}>{message}</span>
        </div>
    )
}
