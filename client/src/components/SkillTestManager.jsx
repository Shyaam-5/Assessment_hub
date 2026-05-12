import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Brain, Plus, Trash2, ToggleLeft, ToggleRight, Users, CheckCircle, XCircle,
    Eye, X, ChevronDown, ChevronUp, Settings, Tag, FileText, Code, Database,
    MessageSquare, Clock, Target, Search, Hash, BarChart2, Shield, Sparkles, Zap,
    Camera, Mic, Maximize, ClipboardX, ScanFace, Video, Smartphone, Monitor
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const SKILL_CATEGORIES = {
    'Languages': ['Python', 'JavaScript', 'Java', 'C++', 'C#', 'Go', 'Rust', 'TypeScript'],
    'Frontend': ['React', 'Angular', 'Vue.js', 'HTML', 'CSS'],
    'Backend': ['Node.js', 'Express.js', 'Django', 'Flask', 'Spring Boot'],
    'Databases': ['SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Redis'],
    'CS Fundamentals': ['Data Structures', 'Algorithms', 'System Design', 'OOP', 'Design Patterns'],
    'DevOps & Cloud': ['Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Git', 'Linux'],
    'API & Web': ['REST API', 'GraphQL', 'Networking', 'Security', 'Testing'],
    'AI / ML': ['Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision']
};

const ALL_SKILLS = Object.values(SKILL_CATEGORIES).flat();

// Section card helper
const SectionCard = ({ icon, title, subtitle, color, children }) => (
    <div style={{
        background: '#1e293b', borderRadius: '14px', border: '1px solid #334155',
        overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    }}>
        <div style={{
            padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px',
            borderBottom: '1px solid #334155', background: `linear-gradient(135deg, ${color}18, ${color}08)`
        }}>
            <div style={{
                width: '32px', height: '32px', borderRadius: '8px', display: 'flex',
                alignItems: 'center', justifyContent: 'center', background: `${color}25`, color: color
            }}>{icon}</div>
            <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#f1f5f9' }}>{title}</div>
                {subtitle && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{subtitle}</div>}
            </div>
        </div>
        <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
);

// Number input with +/- buttons
const NumberInput = ({ label, value, onChange, min, max, icon, color, suffix }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {icon} {label}
        </label>
        <div style={{
            display: 'flex', alignItems: 'center', borderRadius: '10px',
            border: '1px solid #475569', overflow: 'hidden', background: '#0f172a'
        }}>
            <button onClick={() => onChange(Math.max(min, value - 1))} style={{
                width: '36px', height: '40px', border: 'none', background: '#1e293b',
                cursor: 'pointer', fontSize: '18px', color: '#94a3b8', fontWeight: 600,
                borderRight: '1px solid #475569'
            }}>−</button>
            <input type="number" value={value} min={min} max={max}
                onChange={e => onChange(Math.min(max, Math.max(min, parseInt(e.target.value) || min)))}
                style={{
                    flex: 1, textAlign: 'center', border: 'none', outline: 'none',
                    fontSize: '16px', fontWeight: 700, color: color || '#f1f5f9',
                    padding: '8px 4px', width: '100%', boxSizing: 'border-box',
                    background: 'transparent'
                }}
            />
            <button onClick={() => onChange(Math.min(max, value + 1))} style={{
                width: '36px', height: '40px', border: 'none', background: '#1e293b',
                cursor: 'pointer', fontSize: '18px', color: '#94a3b8', fontWeight: 600,
                borderLeft: '1px solid #475569'
            }}>+</button>
        </div>
        {suffix && <span style={{ fontSize: '10px', color: '#64748b', textAlign: 'center' }}>{suffix}</span>}
    </div>
);

