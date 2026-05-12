import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Play, CheckCircle, XCircle, Clock, Eye, EyeOff, Trophy, AlertTriangle, Terminal, Code2 } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'

function CodeOutputPreview({
    problemId,
    code,
    language,
    onRunComplete,
    showRunButton = true,
    isGlobalTest = false,
}) {
    const [running, setRunning] = useState(false)
    const [results, setResults] = useState(null)
    const [activeTab, setActiveTab] = useState('all') // all, passed, failed

    const runWithTests = async () => {
        if (!code?.trim() || !problemId) return
        setRunning(true)
        setResults(null)

        try {
            const res = await axios.post(`${API_BASE}/run-with-tests`, {
                problemId,
                code,
                language,
                isGlobalTest
            })
            setResults(res.data)
            if (onRunComplete) {
                onRunComplete(res.data)
            }
        } catch (error) {
            setResults({
                success: false,
                error: error.response?.data?.error || 'Execution failed'
            })
        } finally {
            setRunning(false)
        }
    }

    const getFilteredResults = () => {
        if (!results?.testResults) return []
        switch (activeTab) {
            case 'passed':
                return results.testResults.filter(r => r.passed)
            case 'failed':
                return results.testResults.filter(r => !r.passed)
            default:
                return results.testResults
        }
    }

    const passedCount = results?.testResults?.filter(r => r.passed).length || 0
    const totalCount = results?.testResults?.length || 0
    const visibleTests = results?.testResults?.filter(r => !r.isHidden) || []
    const hiddenTests = results?.testResults?.filter(r => r.isHidden) || []

    return (
        <div>
            {/* Run Button */}
            {showRunButton && (
                <button
                    onClick={runWithTests}
                    disabled={running || !code?.trim()}
                    style={{
                        marginBottom: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        width: '100%',
                        justifyContent: 'center',
                        padding: '0.75rem 1.5rem',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        border: 'none',
                        borderRadius: '8px',
                        color: 'white',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        cursor: running || !code?.trim() ? 'not-allowed' : 'pointer',
                        opacity: running || !code?.trim() ? 0.6 : 1
                    }}
                >
                    {running ? (
                        <>
                            <span className="spinner-small"></span>
                            Running Tests...
                        </>
                    ) : (
                        <>
                            <Play size={16} />
                            Run with Test Cases
                        </>
                    )}
                </button>
            )}

            {/* Initial State - Before running */}
            {!results && !running && (
                <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    background: 'rgba(59, 130, 246, 0.05)',
                    borderRadius: '12px',
                    border: '1px solid rgba(59, 130, 246, 0.1)'
                }}>
                    <Terminal size={40} style={{ marginBottom: '0.75rem', color: '#3b82f6', opacity: 0.7 }} />
                    <div style={{ color: 'var(--text-main)', fontWeight: 500, marginBottom: '0.5rem' }}>Ready to Test</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Click "Run with Test Cases" to execute your code against all test cases
                    </div>
                </div>
            )}

            {/* Error State */}
            {results && !results.success && results.error && (
                <div style={{
                    padding: '1rem',
                    background: 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '12px',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    marginBottom: '1rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <AlertTriangle size={18} color="#ef4444" />
                        <span style={{ fontWeight: 600, color: '#ef4444' }}>Execution Error</span>
                    </div>
                    <pre style={{
                        margin: 0,
                        fontSize: '0.8rem',
                        color: '#f87171',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'monospace'
                    }}>
                        {results.error}
                    </pre>
                </div>
            )}

            {/* Results */}
            {results && results.testResults && (
                <div style={{
                    background: 'var(--bg-dark)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '1px solid var(--border-color)'
                }}>
                    {/* Summary Header */}
                    <div style={{
                        padding: '1rem',
                        background: passedCount === totalCount
                            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.1))'
                            : 'linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(234, 88, 12, 0.1))',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '1rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            {passedCount === totalCount ? (
                                <div style={{
                                    width: '50px', height: '50px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Trophy size={24} color="white" />
                                </div>
                            ) : (
                                <div style={{
                                    width: '50px', height: '50px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #f97316, #ea580c)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Code2 size={24} color="white" />
                                </div>
                            )}
                            <div>
                                <div style={{
                                    fontSize: '1.25rem',
                                    fontWeight: 700,
                                    color: passedCount === totalCount ? '#10b981' : '#f97316'
                                }}>
                                    {passedCount === totalCount ? 'All Tests Passed!' : `${passedCount}/${totalCount} Tests Passed`}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Score: {results.score || 0} / {results.totalPoints || 0} points
                                </div>
                            </div>
                        </div>

                        {/* Stats */}
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    color: '#10b981',
                                    fontWeight: 600
                                }}>
                                    <CheckCircle size={16} /> {passedCount}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Passed</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    color: '#ef4444',
                                    fontWeight: 600
                                }}>
                                    <XCircle size={16} /> {totalCount - passedCount}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Failed</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    color: '#8b5cf6',
                                    fontWeight: 600
                                }}>
                                    <EyeOff size={16} /> {hiddenTests.length}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Hidden</div>
                            </div>
                        </div>
                    </div>

                    {/* Filter Tabs */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
                        {['all', 'passed', 'failed'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    flex: 1,
                                    padding: '0.75rem',
                                    background: activeTab === tab ? 'var(--bg-card)' : 'transparent',
                                    border: 'none',
                                    borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                                    color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: 500,
                                    textTransform: 'capitalize'
                                }}
                            >
                                {tab === 'all' ? `All (${totalCount})` :
                                    tab === 'passed' ? `Passed (${passedCount})` :
                                        `Failed (${totalCount - passedCount})`}
                            </button>
                        ))}
                    </div>

                    {/* Test Case Results */}
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {getFilteredResults().map((testResult, index) => (
                            <TestCaseResult
                                key={testResult.testCaseId || index}
                                result={testResult}
                                index={index + 1}
                            />
                        ))}

                        {getFilteredResults().length === 0 && (
                            <div style={{
                                padding: '2rem',
                                textAlign: 'center',
                                color: 'var(--text-muted)'
                            }}>
                                No test cases in this category
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* No Test Cases Message */}
            {results && (!results.testResults || results.testResults.length === 0) && !results.error && (
                <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    background: 'var(--bg-dark)',
                    borderRadius: '12px',
                    color: 'var(--text-muted)'
                }}>
                    <Terminal size={40} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                    <div>No test cases found for this problem</div>
                    <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        Ask your mentor to add test cases
                    </div>
                </div>
            )}
        </div>
    )
}

