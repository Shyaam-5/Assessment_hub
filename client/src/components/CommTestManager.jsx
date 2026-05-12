import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    MessageSquare, Plus, Trash2, ToggleLeft, ToggleRight, Users, CheckCircle, XCircle,
    Eye, X, ChevronUp, ChevronDown, Settings, FileText, Clock, Target, Shield, Sparkles, Zap,
    Camera, Maximize, BookOpen, Headphones, PenTool, RefreshCw, Wand2, Edit3,
    Volume2, Brain, ArrowLeft, Mic, BarChart3, Smartphone, Monitor
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Reusable section card
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
                alignItems: 'center', justifyContent: 'center', background: `${color}25`, color
            }}>{icon}</div>
            <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#f1f5f9' }}>{title}</div>
                {subtitle && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{subtitle}</div>}
            </div>
        </div>
        <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
);

// Number input helper
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

export default function CommTestManager() {
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [viewAttempts, setViewAttempts] = useState(null);
    const [attempts, setAttempts] = useState([]);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [generating, setGenerating] = useState({});
    const [viewDetail, setViewDetail] = useState(null); // attempt object for detail view

    const defaultForm = {
        title: '', description: '',
        generation_method: 'ai', difficulty: 'mixed',
        module_a_count: 5, module_b_count: 5, module_c_count: 3, module_d_count: 5,
        duration_minutes: 60, attempt_limit: 3,
        proctoring_enabled: true,
        proctoring_config: { camera: true, fullscreen: true, tab_switch: true, copy_paste: true, phone_detect: true, multi_monitor_detect: true, multiple_people_detect: true },
        module_a_sentences: [], module_b_sentences: [], module_c_topics: [], module_d_questions: []
    };
    const [form, setForm] = useState({ ...defaultForm });

    useEffect(() => { loadTests(); }, []);

    const loadTests = async () => {
        try {
            setLoading(true);
            const { data } = await axios.get(`${API}/api/communication/tests/all`);
            setTests(data);
        } catch (err) {
            setError(err.response?.data?.detail || err.message);
        } finally {
            setLoading(false);
        }
    };

    const createTest = async () => {
        if (!form.title.trim()) return setError('Title is required');
        setError(''); setCreating(true);
        try {
            await axios.post(`${API}/api/communication/tests/create`, form);
            setShowCreate(false);
            setForm({ ...defaultForm });
            loadTests();
        } catch (err) {
            setError(err.response?.data?.detail || err.message);
        } finally {
            setCreating(false);
        }
    };

    const toggleTest = async (id) => {
        try {
            await axios.put(`${API}/api/communication/tests/${id}/toggle`);
            loadTests();
        } catch (err) { setError(err.message); }
    };

    const deleteTest = async (id) => {
        if (!window.confirm('Delete this test and all its attempts?')) return;
        try {
            await axios.delete(`${API}/api/communication/tests/${id}`);
            loadTests();
        } catch (err) { setError(err.message); }
    };

    const loadAttempts = async (testId) => {
        try {
            const { data } = await axios.get(`${API}/api/communication/tests/${testId}/attempts`);
            setAttempts(data);
            setViewAttempts(testId);
        } catch (err) { setError(err.message); }
    };

    // AI content preview/generation per module
    const generatePreview = async (module, countKey) => {
        setGenerating(g => ({ ...g, [module]: true }));
        try {
            const { data } = await axios.post(`${API}/api/communication/tests/generate-preview`, {
                module, count: form[countKey], difficulty: form.difficulty
            });
            if (module === 'A') setForm(f => ({ ...f, module_a_sentences: data.content }));
            else if (module === 'B') setForm(f => ({ ...f, module_b_sentences: data.content }));
            else if (module === 'C') setForm(f => ({ ...f, module_c_topics: data.content }));
            else if (module === 'D') setForm(f => ({ ...f, module_d_questions: data.content }));
        } catch (err) {
            setError('AI generation failed: ' + (err.response?.data?.detail || err.message));
        } finally {
            setGenerating(g => ({ ...g, [module]: false }));
        }
    };

    // Manual content editing helpers
    const addManualItem = (field, item) => {
        setForm(f => ({ ...f, [field]: [...(f[field] || []), item] }));
    };
    const removeItem = (field, idx) => {
        setForm(f => ({ ...f, [field]: f[field].filter((_, i) => i !== idx) }));
    };

    const proctoringToggles = [
        { key: 'camera', label: 'Camera', icon: <Camera size={14} />, color: '#3b82f6' },
        { key: 'fullscreen', label: 'Fullscreen', icon: <Maximize size={14} />, color: '#8b5cf6' },
        { key: 'tab_switch', label: 'Tab Tracking', icon: <Eye size={14} />, color: '#f59e0b' },
        { key: 'copy_paste', label: 'Copy/Paste Block', icon: <Shield size={14} />, color: '#ef4444' },
        { key: 'phone_detect', label: 'Phone Detect', icon: <Smartphone size={14} />, color: '#ec4899' },
        { key: 'multi_monitor_detect', label: 'Multi-Monitor', icon: <Monitor size={14} />, color: '#06b6d4' },
        { key: 'multiple_people_detect', label: 'People Detect', icon: <Users size={14} />, color: '#f97316' },
    ];

    const statusColors = { completed: '#22c55e', in_progress: '#f59e0b', pending: '#6b7280' };

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '42px', height: '42px', borderRadius: '12px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
                    }}>
                        <MessageSquare size={22} color="white" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#f1f5f9' }}>Communication Test Management</h2>
                        <p style={{ margin: 0, fontSize: '13px', color: '#9ca3af' }}>Create & manage AI-powered communication assessments</p>
                    </div>
                </div>
                <button onClick={() => { setShowCreate(!showCreate); setError(''); }} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 22px',
                    background: showCreate ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer',
                    fontWeight: 700, fontSize: '14px', boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
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

            {/* ──── Create Form ──── */}
            {showCreate && (
                <div style={{
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(29,78,216,0.05))',
                    borderRadius: '16px', padding: '24px', marginBottom: '28px',
                    border: '1px solid rgba(59,130,246,0.2)', boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                        <Sparkles size={20} color="#3b82f6" />
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#93c5fd' }}>Create Communication Assessment</h3>
                    </div>

                    {/* Basic Info */}
                    <SectionCard icon={<FileText size={16} />} title="Basic Information" subtitle="Name your assessment" color="#3b82f6">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                            <div>
                                <label style={{ fontWeight: 600, fontSize: '12px', display: 'block', marginBottom: '6px', color: '#cbd5e1' }}>
                                    Test Title <span style={{ color: '#f87171' }}>*</span>
                                </label>
                                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                                    placeholder="e.g., English Communication Assessment"
                                    style={{
                                        width: '100%', padding: '11px 14px', borderRadius: '10px',
                                        border: '2px solid ' + (form.title ? '#3b82f6' : '#475569'),
                                        fontSize: '14px', boxSizing: 'border-box', outline: 'none',
                                        background: '#0f172a', color: '#f1f5f9'
                                    }} />
                            </div>
                            <div>
                                <label style={{ fontWeight: 600, fontSize: '12px', display: 'block', marginBottom: '6px', color: '#cbd5e1' }}>Description</label>
                                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                    placeholder="Brief description"
                                    style={{
                                        width: '100%', padding: '11px 14px', borderRadius: '10px',
                                        border: '2px solid #475569', fontSize: '14px', boxSizing: 'border-box',
                                        outline: 'none', background: '#0f172a', color: '#f1f5f9'
                                    }} />
                            </div>
                        </div>

                        {/* Generation method & Difficulty */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '14px' }}>
                            <div>
                                <label style={{ fontWeight: 600, fontSize: '12px', display: 'block', marginBottom: '6px', color: '#cbd5e1' }}>Question Generation</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {['ai', 'manual', 'mixed'].map(m => (
                                        <button key={m} onClick={() => setForm(f => ({ ...f, generation_method: m }))} style={{
                                            flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid ' + (form.generation_method === m ? '#3b82f6' : '#475569'),
                                            background: form.generation_method === m ? 'rgba(59,130,246,0.15)' : '#0f172a',
                                            color: form.generation_method === m ? '#93c5fd' : '#94a3b8',
                                            fontSize: '12px', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                                        }}>
                                            {m === 'ai' && <Wand2 size={12} />}
                                            {m === 'manual' && <Edit3 size={12} />}
                                            {m === 'mixed' && <Sparkles size={12} />}
                                            {m === 'ai' ? 'AI Generated' : m === 'manual' ? 'Manual' : 'Mixed'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label style={{ fontWeight: 600, fontSize: '12px', display: 'block', marginBottom: '6px', color: '#cbd5e1' }}>Difficulty Level</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {['easy', 'mixed', 'hard'].map(d => (
                                        <button key={d} onClick={() => setForm(f => ({ ...f, difficulty: d }))} style={{
                                            flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid ' + (form.difficulty === d ? ({ easy: '#22c55e', mixed: '#f59e0b', hard: '#ef4444' })[d] : '#475569'),
                                            background: form.difficulty === d ? `${({ easy: '#22c55e', mixed: '#f59e0b', hard: '#ef4444' })[d]}15` : '#0f172a',
                                            color: form.difficulty === d ? ({ easy: '#86efac', mixed: '#fcd34d', hard: '#fca5a5' })[d] : '#94a3b8',
                                            fontSize: '12px', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize'
                                        }}>
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </SectionCard>

                    <div style={{ height: '14px' }} />

                    {/* Module Configuration */}
                    <SectionCard icon={<Settings size={16} />} title="Module Configuration" subtitle="Question counts & time limit" color="#8b5cf6">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                            <NumberInput label="Read & Speak" value={form.module_a_count} onChange={v => setForm(f => ({ ...f, module_a_count: v }))}
                                min={1} max={20} icon={<BookOpen size={12} />} color="#3b82f6" suffix="sentences" />
                            <NumberInput label="Listen & Repeat" value={form.module_b_count} onChange={v => setForm(f => ({ ...f, module_b_count: v }))}
                                min={1} max={20} icon={<Headphones size={12} />} color="#8b5cf6" suffix="sentences" />
                            <NumberInput label="Topic Speaking" value={form.module_c_count} onChange={v => setForm(f => ({ ...f, module_c_count: v }))}
                                min={1} max={10} icon={<MessageSquare size={12} />} color="#10b981" suffix="topics" />
                            <NumberInput label="Grammar Quiz" value={form.module_d_count} onChange={v => setForm(f => ({ ...f, module_d_count: v }))}
                                min={1} max={30} icon={<PenTool size={12} />} color="#f59e0b" suffix="questions" />
                            <NumberInput label="Duration" value={form.duration_minutes} onChange={v => setForm(f => ({ ...f, duration_minutes: v }))}
                                min={10} max={180} icon={<Clock size={12} />} color="#06b6d4" suffix="minutes" />
                        </div>

                        <div style={{ marginTop: '12px' }}>
                            <NumberInput label="Attempt Limit" value={form.attempt_limit} onChange={v => setForm(f => ({ ...f, attempt_limit: v }))}
                                min={1} max={10} icon={<Target size={12} />} color="#a78bfa" suffix="max attempts per student" />
                        </div>
                    </SectionCard>

                    <div style={{ height: '14px' }} />

                    {/* Proctoring */}
                    <SectionCard icon={<Shield size={16} />} title="Proctoring Settings" subtitle="Security during assessment" color="#ef4444">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>Enable Proctoring</label>
                            <button onClick={() => setForm(f => ({ ...f, proctoring_enabled: !f.proctoring_enabled }))} style={{
                                background: 'none', border: 'none', cursor: 'pointer', padding: 0
                            }}>
                                {form.proctoring_enabled ? <ToggleRight size={28} color="#22c55e" /> : <ToggleLeft size={28} color="#6b7280" />}
                            </button>
                        </div>
                        {form.proctoring_enabled && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                                {proctoringToggles.map(pt => (
                                    <button key={pt.key}
                                        onClick={() => setForm(f => ({
                                            ...f,
                                            proctoring_config: { ...f.proctoring_config, [pt.key]: !f.proctoring_config[pt.key] }
                                        }))}
                                        style={{
                                            padding: '10px', borderRadius: '10px',
                                            border: `1px solid ${form.proctoring_config[pt.key] ? pt.color + '60' : '#475569'}`,
                                            background: form.proctoring_config[pt.key] ? `${pt.color}15` : '#0f172a',
                                            color: form.proctoring_config[pt.key] ? pt.color : '#64748b',
                                            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                                            fontSize: '11px', fontWeight: 600, transition: 'all 0.15s'
                                        }}
                                    >
                                        {pt.icon}
                                        {pt.label}
                                        <span style={{ fontSize: '9px', opacity: 0.7 }}>{form.proctoring_config[pt.key] ? 'ON' : 'OFF'}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </SectionCard>

                    <div style={{ height: '14px' }} />

                    {/* Content Management — AI Generate or Manual per Module */}
                    <SectionCard icon={<Wand2 size={16} />} title="Content Management"
                        subtitle={form.generation_method === 'ai' ? 'AI will generate all content on creation' : 'Add or generate content per module'} color="#10b981">

                        {/* Module A: Read & Speak sentences */}
                        <ModuleContentEditor
                            label="Module A – Read & Speak Sentences"
                            icon={<BookOpen size={14} />}
                            color="#3b82f6"
                            items={form.module_a_sentences}
                            isString={true}
                            placeholder="Type a sentence…"
                            generating={generating.A}
                            onGenerate={() => generatePreview('A', 'module_a_count')}
                            onAdd={val => addManualItem('module_a_sentences', val)}
                            onRemove={idx => removeItem('module_a_sentences', idx)}
                            showManual={form.generation_method !== 'ai'}
                        />

                        <div style={{ height: '12px' }} />

                        {/* Module B: Listen & Repeat sentences */}
                        <ModuleContentEditor
                            label="Module B – Listen & Repeat Sentences"
                            icon={<Headphones size={14} />}
                            color="#8b5cf6"
                            items={form.module_b_sentences}
                            isString={true}
                            placeholder="Type a sentence…"
                            generating={generating.B}
                            onGenerate={() => generatePreview('B', 'module_b_count')}
                            onAdd={val => addManualItem('module_b_sentences', val)}
                            onRemove={idx => removeItem('module_b_sentences', idx)}
                            showManual={form.generation_method !== 'ai'}
                        />

                        <div style={{ height: '12px' }} />

                        {/* Module C: Topics */}
                        <ModuleContentEditor
                            label="Module C – Topic Speaking"
                            icon={<MessageSquare size={14} />}
                            color="#10b981"
                            items={form.module_c_topics}
                            isString={true}
                            placeholder="Type a discussion topic…"
                            generating={generating.C}
                            onGenerate={() => generatePreview('C', 'module_c_count')}
                            onAdd={val => addManualItem('module_c_topics', val)}
                            onRemove={idx => removeItem('module_c_topics', idx)}
                            showManual={form.generation_method !== 'ai'}
                        />

                        <div style={{ height: '12px' }} />

                        {/* Module D: Grammar Questions */}
                        <ModuleContentEditor
                            label="Module D – Grammar Questions"
                            icon={<PenTool size={14} />}
                            color="#f59e0b"
                            items={form.module_d_questions}
                            isString={false}
                            placeholder=""
                            generating={generating.D}
                            onGenerate={() => generatePreview('D', 'module_d_count')}
                            onAdd={val => addManualItem('module_d_questions', val)}
                            onRemove={idx => removeItem('module_d_questions', idx)}
                            showManual={form.generation_method !== 'ai'}
                        />

                        {form.generation_method === 'ai' && (
                            <div style={{ marginTop: '12px', fontSize: '12px', color: '#64748b', textAlign: 'center' }}>
                                💡 AI content will be auto-generated when you create the test. Use "Generate Preview" buttons to preview content first.
                            </div>
                        )}
                    </SectionCard>

                    <div style={{ height: '14px' }} />

                    {/* Summary & Submit */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '14px 18px', background: '#1e293b', borderRadius: '12px',
                        border: '1px solid #334155', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#94a3b8', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span><BookOpen size={13} style={{ verticalAlign: 'middle' }} /> {form.module_a_count} Read</span>
                            <span><Headphones size={13} style={{ verticalAlign: 'middle' }} /> {form.module_b_count} Listen</span>
                            <span><MessageSquare size={13} style={{ verticalAlign: 'middle' }} /> {form.module_c_count} Topic</span>
                            <span><PenTool size={13} style={{ verticalAlign: 'middle' }} /> {form.module_d_count} Grammar</span>
                            <span><Clock size={13} style={{ verticalAlign: 'middle' }} /> {form.duration_minutes}m</span>
                            <span style={{ color: form.proctoring_enabled ? '#22c55e' : '#ef4444' }}>
                                <Shield size={13} style={{ verticalAlign: 'middle' }} /> {form.proctoring_enabled ? 'Proctored' : 'No Proctor'}
                            </span>
                            <span style={{ color: { ai: '#3b82f6', manual: '#f59e0b', mixed: '#8b5cf6' }[form.generation_method] }}>
                                <Wand2 size={13} style={{ verticalAlign: 'middle' }} /> {form.generation_method}
                            </span>
                        </div>
                        <button onClick={createTest} disabled={creating} style={{
                            padding: '12px 32px',
                            background: creating ? '#60a5fa' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                            color: 'white', border: 'none', borderRadius: '10px', cursor: creating ? 'not-allowed' : 'pointer',
                            fontWeight: 800, fontSize: '15px', boxShadow: '0 2px 10px rgba(59,130,246,0.35)',
                            display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s'
                        }}>
                            {creating ? <><Zap size={16} /> Creating...</> : <><Sparkles size={16} /> Create Assessment</>}
                        </button>
                    </div>
                </div>
            )}

            {/* ──── Tests List ──── */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>
                    <div style={{ width: '40px', height: '40px', border: '3px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
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
                        background: 'rgba(59,130,246,0.15)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center'
                    }}>
                        <MessageSquare size={32} color="#3b82f6" />
                    </div>
                    <p style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0', margin: '0 0 6px' }}>No communication tests yet</p>
                    <p style={{ fontSize: '13px', margin: 0 }}>Click "Create Test" above to build your first communication assessment</p>
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
                            borderLeft: `4px solid ${test.is_active ? '#3b82f6' : '#475569'}`,
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
                                    {test.description && <p style={{ margin: '0 0 12px', color: '#94a3b8', fontSize: '13px' }}>{test.description}</p>}

                                    {/* Module counts */}
                                    <div style={{
                                        display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '11px',
                                        padding: '8px 12px', background: '#0f172a', borderRadius: '8px'
                                    }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#3b82f6', fontWeight: 600 }}>
                                            <BookOpen size={12} /> {test.module_a_count} Read
                                        </span>
                                        <span style={{ color: '#475569' }}>|</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#8b5cf6', fontWeight: 600 }}>
                                            <Headphones size={12} /> {test.module_b_count} Listen
                                        </span>
                                        <span style={{ color: '#475569' }}>|</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#10b981', fontWeight: 600 }}>
                                            <MessageSquare size={12} /> {test.module_c_count} Topics
                                        </span>
                                        <span style={{ color: '#475569' }}>|</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#f59e0b', fontWeight: 600 }}>
                                            <PenTool size={12} /> {test.module_d_count} Grammar
                                        </span>
                                        <span style={{ color: '#475569' }}>|</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#94a3b8' }}>
                                            <Clock size={12} /> {test.duration_minutes}m
                                        </span>
                                        <span style={{ color: '#475569' }}>|</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#94a3b8' }}>
                                            <Shield size={12} /> {test.attempt_limit} attempt{test.attempt_limit > 1 ? 's' : ''}
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '6px', marginLeft: '16px' }}>
                                    <button onClick={() => loadAttempts(test.id)} title="View Attempts" style={{
                                        padding: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                                        borderRadius: '10px', cursor: 'pointer'
                                    }}><Eye size={16} color="#34d399" /></button>
                                    <button onClick={() => toggleTest(test.id)} title={test.is_active ? 'Deactivate' : 'Activate'} style={{
                                        padding: '8px', background: test.is_active ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
                                        border: '1px solid ' + (test.is_active ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)'),
                                        borderRadius: '10px', cursor: 'pointer'
                                    }}>
                                        {test.is_active ? <ToggleRight size={16} color="#fbbf24" /> : <ToggleLeft size={16} color="#34d399" />}
                                    </button>
                                    <button onClick={() => deleteTest(test.id)} title="Delete" style={{
                                        padding: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                        borderRadius: '10px', cursor: 'pointer'
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
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>#</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Module</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Read</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Listen</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Topic</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Grammar</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Overall</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Status</th>
                                                        <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #334155', color: '#94a3b8' }}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {attempts.map(a => (
                                                        <tr key={a.id} style={{ borderBottom: '1px solid #1e293b' }}>
                                                            <td style={{ padding: '8px', color: '#e2e8f0' }}>{a.student_name || a.student_id}</td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: '#cbd5e1' }}>#{a.attempt_number}</td>
                                                            <td style={{ padding: '8px', textAlign: 'center' }}>
                                                                <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                                                                    Module {a.current_module}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: a.module_a_score > 0 ? '#3b82f6' : '#6b7280' }}>
                                                                {a.module_a_score > 0 ? `${Math.round(a.module_a_score)}%` : '-'}
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: a.module_b_score > 0 ? '#8b5cf6' : '#6b7280' }}>
                                                                {a.module_b_score > 0 ? `${Math.round(a.module_b_score)}%` : '-'}
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: a.module_c_score > 0 ? '#10b981' : '#6b7280' }}>
                                                                {a.module_c_score > 0 ? `${Math.round(a.module_c_score)}%` : '-'}
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: a.module_d_score > 0 ? '#f59e0b' : '#6b7280' }}>
                                                                {a.module_d_score > 0 ? `${Math.round(a.module_d_score)}%` : '-'}
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center', color: '#f1f5f9', fontWeight: 600 }}>
                                                                {a.overall_score > 0 ? `${Math.round(a.overall_score)}%` : '-'}
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center' }}>
                                                                <span style={{
                                                                    padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                                                                    background: a.status === 'completed' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                                                                    color: statusColors[a.status] || '#9ca3af'
                                                                }}>
                                                                    {a.status}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '8px', textAlign: 'center' }}>
                                                                {a.status === 'completed' && (
                                                                    <button onClick={() => setViewDetail(a)} title="View Detailed Results" style={{
                                                                        padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(59,130,246,0.3)',
                                                                        background: 'rgba(59,130,246,0.1)', color: '#60a5fa', cursor: 'pointer',
                                                                        fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px'
                                                                    }}>
                                                                        <Eye size={12} /> Details
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Detailed Attempt Viewer */}
                            {viewDetail && viewAttempts === test.id && (
                                <AttemptDetailViewer attempt={viewDetail} onClose={() => setViewDetail(null)} />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}


/* ──── Detailed Attempt Viewer ──── */
function AttemptDetailViewer({ attempt, onClose }) {
    const [expanded, setExpanded] = useState({ A: true, B: false, C: false, D: false });
    const toggle = m => setExpanded(e => ({ ...e, [m]: !e[m] }));

    const modA = attempt.module_a_data;
    const modB = attempt.module_b_data;
    const modC = attempt.module_c_data;
    const modD = attempt.module_d_data;

    const scoreColor = s => s >= 70 ? '#10b981' : s >= 40 ? '#f59e0b' : '#ef4444';

    const SectionHeader = ({ module, label, icon, color, score }) => (
        <button onClick={() => toggle(module)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', background: `${color}12`, border: `1px solid ${color}30`,
            borderRadius: expanded[module] ? '10px 10px 0 0' : '10px', cursor: 'pointer',
            transition: 'all 0.2s'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                    width: 28, height: 28, borderRadius: '8px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', background: `${color}25`, color
                }}>{icon}</div>
                <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#f1f5f9' }}>{label}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Module {module}</div>
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '18px', fontWeight: 800, color: scoreColor(score) }}>
                    {score > 0 ? `${Math.round(score)}%` : '–'}
                </span>
                {expanded[module] ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
            </div>
        </button>
    );

    const DetailCard = ({ index, children }) => (
        <div style={{
            background: '#0f172a', borderRadius: '8px', padding: '12px 14px',
            border: '1px solid #1e293b', marginBottom: '8px'
        }}>
            <div style={{
                width: 22, height: 22, borderRadius: '50%', background: '#334155',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginRight: '10px',
                verticalAlign: 'middle', flexShrink: 0
            }}>{index}</div>
            {children}
        </div>
    );

    return (
        <div style={{
            marginTop: '16px', borderTop: '1px solid #334155', paddingTop: '16px'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                    <h4 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 800, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <BarChart3 size={18} color="#3b82f6" /> Detailed Results
                    </h4>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                        {attempt.student_name || attempt.student_id} — Attempt #{attempt.attempt_number}
                        {attempt.completed_at && <span> — {new Date(attempt.completed_at).toLocaleString()}</span>}
                    </div>
                </div>
                <button onClick={onClose} style={{
                    background: '#334155', border: 'none', cursor: 'pointer', color: '#94a3b8',
                    borderRadius: '8px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px',
                    fontSize: '12px', fontWeight: 600
                }}>
                    <X size={14} /> Close
                </button>
            </div>

            {/* Overall Score Banner */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '16px'
            }}>
                {[
                    { label: 'Read & Speak', score: attempt.module_a_score, color: '#3b82f6' },
                    { label: 'Listen & Repeat', score: attempt.module_b_score, color: '#8b5cf6' },
                    { label: 'Topic Speaking', score: attempt.module_c_score, color: '#10b981' },
                    { label: 'Grammar Quiz', score: attempt.module_d_score, color: '#f59e0b' },
                    { label: 'Overall', score: attempt.overall_score, color: '#60a5fa' },
                ].map(({ label, score, color }) => (
                    <div key={label} style={{
                        background: '#0f172a', borderRadius: '10px', padding: '10px', textAlign: 'center',
                        border: `1px solid ${color}30`
                    }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                        <div style={{ fontSize: '22px', fontWeight: 800, color: scoreColor(score) }}>
                            {score > 0 ? `${Math.round(score)}%` : '–'}
                        </div>
                    </div>
                ))}
            </div>

            {(attempt.proctoring_violations > 0 || attempt.auto_terminated) && (
                <div style={{
                    background: attempt.auto_terminated ? 'rgba(220,38,38,0.15)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${attempt.auto_terminated ? 'rgba(220,38,38,0.5)' : 'rgba(239,68,68,0.3)'}`,
                    borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '12px',
                    color: '#fca5a5'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: attempt.auto_terminated || attempt.violation_details ? '6px' : 0 }}>
                        <Shield size={14} />
                        <span style={{ fontWeight: 700 }}>
                            {attempt.auto_terminated
                                ? `🚫 AUTO-TERMINATED — ${attempt.proctoring_violations} violation(s)`
                                : `${attempt.proctoring_violations} proctoring violation(s) detected`}
                        </span>
                    </div>
                    {attempt.violation_details && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '11px', color: '#f87171' }}>
                            {attempt.violation_details.tab_switches > 0 && <span style={{ background: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: '4px' }}>Tab: {attempt.violation_details.tab_switches}</span>}
                            {attempt.violation_details.camera_blocked > 0 && <span style={{ background: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: '4px' }}>Camera: {attempt.violation_details.camera_blocked}</span>}
                            {attempt.violation_details.fullscreen_exits > 0 && <span style={{ background: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: '4px' }}>FS Exit: {attempt.violation_details.fullscreen_exits}</span>}
                            {attempt.violation_details.phone_detected > 0 && <span style={{ background: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: '4px' }}>Phone: {attempt.violation_details.phone_detected}</span>}
                            {attempt.violation_details.multiple_people > 0 && <span style={{ background: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: '4px' }}>People: {attempt.violation_details.multiple_people}</span>}
                            {attempt.violation_details.multiple_monitors > 0 && <span style={{ background: 'rgba(239,68,68,0.15)', padding: '2px 8px', borderRadius: '4px' }}>Monitors: {attempt.violation_details.multiple_monitors}</span>}
                        </div>
                    )}
                </div>
            )}

            {/* Module A: Read & Speak */}
            <div style={{ marginBottom: '10px' }}>
                <SectionHeader module="A" label="Read & Speak" icon={<BookOpen size={14} />} color="#3b82f6" score={attempt.module_a_score} />
                {expanded.A && (
                    <div style={{ background: '#1a2332', border: '1px solid #3b82f630', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '12px' }}>
                        {modA?.details?.length > 0 ? modA.details.map((d, i) => (
                            <DetailCard key={i} index={i + 1}>
                                <div style={{ display: 'inline', verticalAlign: 'middle' }}>
                                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Sentence:</div>
                                    <div style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '8px', fontStyle: 'italic' }}>"{d.sentence}"</div>
                                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Student said:</div>
                                    <div style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '8px', padding: '6px 10px', background: '#0f172a', borderRadius: '6px' }}>
                                        {d.transcript || <span style={{ color: '#64748b' }}>No transcript</span>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 700, color: scoreColor(d.score) }}>Score: {Math.round(d.score)}%</span>
                                        {d.feedback && <span style={{ fontSize: '12px', color: '#94a3b8' }}>{d.feedback}</span>}
                                    </div>
                                    {d.strengths?.length > 0 && (
                                        <div style={{ marginTop: '6px', fontSize: '11px', color: '#6ee7b7' }}>
                                            ✓ {d.strengths.join(' • ')}
                                        </div>
                                    )}
                                    {d.improvements?.length > 0 && (
                                        <div style={{ marginTop: '4px', fontSize: '11px', color: '#fbbf24' }}>
                                            ⚡ {d.improvements.join(' • ')}
                                        </div>
                                    )}
                                </div>
                            </DetailCard>
                        )) : (
                            <div style={{ fontSize: '12px', color: '#64748b', padding: '8px' }}>
                                {modA?.scores?.length > 0
                                    ? `${modA.scores.length} sentences completed — Per-sentence scores: ${modA.scores.map(s => Math.round(s) + '%').join(', ')}`
                                    : 'No detailed data available'}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Module B: Listen & Repeat */}
            <div style={{ marginBottom: '10px' }}>
                <SectionHeader module="B" label="Listen & Repeat" icon={<Headphones size={14} />} color="#8b5cf6" score={attempt.module_b_score} />
                {expanded.B && (
                    <div style={{ background: '#1a2332', border: '1px solid #8b5cf630', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '12px' }}>
                        {modB?.details?.length > 0 ? modB.details.map((d, i) => (
                            <DetailCard key={i} index={i + 1}>
                                <div style={{ display: 'inline', verticalAlign: 'middle' }}>
                                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Original sentence:</div>
                                    <div style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '8px', fontStyle: 'italic' }}>"{d.sentence}"</div>
                                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Student repeated:</div>
                                    <div style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '8px', padding: '6px 10px', background: '#0f172a', borderRadius: '6px' }}>
                                        {d.transcript || <span style={{ color: '#64748b' }}>No transcript</span>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 700, color: scoreColor(d.score) }}>Score: {Math.round(d.score)}%</span>
                                        {d.feedback && <span style={{ fontSize: '12px', color: '#94a3b8' }}>{d.feedback}</span>}
                                    </div>
                                </div>
                            </DetailCard>
                        )) : (
                            <div style={{ fontSize: '12px', color: '#64748b', padding: '8px' }}>
                                {modB?.scores?.length > 0
                                    ? `${modB.scores.length} sentences completed — Per-sentence scores: ${modB.scores.map(s => Math.round(s) + '%').join(', ')}`
                                    : 'No detailed data available'}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Module C: Topic Speaking */}
            <div style={{ marginBottom: '10px' }}>
                <SectionHeader module="C" label="Topic Speaking" icon={<MessageSquare size={14} />} color="#10b981" score={attempt.module_c_score} />
                {expanded.C && (
                    <div style={{ background: '#1a2332', border: '1px solid #10b98130', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '12px' }}>
                        {modC?.details?.length > 0 ? modC.details.map((d, i) => (
                            <DetailCard key={i} index={i + 1}>
                                <div style={{ display: 'inline', verticalAlign: 'middle' }}>
                                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Topic:</div>
                                    <div style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '8px', fontStyle: 'italic' }}>"{d.topic}"</div>
                                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Student's response:</div>
                                    <div style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '10px', padding: '8px 10px', background: '#0f172a', borderRadius: '6px', maxHeight: '120px', overflow: 'auto', lineHeight: 1.5 }}>
                                        {d.transcript || <span style={{ color: '#64748b' }}>No transcript</span>}
                                    </div>

                                    {/* Sub-scores grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
                                        {[
                                            { label: 'Relevance', val: d.relevance_score, max: 25, color: '#3b82f6' },
                                            { label: 'Grammar', val: d.grammar_score, max: 25, color: '#8b5cf6' },
                                            { label: 'Vocabulary', val: d.vocabulary_score, max: 25, color: '#10b981' },
                                            { label: 'Coherence', val: d.coherence_score, max: 25, color: '#f59e0b' },
                                        ].map(s => (
                                            <div key={s.label} style={{ textAlign: 'center', padding: '6px', background: '#0f172a', borderRadius: '6px' }}>
                                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>{s.label}</div>
                                                <div style={{ fontSize: '15px', fontWeight: 700, color: s.color }}>{s.val ?? '–'}<span style={{ fontSize: '10px', color: '#64748b' }}>/{s.max}</span></div>
                                            </div>
                                        ))}
                                    </div>

                                    <span style={{ fontSize: '13px', fontWeight: 700, color: scoreColor(d.score) }}>Overall: {Math.round(d.score)}/100</span>
                                    {d.feedback && (
                                        <div style={{ marginTop: '6px', fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                                            <strong style={{ color: '#94a3b8' }}>Feedback:</strong> {d.feedback}
                                        </div>
                                    )}
                                    {d.strengths?.length > 0 && (
                                        <div style={{ marginTop: '6px', fontSize: '11px', color: '#6ee7b7' }}>
                                            ✓ {d.strengths.join(' • ')}
                                        </div>
                                    )}
                                    {d.improvements?.length > 0 && (
                                        <div style={{ marginTop: '4px', fontSize: '11px', color: '#fbbf24' }}>
                                            ⚡ {d.improvements.join(' • ')}
                                        </div>
                                    )}
                                </div>
                            </DetailCard>
                        )) : (
                            <div style={{ fontSize: '12px', color: '#64748b', padding: '8px' }}>
                                {modC?.scores?.length > 0
                                    ? `${modC.scores.length} topics completed — Per-topic scores: ${modC.scores.map(s => Math.round(s) + '%').join(', ')}`
                                    : 'No detailed data available'}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Module D: Grammar Quiz */}
            <div style={{ marginBottom: '10px' }}>
                <SectionHeader module="D" label="Grammar Quiz" icon={<PenTool size={14} />} color="#f59e0b" score={attempt.module_d_score} />
                {expanded.D && (
                    <div style={{ background: '#1a2332', border: '1px solid #f59e0b30', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '12px' }}>
                        {modD?.review?.length > 0 ? modD.review.map((r, i) => (
                            <DetailCard key={i} index={i + 1}>
                                <div style={{ display: 'inline', verticalAlign: 'middle' }}>
                                    <div style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '6px' }}>{r.sentence}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        {r.correct
                                            ? <CheckCircle size={14} color="#10b981" />
                                            : <XCircle size={14} color="#ef4444" />}
                                        <span style={{ fontSize: '12px', color: r.correct ? '#6ee7b7' : '#fca5a5' }}>
                                            Student: "{r.user_answer}"
                                        </span>
                                        {!r.correct && (
                                            <span style={{ fontSize: '12px', color: '#6ee7b7' }}>
                                                Correct: "{r.correct_answer}"
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </DetailCard>
                        )) : (
                            <div style={{ fontSize: '12px', color: '#64748b', padding: '8px' }}>
                                {modD?.correct !== undefined
                                    ? `${modD.correct}/${modD.total} correct answers`
                                    : 'No detailed data available'}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}


/* ──── Module Content Editor (used per module in create form) ──── */
function ModuleContentEditor({ label, icon, color, items, isString, placeholder, generating, onGenerate, onAdd, onRemove, showManual }) {
    const [newItem, setNewItem] = useState('');
    const [newSentence, setNewSentence] = useState('');
    const [newAnswer, setNewAnswer] = useState('');
    const [newCategory, setNewCategory] = useState('tenses_past_simple');

    const categories = [
        'tenses_past_simple', 'tenses_present_continuous', 'tenses_past_continuous',
        'tenses_present_perfect', 'prepositions_time', 'prepositions_place',
        'prepositions_movement', 'articles', 'adverbs'
    ];

    const handleAddString = () => {
        if (newItem.trim()) {
            onAdd(newItem.trim());
            setNewItem('');
        }
    };

    const handleAddGrammar = () => {
        if (newSentence.trim() && newAnswer.trim()) {
            onAdd({ sentence: newSentence.trim(), answer: newAnswer.trim(), category: newCategory });
            setNewSentence(''); setNewAnswer('');
        }
    };

    return (
        <div style={{
            border: `1px solid ${color}30`, borderRadius: '10px', padding: '12px',
            background: `${color}08`
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color, fontSize: '13px', fontWeight: 700 }}>
                    {icon} {label}
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>
                        ({items?.length || 0} items)
                    </span>
                </div>
                <button onClick={onGenerate} disabled={generating}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 12px',
                        borderRadius: '6px', border: `1px solid ${color}40`,
                        background: `${color}15`, color, cursor: generating ? 'default' : 'pointer',
                        fontSize: '11px', fontWeight: 600, opacity: generating ? 0.7 : 1
                    }}
                >
                    {generating ? <RefreshCw size={12} className="spin" /> : <Wand2 size={12} />}
                    {generating ? 'Generating…' : 'AI Generate'}
                </button>
            </div>

            {/* Preview existing items */}
            {items && items.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px', maxHeight: '150px', overflowY: 'auto' }}>
                    {items.map((item, idx) => (
                        <div key={idx} style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '6px 10px', borderRadius: '6px', background: '#0f172a',
                            fontSize: '12px', color: '#cbd5e1'
                        }}>
                            <span style={{ color: '#64748b', fontSize: '10px', fontWeight: 600 }}>{idx + 1}.</span>
                            <span style={{ flex: 1 }}>{isString ? item : `${item.sentence} → ${item.answer}`}</span>
                            <button onClick={() => onRemove(idx)} style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#ef4444', padding: '2px'
                            }}><X size={12} /></button>
                        </div>
                    ))}
                </div>
            )}

            {/* Manual add */}
            {showManual && isString && (
                <div style={{ display: 'flex', gap: '6px' }}>
                    <input value={newItem} onChange={e => setNewItem(e.target.value)}
                        placeholder={placeholder}
                        onKeyDown={e => e.key === 'Enter' && handleAddString()}
                        style={{
                            flex: 1, padding: '7px 10px', borderRadius: '6px',
                            border: '1px solid #475569', background: '#0f172a', color: '#f1f5f9',
                            fontSize: '12px', outline: 'none'
                        }} />
                    <button onClick={handleAddString} style={{
                        padding: '7px 14px', borderRadius: '6px', border: 'none',
                        background: color, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                    }}>Add</button>
                </div>
            )}

            {showManual && !isString && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <input value={newSentence} onChange={e => setNewSentence(e.target.value)}
                        placeholder="Sentence with ___ blank"
                        style={{
                            flex: 2, padding: '7px 10px', borderRadius: '6px',
                            border: '1px solid #475569', background: '#0f172a', color: '#f1f5f9',
                            fontSize: '12px', outline: 'none', minWidth: '200px'
                        }} />
                    <input value={newAnswer} onChange={e => setNewAnswer(e.target.value)}
                        placeholder="Answer"
                        style={{
                            flex: 1, padding: '7px 10px', borderRadius: '6px',
                            border: '1px solid #475569', background: '#0f172a', color: '#f1f5f9',
                            fontSize: '12px', outline: 'none', minWidth: '80px'
                        }} />
                    <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
                        style={{
                            padding: '7px 10px', borderRadius: '6px',
                            border: '1px solid #475569', background: '#0f172a', color: '#f1f5f9',
                            fontSize: '11px', outline: 'none'
                        }}>
                        {categories.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                    </select>
                    <button onClick={handleAddGrammar} style={{
                        padding: '7px 14px', borderRadius: '6px', border: 'none',
                        background: color, color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                    }}>Add</button>
                </div>
            )}
        </div>
    );
}