export default function SkillTestManager() {
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [viewAttempts, setViewAttempts] = useState(null);
    const [attempts, setAttempts] = useState([]);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({
        title: '', description: '', skills: [],
        difficulty_level: 'mixed',
        mcq_count: 10, coding_count: 3, sql_count: 3, interview_count: 5,
        attempt_limit: 1, mcq_duration_minutes: 30, coding_duration_minutes: 45, sql_duration_minutes: 45, interview_duration_minutes: 30,
        mcq_passing_score: 60, coding_passing_score: 50, sql_passing_score: 50, interview_passing_score: 6,
        proctoring_enabled: true,
        proctoring_config: {
            camera: true, mic: true, fullscreen: true,
            paste_disabled: true, face_detection: true,
            camera_block_detect: true, phone_detect: true
        }
    });
    const [skillSearch, setSkillSearch] = useState('');
    const [expandedCategory, setExpandedCategory] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => { loadTests(); }, []);

    const loadTests = async () => {
        try {
            setLoading(true);
            const { data } = await axios.get(`${API}/api/skill-tests/all`);
            setTests(data);
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setLoading(false);
        }
    };

    const createTest = async () => {
        if (!form.title.trim()) return setError('Title is required');
        if (form.skills.length === 0) return setError('Select at least one skill');
        setError('');
        setCreating(true);
        try {
            await axios.post(`${API}/api/skill-tests/create`, form);
            setShowCreate(false);
            setForm({ title: '', description: '', skills: [], difficulty_level: 'mixed', mcq_count: 10, coding_count: 3, sql_count: 3, interview_count: 5, attempt_limit: 1, mcq_duration_minutes: 30, coding_duration_minutes: 45, sql_duration_minutes: 45, interview_duration_minutes: 30, mcq_passing_score: 60, coding_passing_score: 50, sql_passing_score: 50, interview_passing_score: 6, proctoring_enabled: true, proctoring_config: { camera: true, mic: true, fullscreen: true, paste_disabled: true, face_detection: true, camera_block_detect: true, phone_detect: true } });
            loadTests();
        } catch (err) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setCreating(false);
        }
    };

    const toggleTest = async (id) => {
        try {
            await axios.put(`${API}/api/skill-tests/${id}/toggle`);
            loadTests();
        } catch (err) {
            setError(err.message);
        }
    };

    const deleteTest = async (id) => {
        if (!window.confirm('Delete this test and all its attempts?')) return;
        try {
            await axios.delete(`${API}/api/skill-tests/${id}`);
            loadTests();
        } catch (err) {
            setError(err.message);
        }
    };

    const loadAttempts = async (testId) => {
        try {
            const { data } = await axios.get(`${API}/api/skill-tests/${testId}/attempts`);
            setAttempts(data);
            setViewAttempts(testId);
        } catch (err) {
            setError(err.message);
        }
    };

    const toggleSkill = (skill) => {
        setForm(f => ({
            ...f,
            skills: f.skills.includes(skill) ? f.skills.filter(s => s !== skill) : [...f.skills, skill]
        }));
    };

    const selectAllInCategory = (category) => {
        const catSkills = SKILL_CATEGORIES[category] || [];
        const allSelected = catSkills.every(s => form.skills.includes(s));
        setForm(f => ({
            ...f,
            skills: allSelected
                ? f.skills.filter(s => !catSkills.includes(s))
                : [...new Set([...f.skills, ...catSkills])]
        }));
    };

    const filteredSkills = skillSearch
        ? ALL_SKILLS.filter(s => s.toLowerCase().includes(skillSearch.toLowerCase()))
        : [];

    const stageColors = { passed: '#22c55e', failed: '#ef4444', in_progress: '#f59e0b', pending: '#6b7280' };



    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '42px', height: '42px', borderRadius: '12px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)'
                    }}>
                        <Brain size={22} color="white" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#f1f5f9' }}>Skill Test Management</h2>
                        <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af' }}>Create & manage AI-powered assessments</p>
                    </div>
                </div>
                <button onClick={() => { setShowCreate(!showCreate); setError(''); }} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 22px',
                    background: showCreate ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                    color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer',
                    fontWeight: 700, fontSize: '14px', boxShadow: '0 2px 8px rgba(139,92,246,0.3)',
                    transition: 'all 0.2s'
                }}>
                    {showCreate ? <X size={18} /> : <Plus size={18} />}
                    {showCreate ? 'Cancel' : 'Create Test'}
                </button>
            </div>

            {error && (
                <div style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', color: '#fca5a5',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px'
                }}>
                    <span><XCircle size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />{error}</span>
                    <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: '4px' }}><X size={16} /></button>
                </div>
            )}

            {/* Create Form — Redesigned */}
            {showCreate && (
                <div style={{
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(109,40,217,0.05))',
                    borderRadius: '16px', padding: '24px', marginBottom: '28px',
                    border: '1px solid rgba(139,92,246,0.2)', boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
                }}>
                    {/* Form Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                        <Sparkles size={20} color="#8b5cf6" />
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#c4b5fd' }}>Create New Assessment</h3>
                    </div>

                    {/* Step 1: Basic Info */}
                    <SectionCard icon={<FileText size={16} />} title="Basic Information" subtitle="Name your assessment" color="#3b82f6">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                            <div>
                                <label style={{ fontWeight: 600, fontSize: '12px', display: 'block', marginBottom: '6px', color: '#cbd5e1' }}>
                                    Test Title <span style={{ color: '#f87171' }}>*</span>
                                </label>
                                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                                    placeholder="e.g., Full Stack Developer Assessment"
                                    style={{
                                        width: '100%', padding: '11px 14px', borderRadius: '10px',
                                        border: '2px solid ' + (form.title ? '#8b5cf6' : '#475569'),
                                        fontSize: '14px', boxSizing: 'border-box', outline: 'none',
                                        transition: 'border-color 0.2s', background: '#0f172a', color: '#f1f5f9'
                                    }} />
                            </div>
                            <div>
                                <label style={{ fontWeight: 600, fontSize: '12px', display: 'block', marginBottom: '6px', color: '#cbd5e1' }}>Description</label>
                                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder="Brief description of this test"
                                    style={{
                                        width: '100%', padding: '11px 14px', borderRadius: '10px',
                                        border: '2px solid #475569', fontSize: '14px', boxSizing: 'border-box',
                                        outline: 'none', transition: 'border-color 0.2s', background: '#0f172a', color: '#f1f5f9'
                                    }} />
                            </div>
                        </div>
                    </SectionCard>

                    <div style={{ height: '14px' }} />

                    {/* Step 2: Skills */}
                    <SectionCard icon={<Tag size={16} />} title="Skills Selection"
                        subtitle={`${form.skills.length} skill${form.skills.length !== 1 ? 's' : ''} selected`} color="#8b5cf6">

                        {/* Selected Skills Chips */}
                        {form.skills.length > 0 && (
                            <div style={{
                                display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px',
                                padding: '10px', background: 'rgba(139,92,246,0.1)', borderRadius: '10px', border: '1px dashed rgba(139,92,246,0.4)'
                            }}>
                                {form.skills.map(s => (
                                    <span key={s} onClick={() => toggleSkill(s)} style={{
                                        padding: '5px 12px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                        color: 'white', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600,
                                        boxShadow: '0 1px 3px rgba(139,92,246,0.3)', transition: 'transform 0.15s'
                                    }}>
                                        {s} <X size={12} />
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Search */}
                        <div style={{ position: 'relative', marginBottom: '12px' }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                            <input value={skillSearch} onChange={e => setSkillSearch(e.target.value)}
                                placeholder="Search skills..." style={{
                                    width: '100%', padding: '10px 12px 10px 36px', borderRadius: '10px',
                                    border: '2px solid #475569', fontSize: '13px', boxSizing: 'border-box',
                                    outline: 'none', transition: 'border-color 0.2s', background: '#0f172a', color: '#f1f5f9'
                                }} />
                        </div>

                        {/* Search Results */}
                        {skillSearch && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px', padding: '10px', background: 'rgba(245,158,11,0.08)', borderRadius: '8px' }}>
                                {filteredSkills.length === 0 ? (
                                    <span style={{ fontSize: '12px', color: '#9ca3af' }}>No skills found for "{skillSearch}"</span>
                                ) : filteredSkills.map(s => (
                                    <span key={s} onClick={() => toggleSkill(s)} style={{
                                        padding: '5px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                                        fontWeight: 500, transition: 'all 0.15s',
                                        background: form.skills.includes(s) ? '#8b5cf6' : '#0f172a',
                                        color: form.skills.includes(s) ? 'white' : '#cbd5e1',
                                        border: '1px solid ' + (form.skills.includes(s) ? '#7c3aed' : '#475569'),
                                        boxShadow: form.skills.includes(s) ? '0 1px 3px rgba(139,92,246,0.3)' : 'none'
                                    }}>
                                        {form.skills.includes(s) ? '✓ ' : ''}{s}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Categorized Skills */}
                        {!skillSearch && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {Object.entries(SKILL_CATEGORIES).map(([category, skills]) => {
                                    const selectedInCat = skills.filter(s => form.skills.includes(s)).length;
                                    const isExpanded = expandedCategory === category;
                                    return (
                                        <div key={category} style={{
                                            border: '1px solid ' + (selectedInCat > 0 ? 'rgba(139,92,246,0.4)' : '#475569'),
                                            borderRadius: '10px', overflow: 'hidden',
                                            background: selectedInCat > 0 ? 'rgba(139,92,246,0.08)' : '#0f172a',
                                            transition: 'all 0.2s'
                                        }}>
                                            <div onClick={() => setExpandedCategory(isExpanded ? null : category)} style={{
                                                padding: '10px 14px', cursor: 'pointer',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#e2e8f0' }}>{category}</span>
                                                    {selectedInCat > 0 && (
                                                        <span style={{
                                                            padding: '1px 8px', borderRadius: '10px', fontSize: '11px',
                                                            background: '#8b5cf6', color: 'white', fontWeight: 700
                                                        }}>{selectedInCat}/{skills.length}</span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <button onClick={(e) => { e.stopPropagation(); selectAllInCategory(category); }} style={{
                                                        padding: '3px 8px', borderRadius: '6px', border: '1px solid #475569',
                                                        background: selectedInCat === skills.length ? '#8b5cf6' : '#1e293b',
                                                        color: selectedInCat === skills.length ? 'white' : '#94a3b8',
                                                        fontSize: '10px', fontWeight: 600, cursor: 'pointer'
                                                    }}>
                                                        {selectedInCat === skills.length ? 'Deselect All' : 'Select All'}
                                                    </button>
                                                    {isExpanded ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
                                                </div>
                                            </div>
                                            {isExpanded && (
                                                <div style={{
                                                    padding: '8px 14px 12px', borderTop: '1px solid #334155',
                                                    display: 'flex', flexWrap: 'wrap', gap: '6px'
                                                }}>
                                                    {skills.map(s => (
                                                        <span key={s} onClick={() => toggleSkill(s)} style={{
                                                            padding: '5px 12px', borderRadius: '20px', fontSize: '12px',
                                                            cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s',
                                                            background: form.skills.includes(s) ? '#8b5cf6' : '#1e293b',
                                                            color: form.skills.includes(s) ? 'white' : '#cbd5e1',
                                                            border: '1px solid ' + (form.skills.includes(s) ? '#7c3aed' : '#475569'),
                                                            boxShadow: form.skills.includes(s) ? '0 1px 3px rgba(139,92,246,0.3)' : 'none'
                                                        }}>
                                                            {form.skills.includes(s) ? '✓ ' : ''}{s}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </SectionCard>

                    <div style={{ height: '14px' }} />

                    {/* Step 3: Difficulty Level */}
                    <SectionCard icon={<Target size={16} />} title="Difficulty Level" subtitle="Set overall difficulty" color="#f59e0b">
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {[
                                { value: 'easy', label: 'Easy', desc: 'Beginner friendly', color: '#22c55e' },
                                { value: 'medium', label: 'Medium', desc: 'Intermediate level', color: '#f59e0b' },
                                { value: 'hard', label: 'Hard', desc: 'Advanced concepts', color: '#ef4444' },
                                { value: 'mixed', label: 'Mixed', desc: '30% easy, 50% medium, 20% hard', color: '#8b5cf6' }
                            ].map(d => (
                                <button key={d.value} onClick={() => setForm({ ...form, difficulty_level: d.value })} style={{
                                    flex: '1 1 140px', padding: '14px 16px', borderRadius: '12px', cursor: 'pointer',
                                    background: form.difficulty_level === d.value ? `${d.color}18` : '#0f172a',
                                    border: `2px solid ${form.difficulty_level === d.value ? d.color : '#475569'}`,
                                    textAlign: 'center', transition: 'all 0.2s'
                                }}>
                                    <div style={{ fontWeight: 700, fontSize: '14px', color: form.difficulty_level === d.value ? d.color : '#e2e8f0', marginBottom: '4px' }}>{d.label}</div>
                                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{d.desc}</div>
                                </button>
                            ))}
                        </div>
                    </SectionCard>

                    <div style={{ height: '14px' }} />

                    {/* Step 4: Proctoring Mode */}
                    <SectionCard icon={<Shield size={16} />} title="Proctoring Mode" subtitle={form.proctoring_enabled ? 'Enabled — configure options' : 'Disabled'} color="#ef4444">
                        {/* Master Toggle */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: form.proctoring_enabled ? '16px' : '0', padding: '10px 14px', background: '#0f172a', borderRadius: '10px', border: '1px solid #334155' }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '14px', color: '#f1f5f9' }}>Enable Proctoring</div>
                                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Monitor students during test</div>
                            </div>
                            <button onClick={() => setForm({ ...form, proctoring_enabled: !form.proctoring_enabled })} style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: 0
                            }}>
                                {form.proctoring_enabled
                                    ? <ToggleRight size={36} color="#22c55e" />
                                    : <ToggleLeft size={36} color="#475569" />}
                            </button>
                        </div>

                        {/* Proctoring Options Grid */}
                        {form.proctoring_enabled && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                                {[
                                    { key: 'camera', label: 'Camera', desc: 'Webcam monitoring', icon: <Camera size={16} />, color: '#3b82f6' },
                                    { key: 'mic', label: 'Microphone', desc: 'Audio monitoring', icon: <Mic size={16} />, color: '#8b5cf6' },
                                    { key: 'fullscreen', label: 'Fullscreen', desc: 'Force fullscreen mode', icon: <Maximize size={16} />, color: '#06b6d4' },
                                    { key: 'paste_disabled', label: 'Paste Disabled', desc: 'Block copy-paste', icon: <ClipboardX size={16} />, color: '#f59e0b' },
                                    { key: 'face_detection', label: 'Face Movement', desc: 'Detect face away/moving', icon: <ScanFace size={16} />, color: '#10b981' },
                                    { key: 'camera_block_detect', label: 'Camera Block', desc: 'Detect covered camera', icon: <Video size={16} />, color: '#ef4444' },
                                    { key: 'phone_detect', label: 'Phone Detection', desc: 'Detect mobile phone', icon: <Smartphone size={16} />, color: '#ec4899' }
                                ].map(opt => {
                                    const enabled = form.proctoring_config[opt.key];
                                    return (
                                        <button key={opt.key} onClick={() => setForm({
                                            ...form,
                                            proctoring_config: { ...form.proctoring_config, [opt.key]: !enabled }
                                        })} style={{
                                            display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px',
                                            borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                                            background: enabled ? `${opt.color}12` : '#0f172a',
                                            border: `1.5px solid ${enabled ? opt.color : '#475569'}`,
                                            transition: 'all 0.2s'
                                        }}>
                                            <div style={{
                                                width: '34px', height: '34px', borderRadius: '8px', display: 'flex',
                                                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                background: enabled ? `${opt.color}25` : '#1e293b', color: enabled ? opt.color : '#64748b'
                                            }}>{opt.icon}</div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, fontSize: '13px', color: enabled ? '#f1f5f9' : '#94a3b8' }}>{opt.label}</div>
                                                <div style={{ fontSize: '10px', color: '#64748b' }}>{opt.desc}</div>
                                            </div>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: enabled ? opt.color : '#475569', flexShrink: 0 }} />
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </SectionCard>

                    <div style={{ height: '14px' }} />

                    {/* Step 5: Question Counts */}
                    <SectionCard icon={<Hash size={16} />} title="Question Configuration"
                        subtitle="Set number of questions per section" color="#10b981">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                            <NumberInput label="MCQ Questions" value={form.mcq_count}
                                onChange={v => setForm({ ...form, mcq_count: v })}
                                min={5} max={50} icon={<Brain size={12} />} color="#8b5cf6" suffix="5–50 questions" />
                            <NumberInput label="Coding Problems" value={form.coding_count}
                                onChange={v => setForm({ ...form, coding_count: v })}
                                min={1} max={10} icon={<Code size={12} />} color="#3b82f6" suffix="1–10 problems" />
                            <NumberInput label="SQL Problems" value={form.sql_count}
                                onChange={v => setForm({ ...form, sql_count: v })}
                                min={1} max={10} icon={<Database size={12} />} color="#10b981" suffix="1–10 problems" />
                            <NumberInput label="Interview Qs" value={form.interview_count}
                                onChange={v => setForm({ ...form, interview_count: v })}
                                min={3} max={15} icon={<MessageSquare size={12} />} color="#f59e0b" suffix="3–15 questions" />
                        </div>
                    </SectionCard>

                    <div style={{ height: '14px' }} />

                    {/* Step 4: Passing Criteria & Settings */}
                    <SectionCard icon={<Target size={16} />} title="Passing Criteria & Settings"
                        subtitle="Configure passing scores and limits" color="#ef4444">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '14px' }}>
                            <NumberInput label="MCQ Pass %" value={form.mcq_passing_score}
                                onChange={v => setForm({ ...form, mcq_passing_score: v })}
                                min={30} max={100} icon={<BarChart2 size={12} />} color="#8b5cf6" suffix="min 30%" />
                            <NumberInput label="Coding Pass %" value={form.coding_passing_score}
                                onChange={v => setForm({ ...form, coding_passing_score: v })}
                                min={30} max={100} icon={<BarChart2 size={12} />} color="#3b82f6" suffix="min 30%" />
                            <NumberInput label="SQL Pass %" value={form.sql_passing_score}
                                onChange={v => setForm({ ...form, sql_passing_score: v })}
                                min={30} max={100} icon={<BarChart2 size={12} />} color="#10b981" suffix="min 30%" />
                            <NumberInput label="Interview Pass (/10)" value={form.interview_passing_score}
                                onChange={v => setForm({ ...form, interview_passing_score: v })}
                                min={3} max={10} icon={<BarChart2 size={12} />} color="#f59e0b" suffix="out of 10" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '14px' }}>
                            <NumberInput label="MCQ Time (m)" value={form.mcq_duration_minutes}
                                onChange={v => setForm({ ...form, mcq_duration_minutes: v })}
                                min={5} max={120} icon={<Clock size={12} />} color="#8b5cf6" suffix="minutes" />
                            <NumberInput label="Coding Time (m)" value={form.coding_duration_minutes}
                                onChange={v => setForm({ ...form, coding_duration_minutes: v })}
                                min={5} max={120} icon={<Clock size={12} />} color="#3b82f6" suffix="minutes" />
                            <NumberInput label="SQL Time (m)" value={form.sql_duration_minutes}
                                onChange={v => setForm({ ...form, sql_duration_minutes: v })}
                                min={5} max={120} icon={<Clock size={12} />} color="#10b981" suffix="minutes" />
                            <NumberInput label="Interview Time (m)" value={form.interview_duration_minutes}
                                onChange={v => setForm({ ...form, interview_duration_minutes: v })}
                                min={5} max={120} icon={<Clock size={12} />} color="#f59e0b" suffix="minutes" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                            <NumberInput label="Max Attempts" value={form.attempt_limit}
                                onChange={v => setForm({ ...form, attempt_limit: v })}
                                min={1} max={5} icon={<Shield size={12} />} color="#6366f1" suffix="per student" />
                        </div>
                    </SectionCard>

                    <div style={{ height: '18px' }} />

                    {/* Summary & Submit */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '14px 18px', background: '#1e293b', borderRadius: '12px',
                        border: '1px solid #334155', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#94a3b8', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span><Brain size={13} style={{ verticalAlign: 'middle' }} /> {form.mcq_count} MCQ</span>
                            <span><Code size={13} style={{ verticalAlign: 'middle' }} /> {form.coding_count} Coding</span>
                            <span><Database size={13} style={{ verticalAlign: 'middle' }} /> {form.sql_count} SQL</span>
                            <span><MessageSquare size={13} style={{ verticalAlign: 'middle' }} /> {form.interview_count} Interview</span>
                            <span><MessageSquare size={13} style={{ verticalAlign: 'middle' }} /> {form.interview_count} Interview</span>
                            <span><Clock size={13} style={{ verticalAlign: 'middle' }} /> {form.mcq_duration_minutes}m+{form.coding_duration_minutes}m+{form.sql_duration_minutes}m+{form.interview_duration_minutes}m</span>
                            <span style={{ color: { easy: '#22c55e', medium: '#f59e0b', hard: '#ef4444', mixed: '#8b5cf6' }[form.difficulty_level] }}>
                                <Target size={13} style={{ verticalAlign: 'middle' }} /> {form.difficulty_level}
                            </span>
                            <span style={{ color: form.proctoring_enabled ? '#22c55e' : '#ef4444' }}>
                                <Shield size={13} style={{ verticalAlign: 'middle' }} /> {form.proctoring_enabled ? 'Proctored' : 'No Proctor'}
                            </span>
                        </div>
                        <button onClick={createTest} disabled={creating} style={{
                            padding: '12px 32px',
                            background: creating ? '#a78bfa' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                            color: 'white', border: 'none', borderRadius: '10px', cursor: creating ? 'not-allowed' : 'pointer',
                            fontWeight: 800, fontSize: '15px', boxShadow: '0 2px 10px rgba(139,92,246,0.35)',
                            display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s'
                        }}>
                            {creating ? <><Zap size={16} /> Creating...</> : <><Sparkles size={16} /> Create Assessment</>}
                        </button>
                    </div>
                </div>
            )}

            {/* Tests List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>
                    <div style={{ width: '40px', height: '40px', border: '3px solid #e5e7eb', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    <p style={{ fontSize: '14px', fontWeight: 500 }}>Loading assessments...</p>
                </div>
            ) : tests.length === 0 ? (
                <div style={{
                    textAlign: 'center', padding: '60px', color: '#94a3b8',
                    background: '#1e293b', borderRadius: '16px', border: '2px dashed #334155'
                }}>
                    <div style={{
                        width: '64px', height: '64px', borderRadius: '16px', margin: '0 auto 16px',
                        background: 'rgba(139,92,246,0.15)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center'
                    }}>
                        <Brain size={32} color="#8b5cf6" />
                    </div>
                    <p style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0', margin: '0 0 6px' }}>No assessments yet</p>
                    <p style={{ fontSize: '13px', margin: 0 }}>Click "Create Test" above to build your first skill assessment</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600, padding: '0 4px' }}>
                        {tests.length} assessment{tests.length !== 1 ? 's' : ''}
                    </div>
                    {tests.map(test => (
                        <div key={test.id} style={{
                            background: '#1e293b', border: '1px solid #334155', borderRadius: '14px',
                            padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                            borderLeft: `4px solid ${test.is_active ? '#8b5cf6' : '#475569'}`,
                            transition: 'box-shadow 0.2s'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#f1f5f9' }}>{test.title}</h3>
                                        <span style={{
                                            padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700,
                                            background: test.is_active ? '#dcfce7' : '#fee2e2',
                                            color: test.is_active ? '#16a34a' : '#dc2626'
                                        }}>
                                            {test.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    {test.description && <p style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: '13px', lineHeight: '1.5' }}>{test.description}</p>}

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '12px' }}>
                                        {test.skills.map(s => (
                                            <span key={s} style={{
                                                padding: '3px 10px', background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
                                                borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                                                border: '1px solid rgba(139,92,246,0.25)'
                                            }}>{s}</span>
                                        ))}
                                    </div>

                                    <div style={{
                                        display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '11px',
                                        padding: '8px 12px', background: '#0f172a', borderRadius: '8px'
                                    }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#8b5cf6', fontWeight: 600 }}>
                                            <Brain size={12} /> {test.mcq_count} MCQ
                                        </span>
                                        <span style={{ color: '#475569' }}>|</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#3b82f6', fontWeight: 600 }}>
                                            <Code size={12} /> {test.coding_count} Coding
                                        </span>
                                        <span style={{ color: '#475569' }}>|</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#10b981', fontWeight: 600 }}>
                                            <Database size={12} /> {test.sql_count} SQL
                                        </span>
                                        <span style={{ color: '#475569' }}>|</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#f59e0b', fontWeight: 600 }}>
                                            <MessageSquare size={12} /> {test.interview_count} Interview
                                        </span>
                                        <span style={{ color: '#475569' }}>|</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#94a3b8' }}>
                                            <Clock size={12} /> {test.mcq_duration_minutes}m
                                        </span>
                                        <span style={{ color: '#475569' }}>|</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#94a3b8' }}>
                                            <Shield size={12} /> {test.attempt_limit} attempt{test.attempt_limit > 1 ? 's' : ''}
                                        </span>
                                    </div>

                                    {test.attempt_stats && (
                                        <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '12px' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8' }}>
                                                <Users size={14} /> {test.attempt_stats.total || 0} attempts
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#22c55e' }}>
                                                <CheckCircle size={14} /> {test.attempt_stats.completed || 0} passed
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ef4444' }}>
                                                <XCircle size={14} /> {test.attempt_stats.failed || 0} failed
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '6px', marginLeft: '16px' }}>
                                    <button onClick={() => loadAttempts(test.id)} title="View Attempts" style={{
                                        padding: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                                        borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s'
                                    }}><Eye size={16} color="#34d399" /></button>
                                    <button onClick={() => toggleTest(test.id)} title={test.is_active ? 'Deactivate' : 'Activate'} style={{
                                        padding: '8px', background: test.is_active ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                                        border: '1px solid ' + (test.is_active ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'),
                                        borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s'
                                    }}>
                                        {test.is_active ? <ToggleRight size={16} color="#fbbf24" /> : <ToggleLeft size={16} color="#34d399" />}
                                    </button>
                                    <button onClick={() => deleteTest(test.id)} title="Delete" style={{
                                        padding: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                        borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s'
                                    }}><Trash2 size={16} color="#f87171" /></button>
                                </div>
                            </div>

                            {/* Attempts Panel */}
                            {viewAttempts === test.id && (
                                <div style={{ marginTop: '16px', borderTop: '1px solid #334155', paddingTop: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Users size={15} /> Student Attempts
                                        </h4>
                                        <button onClick={() => setViewAttempts(null)} style={{
                                            background: '#334155', border: 'none', cursor: 'pointer', color: '#94a3b8',
                                            borderRadius: '6px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px',
                                            fontSize: '11px', fontWeight: 600
                                        }}>Close <ChevronUp size={14} /></button>
                                    </div>
                                    {attempts.length === 0 ? (
                                        <p style={{ color: '#9ca3af', fontSize: '13px' }}>No attempts yet</p>
                                    ) : (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                <thead>
                                                    <tr style={{ background: '#0f172a' }}>
                                                        <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Student</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Attempt</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Stage</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>MCQ</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Coding</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>SQL</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Interview</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {attempts.map(a => (
                                                        <tr key={a.id} style={{ borderBottom: '1px solid #1e293b' }}>
                                                            <td style={{ padding: '8px', color: '#e2e8f0' }}>{a.student_name || a.student_id}</td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: '#cbd5e1' }}>#{a.attempt_number}</td>
                                                            <td style={{ padding: '8px', textAlign: 'center' }}>
                                                                <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>{a.current_stage}</span>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: stageColors[a.mcq_status] }}>
                                                                {a.mcq_status !== 'pending' ? `${Math.round(a.mcq_score)}%` : '-'}
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: stageColors[a.coding_status] }}>
                                                                {a.coding_status !== 'pending' ? `${Math.round(a.coding_score)}%` : '-'}
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: stageColors[a.sql_status] }}>
                                                                {a.sql_status !== 'pending' ? `${Math.round(a.sql_score)}%` : '-'}
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: stageColors[a.interview_status] }}>
                                                                {a.interview_status !== 'pending' ? `${(a.interview_score || 0).toFixed(1)}/10` : '-'}
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center' }}>
                                                                <span style={{
                                                                    padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                                                    background: a.overall_status === 'completed' ? 'rgba(16,185,129,0.15)' : a.overall_status === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                                                    color: a.overall_status === 'completed' ? '#6ee7b7' : a.overall_status === 'failed' ? '#fca5a5' : '#fcd34d'
                                                                }}>
                                                                    {a.overall_status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