// Individual Test Case Result Component
function TestCaseResult({ result, index }) {
    const [expanded, setExpanded] = useState(!result.passed)

    return (
        <div style={{
            borderBottom: '1px solid var(--border-color)',
            background: result.passed ? 'transparent' : 'rgba(239, 68, 68, 0.03)'
        }}>
            {/* Header */}
            <div
                onClick={() => !result.isHidden && setExpanded(!expanded)}
                style={{
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: result.isHidden ? 'default' : 'pointer',
                    transition: 'background 0.2s'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {result.passed ? (
                        <div style={{
                            width: '24px', height: '24px',
                            borderRadius: '50%',
                            background: 'rgba(16, 185, 129, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <CheckCircle size={14} color="#10b981" />
                        </div>
                    ) : (
                        <div style={{
                            width: '24px', height: '24px',
                            borderRadius: '50%',
                            background: 'rgba(239, 68, 68, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <XCircle size={14} color="#ef4444" />
                        </div>
                    )}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                                Test Case {index}
                            </span>
                            {result.isHidden && (
                                <span style={{
                                    padding: '0.15rem 0.5rem',
                                    background: 'rgba(139, 92, 246, 0.2)',
                                    color: '#a78bfa',
                                    borderRadius: '4px',
                                    fontSize: '0.65rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                }}>
                                    <EyeOff size={10} /> Hidden
                                </span>
                            )}
                        </div>
                        {result.description && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                {result.description}
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {result.executionTime && (
                        <span style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                        }}>
                            <Clock size={12} /> {result.executionTime}ms
                        </span>
                    )}
                    <span style={{
                        padding: '0.25rem 0.5rem',
                        background: result.passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: result.passed ? '#10b981' : '#ef4444',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600
                    }}>
                        {result.points || 0} pts
                    </span>
                </div>
            </div>

            {/* Expanded Details (only for visible test cases) */}
            {!result.isHidden && expanded && (
                <div style={{
                    padding: '0 1rem 1rem 3.5rem',
                    display: 'grid',
                    gap: '0.75rem'
                }}>
                    {/* Input */}
                    <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                            Input
                        </div>
                        <pre style={{
                            margin: 0,
                            padding: '0.5rem 0.75rem',
                            background: 'var(--bg-card)',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                        }}>
                            {String(result.input ?? '(no input)')}
                        </pre>
                    </div>

                    {/* Expected Output */}
                    <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                            Expected Output
                        </div>
                        <pre style={{
                            margin: 0,
                            padding: '0.5rem 0.75rem',
                            background: 'rgba(16, 185, 129, 0.1)',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            color: '#10b981',
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            border: '1px solid rgba(16, 185, 129, 0.2)'
                        }}>
                            {String(result.expectedOutput || result.expected_output || '(empty)')}
                        </pre>
                    </div>

                    {/* Actual Output */}
                    <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                            Your Output
                        </div>
                        <pre style={{
                            margin: 0,
                            padding: '0.5rem 0.75rem',
                            background: result.passed ? 'rgba(30, 41, 59, 0.4)' : 'rgba(239, 68, 68, 0.05)',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            color: result.passed ? '#e2e8f0' : '#ef4444',
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            border: `1px solid ${result.passed ? 'rgba(255, 255, 255, 0.05)' : 'rgba(239, 68, 68, 0.1)'}`
                        }}>
                            {String(result.actualOutput || result.output || '(no output)')}
                        </pre>
                    </div>
                </div>
            )}

            {/* Hidden test message */}
            {result.isHidden && (
                <div style={{
                    padding: '0 1rem 0.75rem 3.5rem',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    fontStyle: 'italic'
                }}>
                    {result.passed
                        ? '✓ Your code passed this hidden test case'
                        : '✗ Your code failed this hidden test case. Details are hidden.'}
                </div>
            )}
        </div>
    )
}

export default CodeOutputPreview
