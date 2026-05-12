import { Video, Mic, AlertTriangle, Target, Shield } from 'lucide-react'
import { MAX_VIOLATIONS } from './constants'

export default function TestSidebar({ proctoring, mode, videoRef, videoEnabled, audioEnabled,
    tabSwitches, maxTabSwitches, cameraBlockedCount, phoneDetectionCount,
    faceMissingCount, multipleMonitorCount, totalViolations,
    sectionQuestions, currentQuestionIndex, setCurrentQuestionIndex, answers }) {

    const isAI = mode === 'ai_proctored'
    const isEnhanced = mode === 'enhanced' || isAI

    return (
        <div style={{ width: '300px', background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(30,41,59,0.9) 100%)', borderRight: '1px solid rgba(139,92,246,0.15)', display: 'flex', flexDirection: 'column', backdropFilter: 'blur(12px)' }}>
            <div style={{ flex: 1, padding: '1.25rem', overflowY: 'auto' }}>
                {isEnhanced && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.1))', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#fca5a5', fontWeight: 600, fontSize: '0.8rem', marginBottom: '1rem', letterSpacing: '0.5px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
                            {isAI ? 'AI-PROCTORED MODE' : 'ENHANCED MODE'}
                        </div>

                        {isAI && proctoring.enableVideoAudio && (
                            <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(139,92,246,0.3)', background: '#000', marginBottom: '1rem', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                                <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', display: 'block', transform: 'scaleX(-1)', aspectRatio: '4/3', objectFit: 'cover' }} />
                                <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 4 }}>
                                    <div style={{ padding: 5, borderRadius: '50%', background: videoEnabled ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)' }}><Video size={10} color="white" /></div>
                                    <div style={{ padding: 5, borderRadius: '50%', background: audioEnabled ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)' }}><Mic size={10} color="white" /></div>
                                </div>
                                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: 'rgba(0,0,0,0.7)' }}>
                                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />
                                    <span style={{ fontSize: '0.6rem', color: 'white', fontWeight: 600 }}>REC</span>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.8rem', background: 'rgba(30,41,59,0.4)', padding: '1rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                            <StatRow label="Tab Switches" value={`${tabSwitches}/${maxTabSwitches}`} warn={tabSwitches > 0} />
                            {isAI && <StatRow label="Cam Blocks" value={cameraBlockedCount} warn={cameraBlockedCount > 0} />}
                            {isAI && <StatRow label="Phone Detected" value={phoneDetectionCount} warn={phoneDetectionCount > 0} />}
                            {isAI && <StatRow label="Face Missing" value={faceMissingCount} warn={faceMissingCount > 0} />}
                            {multipleMonitorCount > 0 && <StatRow label="Multi-Monitor" value={multipleMonitorCount} warn />}
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
                                {isAI && proctoring.enableVideoAudio && <li>Keep camera and microphone on.</li>}
                                {proctoring.enforceFullscreen && <li>Do not exit fullscreen mode.</li>}
                                {isAI && proctoring.detectCameraBlocking && <li>Ensure your face is always visible.</li>}
                                {isAI && proctoring.detectPhoneUsage && <li>No mobile phones allowed.</li>}
                            </ul>
                        </div>
                    </div>
                )}

                <h3 style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Target size={16} /> Question Palette
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                    {sectionQuestions.map((q, i) => (
                        <button key={i} onClick={() => setCurrentQuestionIndex(i)} style={{
                            width: 36, height: 36, borderRadius: 8,
                            border: currentQuestionIndex === i ? '2px solid #3b82f6' : '1px solid rgba(139,92,246,0.3)',
                            background: answers[q.id] ? 'linear-gradient(135deg, #10b981, #06b6d4)' : (currentQuestionIndex === i ? 'rgba(59,130,246,0.3)' : 'transparent'),
                            color: 'white', cursor: 'pointer', fontSize: '0.85rem'
                        }}>{i + 1}</button>
                    ))}
                </div>
            </div>
        </div>
    )
}

function StatRow({ label, value, warn }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontWeight: 500 }}>
            <span>{label}:</span>
            <span style={{ color: warn ? '#ef4444' : '#10b981', fontWeight: 700 }}>{value}</span>
        </div>
    )
}
