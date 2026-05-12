import React from 'react';

/**
 * High-Fidelity Humanoid Robot Interviewer
 * FIXED: Animations nested properly to prevent layout breaking.
 */
export default function AvatarInterviewer({ state = 'idle', size = 300 }) {
    // Reference Colors
    const colors = {
        white: '#F8FAFC',    // Main Body
        silver: '#CBD5E1',   // Shading/Secondary
        dark: '#1E293B',     // Joints/Screen Background
        blueWait: '#0EA5E9', // Cyan Accents (Idle)
        blueActive: '#38BDF8',
        green: '#4ADE80',    // Listening
        pink: '#F472B6',     // Thinking
        darkScreen: '#0F172A'
    };

    // Determine current accent color
    const getAccent = () => {
        if (state === 'listening') return colors.green;
        if (state === 'thinking') return colors.pink;
        if (state === 'speaking') return colors.blueActive;
        return colors.blueWait;
    };
    const accent = getAccent();

    return (
        <div className="avatar-container" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            filter: 'drop-shadow(0 8px 24px rgba(14, 165, 233, 0.15))'
        }}>
            <svg width={size} height={size * 1.2} viewBox="0 0 400 500" style={{ overflow: 'visible' }}>
                <defs>
                    <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FFFFFF" />
                        <stop offset="100%" stopColor="#E2E8F0" />
                    </linearGradient>
                    <radialGradient id="screenGrad" cx="50%" cy="40%" r="80%">
                        <stop offset="0%" stopColor="#334155" />
                        <stop offset="100%" stopColor="#020617" />
                    </radialGradient>
                    <filter id="blueGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* 
                   =============================================
                   BODY
                   =============================================
                */}
                {/* 
                   Wrap in a static group for positioning (200, 360).
                   Animations applied to INNER group to avoid overwriting the translate.
                */}
                <g transform="translate(200, 360)">
                    <g>
                        {/* Static Body Parts */}
                        <path d="M-60 -20 Q-70 100 0 110 Q70 100 60 -20 L40 -40 Q0 -30 -40 -40 Z" fill="url(#bodyGrad)" stroke={colors.silver} strokeWidth="2" />

                        {/* Chest Glowing Lines */}
                        <path d="M-20 0 L-20 60 M0 10 L0 70 M20 0 L20 60" stroke={accent} strokeWidth="4" strokeLinecap="round" opacity="0.8" filter="url(#blueGlow)">
                            {state === 'speaking' && <animate attributeName="opacity" values="0.5;1;0.5" dur="0.5s" repeatCount="indefinite" />}
                        </path>

                        {/* Neck (Fixed to Body) */}
                        <g transform="translate(0, -35)">
                            <rect x="-15" y="-15" width="30" height="30" rx="4" fill={colors.dark} />
                            <rect x="-15" y="-10" width="30" height="4" fill={colors.silver} />
                            <rect x="-15" y="0" width="30" height="4" fill={colors.silver} />
                        </g>
                    </g>
                </g>

                {/* 
                   =============================================
                   RIGHT ARM
                   =============================================
                */}
                <g transform="translate(280.5, 340)">
                    {/* Shoulder Joint */}
                    <circle cx="0" cy="0" r="22" fill="#E2E8F0" stroke={colors.silver} />
                    <circle cx="0" cy="0" r="10" fill={colors.dark} />

                    {/* Animated Arm Container */}
                    <g>
                        {/* Animations */}
                        {state === 'idle' && (
                            <animateTransform attributeName="transform" type="rotate" values="-5; 5; -5" dur="3s" repeatCount="indefinite" />
                        )}
                        {state === 'speaking' && (
                            <animateTransform attributeName="transform" type="rotate" values="0; -15; 0; -10; 0" dur="2s" repeatCount="indefinite" />
                        )}

                        {/* Arm Graphics */}
                        <rect x="-12" y="0" width="24" height="60" rx="10" fill="url(#bodyGrad)" />
                        <rect x="-12" y="25" width="24" height="5" fill={colors.dark} opacity="0.5" />

                        {/* Forearm */}
                        <g transform="translate(0, 60)">
                            <circle cx="0" cy="0" r="14" fill={colors.silver} />
                            <g transform="rotate(-30)">
                                <rect x="-10" y="0" width="20" height="50" rx="8" fill="url(#bodyGrad)" />
                                <g transform="translate(0, 55)">
                                    <path d="M-12 -5 Q0 15 12 -5 Z" fill="#E2E8F0" />
                                    <rect x="-14" y="0" width="6" height="15" rx="3" fill="#E2E8F0" transform="rotate(-15)" />
                                    <rect x="-5" y="5" width="6" height="16" rx="3" fill="#E2E8F0" />
                                    <rect x="5" y="5" width="6" height="16" rx="3" fill="#E2E8F0" />
                                    <rect x="14" y="0" width="6" height="15" rx="3" fill="#E2E8F0" transform="rotate(15)" />
                                </g>
                            </g>
                        </g>
                    </g>
                </g>

                {/* 
                   =============================================
                   LEFT ARM
                   =============================================
                */}
                <g transform="translate(119.5, 340) scale(-1, 1)">
                    <circle cx="0" cy="0" r="22" fill="#E2E8F0" stroke={colors.silver} />
                    <circle cx="0" cy="0" r="10" fill={colors.dark} />

                    <g>
                        {/* Idle Waving (Opposite Phase) */}
                        {state === 'idle' && (
                            <animateTransform attributeName="transform" type="rotate" values="5; -5; 5" dur="3s" repeatCount="indefinite" />
                        )}
                        {state === 'speaking' && (
                            <animateTransform attributeName="transform" type="rotate" values="0; 10; 0; 5; 0" dur="2.5s" repeatCount="indefinite" delay="0.5s" />
                        )}

                        <rect x="-12" y="0" width="24" height="60" rx="10" fill="url(#bodyGrad)" />
                        <rect x="-12" y="25" width="24" height="5" fill={colors.dark} opacity="0.5" />
                        <g transform="translate(0, 60)">
                            <circle cx="0" cy="0" r="14" fill={colors.silver} />
                            <g transform="rotate(-30)">
                                <rect x="-10" y="0" width="20" height="50" rx="8" fill="url(#bodyGrad)" />
                                <g transform="translate(0, 55)">
                                    <path d="M-12 -5 Q0 15 12 -5 Z" fill="#E2E8F0" />
                                    <rect x="-5" y="5" width="10" height="12" rx="3" fill="#E2E8F0" />
                                </g>
                            </g>
                        </g>
                    </g>
                </g>

                {/* 
                   =============================================
                   HEAD
                   =============================================
                */}
                {/* 
                   CRITICAL FIX: Head positioning is separate from animation.
                   Animations are applied to the inner group.
                */}
                <g transform="translate(200, 240)">
                    <g>
                        {/* Head Animations (Rotations Only) */}
                        {state === 'listening' && (
                            <animateTransform attributeName="transform" type="rotate" values="0; 5; 0; -2; 0" dur="4s" repeatCount="indefinite" />
                        )}
                        {state === 'thinking' && (
                            <animateTransform attributeName="transform" type="rotate" values="0; -15; -15" dur="1s" fill="freeze" />
                        )}
                        {/* Subtle idle bob */}
                        {state === 'speaking' && (
                            <animateTransform attributeName="transform" type="translate" values="0 0; 0 2; 0 0" dur="0.2s" repeatCount="indefinite" additive="sum" />
                        )}

                        {/* Head Graphics */}
                        <path d="M-80 0 C-80 -70 -50 -90 0 -90 C50 -90 80 -70 80 0 C80 60 50 80 0 80 C-50 80 -80 60 -80 0 Z" fill="url(#bodyGrad)" stroke="#CBD5E1" strokeWidth="2" />
                        <rect x="-60" y="-40" width="120" height="90" rx="25" fill="url(#screenGrad)" stroke="#334155" strokeWidth="2" />

                        {/* Antenna */}
                        <line x1="50" y1="-75" x2="70" y2="-100" stroke={colors.silver} strokeWidth="4" strokeLinecap="round" />
                        <circle cx="70" cy="-100" r="6" fill={accent} filter="url(#blueGlow)">
                            <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
                        </circle>

                        {/* Ears */}
                        <g>
                            <path d="M-82 -10 L-88 -10 L-88 30 L-82 30 Z" fill={colors.silver} />
                            <rect x="-92" y="-15" width="14" height="50" rx="4" fill={colors.white} stroke={colors.silver} />
                            <circle cx="-85" cy="10" r="12" fill={colors.dark} />
                            <circle cx="-85" cy="10" r="6" fill={accent} opacity="0.7" />
                        </g>
                        <g>
                            <path d="M82 -10 L88 -10 L88 30 L82 30 Z" fill={colors.silver} />
                            <rect x="78" y="-15" width="14" height="50" rx="4" fill={colors.white} stroke={colors.silver} />
                            <circle cx="85" cy="10" r="12" fill={colors.dark} />
                            <circle cx="85" cy="10" r="6" fill={accent} opacity="0.7" />
                        </g>

                        {/* Face Expressions */}
                        <g transform="translate(0, 5)">
                            <g transform="translate(-25, -5)">
                                <ellipse cx="0" cy="0" rx="16" ry="18" fill="url(#screenGrad)" stroke={accent} strokeWidth="3" filter="url(#blueGlow)" />
                                <circle cx="4" cy="-4" r="5" fill="white" opacity="0.8" />
                                {state === 'idle' && <animateTransform attributeName="transform" type="scale" values="1 1; 1 0.1; 1 1" keyTimes="0; 0.45; 0.5; 1" dur="4s" repeatCount="indefinite" />}
                            </g>
                            <g transform="translate(25, -5)">
                                <ellipse cx="0" cy="0" rx="16" ry="18" fill="url(#screenGrad)" stroke={accent} strokeWidth="3" filter="url(#blueGlow)" />
                                <circle cx="4" cy="-4" r="5" fill="white" opacity="0.8" />
                                {state === 'idle' && <animateTransform attributeName="transform" type="scale" values="1 1; 1 0.1; 1 1" keyTimes="0; 0.45; 0.5; 1" dur="4s" repeatCount="indefinite" />}
                            </g>
                            <g transform="translate(0, 30)">
                                {state === 'speaking' ? (
                                    <path d="M-10 0 Q0 10 10 0" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round">
                                        <animate attributeName="d" values="M-10 0 Q0 15 10 0; M-10 0 Q0 5 10 0; M-10 0 Q0 15 10 0" dur="0.3s" repeatCount="indefinite" />
                                    </path>
                                ) : (
                                    <path d="M-8 0 Q0 5 8 0" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" opacity="0.8" />
                                )}
                            </g>
                        </g>
                    </g>
                </g>

            </svg>

            {/* Status Badge */}
            <div style={{
                marginTop: '-30px',
                padding: '8px 20px',
                background: state === 'speaking' ? 'rgba(56, 189, 248, 0.1)' : 'rgba(30, 41, 59, 0.8)',
                backdropFilter: 'blur(4px)',
                borderRadius: '24px',
                border: `1px solid ${accent}40`,
                display: 'flex', alignItems: 'center', gap: '8px',
                zIndex: 10
            }}>
                <span style={{
                    display: 'block', width: '8px', height: '8px', borderRadius: '50%',
                    backgroundColor: accent,
                    boxShadow: `0 0 10px ${accent}`,
                    animation: state === 'speaking' ? 'pulse 1s infinite' : 'none'
                }} />
                <span style={{
                    color: 'white', fontSize: '13px', fontWeight: 600, letterSpacing: '0.5px',
                    textTransform: 'uppercase'
                }}>
                    {state === 'speaking' ? 'AI Interviewer' : state === 'listening' ? 'Listening...' : state === 'thinking' ? 'Thinking...' : 'Ready'}
                </span>
            </div>

            <style>
                {`
                    @keyframes pulse { 0% { opacity: 0.5; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } 100% { opacity: 0.5; transform: scale(0.8); } }
                `}
            </style>
        </div>
    );
}
