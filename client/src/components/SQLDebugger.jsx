import React, { useState, useEffect } from 'react'
import { Play, StepForward, Activity, AlertCircle, CheckCircle2, Layers, Database } from 'lucide-react'
import initSqlJs from 'sql.js'

// Locally break down a SELECT query into logical execution steps
function breakdownQuery(query) {
    if (!query || !query.trim()) return []

    const q = query.trim()
    const steps = []

    // Normalize: remove extra whitespace
    const normalized = q.replace(/\s+/g, ' ')

    // Extract parts using regex
    const fromMatch = normalized.match(/FROM\s+(.+?)(?:\s+WHERE|\s+GROUP\s+BY|\s+HAVING|\s+ORDER\s+BY|\s+LIMIT|\s*;?\s*$)/i)
    const whereMatch = normalized.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+HAVING|\s+ORDER\s+BY|\s+LIMIT|\s*;?\s*$)/i)
    const groupByMatch = normalized.match(/GROUP\s+BY\s+(.+?)(?:\s+HAVING|\s+ORDER\s+BY|\s+LIMIT|\s*;?\s*$)/i)
    const havingMatch = normalized.match(/HAVING\s+(.+?)(?:\s+ORDER\s+BY|\s+LIMIT|\s*;?\s*$)/i)
    const orderByMatch = normalized.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|\s*;?\s*$)/i)
    const limitMatch = normalized.match(/LIMIT\s+(\d+)/i)

    const fromClause = fromMatch ? fromMatch[1].trim() : null

    if (!fromClause) {
        // Simple query without FROM (e.g., SELECT 1+1)
        steps.push({
            stepName: 'Execute',
            description: 'Run the full query',
            query: q
        })
        return steps
    }

    // Step 1: FROM — Show all base data
    steps.push({
        stepName: '1. FROM (Base Data)',
        description: `Load all rows from: ${fromClause}`,
        query: `SELECT * FROM ${fromClause};`
    })

    // Step 2: WHERE — Filter rows
    if (whereMatch) {
        steps.push({
            stepName: '2. WHERE (Filter)',
            description: `Apply filter: ${whereMatch[1].trim()}`,
            query: `SELECT * FROM ${fromClause} WHERE ${whereMatch[1].trim()};`
        })
    }

    // Step 3: GROUP BY
    if (groupByMatch) {
        const groupCols = groupByMatch[1].trim()
        let groupQuery = `SELECT ${groupCols}, COUNT(*) as count FROM ${fromClause}`
        if (whereMatch) groupQuery += ` WHERE ${whereMatch[1].trim()}`
        groupQuery += ` GROUP BY ${groupCols}`
        if (havingMatch) groupQuery += ` HAVING ${havingMatch[1].trim()}`
        groupQuery += ';'

        steps.push({
            stepName: '3. GROUP BY (Aggregate)',
            description: `Group rows by: ${groupCols}${havingMatch ? ` with HAVING: ${havingMatch[1].trim()}` : ''}`,
            query: groupQuery
        })
    }

    // Step 4: SELECT (Projection) — the full query minus ORDER BY and LIMIT
    let projectionQuery = normalized.replace(/\s*ORDER\s+BY\s+.+?(?=\s+LIMIT|\s*;?\s*$)/i, '').replace(/\s*LIMIT\s+\d+/i, '').replace(/;?\s*$/, ';')
    if (projectionQuery !== q.replace(/;?\s*$/, ';')) {
        steps.push({
            stepName: `${groupByMatch ? '4' : whereMatch ? '3' : '2'}. SELECT (Projection)`,
            description: 'Apply column selection and expressions',
            query: projectionQuery
        })
    }

    // Step 5: ORDER BY + LIMIT — Full query
    if (orderByMatch || limitMatch) {
        steps.push({
            stepName: `${steps.length + 1}. Final Result`,
            description: `${orderByMatch ? `Sort by: ${orderByMatch[1].trim()}` : ''}${limitMatch ? ` | Limit: ${limitMatch[1]}` : ''}`,
            query: q.replace(/;?\s*$/, ';')
        })
    }

    // Always add the final full query as last step if not already there
    const lastQuery = steps[steps.length - 1]?.query?.replace(/;\s*$/, '').trim().toLowerCase()
    const fullQuery = q.replace(/;\s*$/, '').trim().toLowerCase()
    if (lastQuery !== fullQuery) {
        steps.push({
            stepName: `${steps.length + 1}. Final Result`,
            description: 'Complete query output',
            query: q.replace(/;?\s*$/, ';')
        })
    }

    return steps
}

function SQLDebugger({ query, schema }) {
    const [steps, setSteps] = useState([])
    const [currentStepIdx, setCurrentStepIdx] = useState(0)
    const [loading, setLoading] = useState(false)
    const [stepResults, setStepResults] = useState({})
    const [error, setError] = useState(null)
    const [SQL, setSQL] = useState(null)
    const [dbReady, setDbReady] = useState(false)

    // Initialize SQL.js WASM
    useEffect(() => {
        const init = async () => {
            try {
                const sql = await initSqlJs({
                    locateFile: file => `/${file}`
                })
                setSQL(sql)
                setDbReady(true)
            } catch (err) {
                console.error('Failed to init SQL.js:', err)
            }
        }
        init()
    }, [])

    const runStepLocally = (db, stepQuery) => {
        try {
            const results = db.exec(stepQuery)
            if (results.length > 0) {
                return { columns: results[0].columns, rows: results[0].values }
            }
            return { columns: [], rows: [] }
        } catch (err) {
            return { error: err.message }
        }
    }

    const startDebugging = () => {
        if (!query || !SQL) return
        setLoading(true)
        setError(null)
        setStepResults({})

        try {
            // Break down query into steps locally
            const querySteps = breakdownQuery(query)
            if (querySteps.length === 0) {
                setError('Could not break down the query. Make sure it is a valid SELECT statement.')
                setLoading(false)
                return
            }

            setSteps(querySteps)
            setCurrentStepIdx(0)

            // Create a single DB instance with schema, run the first step
            const db = new SQL.Database()
            if (schema?.trim()) {
                db.run(schema)
            }

            // Run all steps at once (they all share the same data)
            const allResults = {}
            for (let i = 0; i < querySteps.length; i++) {
                allResults[i] = runStepLocally(db, querySteps[i].query)
            }

            setStepResults(allResults)
            db.close()
        } catch (err) {
            setError(err.message || 'Failed to analyze query.')
        } finally {
            setLoading(false)
        }
    }

    const handleNextStep = () => {
        if (currentStepIdx < steps.length - 1) {
            setCurrentStepIdx(currentStepIdx + 1)
        }
    }

    const handlePrevStep = () => {
        if (currentStepIdx > 0) {
            setCurrentStepIdx(currentStepIdx - 1)
        }
    }

    return (
        <div className="sql-debugger-panel animate-fadeIn">
            <div className="debugger-header" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1.25rem',
                borderBottom: '1px solid var(--border-color)',
                background: 'rgba(59, 130, 246, 0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Layers size={20} color="#3b82f6" />
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Step-Wise Debugger</h3>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Trace query logic layer by layer</p>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {dbReady && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            fontSize: '0.7rem', color: '#10b981',
                            background: 'rgba(16, 185, 129, 0.1)',
                            padding: '0.35rem 0.7rem', borderRadius: '20px', fontWeight: 600,
                            border: '1px solid rgba(16, 185, 129, 0.2)'
                        }}>
                            <Database size={12} /> WASM
                        </div>
                    )}
                    <button
                        onClick={startDebugging}
                        disabled={loading || !dbReady}
                        style={{
                            padding: '0.6rem 1.25rem',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            cursor: loading || !dbReady ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            opacity: loading || !dbReady ? 0.6 : 1
                        }}
                    >
                        <Play size={16} /> {steps.length > 0 ? 'Restart Trace' : 'Trace Query'}
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ padding: '1rem 1.25rem', background: 'rgba(239, 68, 68, 0.1)', borderBottom: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertCircle size={16} color="#ef4444" />
                    <span style={{ fontSize: '0.85rem', color: '#f87171' }}>{error}</span>
                </div>
            )}

            <div className="debugger-content" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', minHeight: '400px' }}>
                {/* Steps Sidebar */}
                <div className="steps-sidebar" style={{ borderRight: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.1)' }}>
                    {steps.map((step, idx) => (
                        <div
                            key={idx}
                            onClick={() => setCurrentStepIdx(idx)}
                            style={{
                                padding: '1rem 1.25rem',
                                borderBottom: '1px solid rgba(255,255,255,0.03)',
                                cursor: 'pointer',
                                background: currentStepIdx === idx ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '0.75rem',
                                transition: 'background 0.2s'
                            }}
                        >
                            <div style={{
                                width: '24px', height: '24px', borderRadius: '50%',
                                background: stepResults[idx]?.error ? '#ef4444' : (idx <= currentStepIdx ? '#10b981' : 'var(--bg-dark)'),
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.75rem', fontWeight: 800, color: 'white',
                                marginTop: '2px', flexShrink: 0
                            }}>
                                {stepResults[idx]?.error ? '!' : (idx < currentStepIdx ? <CheckCircle2 size={14} /> : idx + 1)}
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{step.stepName}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{step.description}</div>
                                {stepResults[idx] && !stepResults[idx].error && (
                                    <div style={{ fontSize: '0.65rem', color: '#10b981', marginTop: '3px' }}>
                                        {stepResults[idx].rows.length} row(s)
                                    </div>
                                )}
                            </div>
                            {currentStepIdx === idx && (
                                <div style={{
                                    position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                                    width: '3px', height: '60%', background: '#3b82f6', borderRadius: '3px 0 0 3px'
                                }} />
                            )}
                        </div>
                    ))}
                    {steps.length === 0 && (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            <Activity size={32} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                            <p>Click "Trace Query" to analyze SQL logic steps.</p>
                        </div>
                    )}
                </div>

                {/* Execution Result Area */}
                <div className="result-area" style={{ display: 'flex', flexDirection: 'column' }}>
                    {steps.length > 0 ? (
                        <>
                            <div className="step-query-info" style={{ padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.2)' }}>
                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#10b981', fontWeight: 700, marginBottom: '0.5rem' }}>
                                    Current Operation Query
                                </div>
                                <div style={{
                                    background: '#020617',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px',
                                    fontFamily: 'monospace',
                                    fontSize: '0.85rem',
                                    color: '#cbd5e1',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {steps[currentStepIdx]?.query}
                                </div>
                            </div>

                            <div className="step-data-preview" style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
                                {stepResults[currentStepIdx]?.error ? (
                                    <div style={{
                                        padding: '1rem',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(239, 68, 68, 0.2)'
                                    }}>
                                        <pre style={{ margin: 0, fontSize: '0.85rem', color: '#f87171', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                                            {stepResults[currentStepIdx].error}
                                        </pre>
                                    </div>
                                ) : stepResults[currentStepIdx] ? (
                                    <div className="debugger-table-container">
                                        {stepResults[currentStepIdx].columns.length > 0 && stepResults[currentStepIdx].rows.length > 0 ? (
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                <thead>
                                                    <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                                        {stepResults[currentStepIdx].columns.map((col, i) => (
                                                            <th key={i} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid var(--border-color)', color: '#3b82f6', fontWeight: 600 }}>{col}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {stepResults[currentStepIdx].rows.map((row, i) => (
                                                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                            {row.map((cell, j) => (
                                                                <td key={j} style={{ padding: '0.75rem', color: cell === null ? 'var(--text-muted)' : 'var(--text-main)' }}>
                                                                    {cell === null ? 'NULL' : String(cell)}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                Query executed successfully. No rows returned.
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5 }}>
                                        <AlertCircle size={32} />
                                        <p style={{ marginTop: '1rem' }}>No data for this step.</p>
                                    </div>
                                )}
                            </div>

                            <div className="debugger-footer" style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Step {currentStepIdx + 1} of {steps.length}
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    {currentStepIdx > 0 && (
                                        <button
                                            onClick={handlePrevStep}
                                            style={{
                                                padding: '0.5rem 1.25rem',
                                                background: 'rgba(255,255,255,0.05)',
                                                color: 'var(--text-main)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                fontSize: '0.85rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem'
                                            }}
                                        >
                                            ← Previous
                                        </button>
                                    )}
                                    {currentStepIdx < steps.length - 1 && (
                                        <button
                                            onClick={handleNextStep}
                                            style={{
                                                padding: '0.5rem 1.25rem',
                                                background: 'var(--primary)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '8px',
                                                fontSize: '0.85rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem'
                                            }}
                                        >
                                            Next Step <StepForward size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '3rem', textAlign: 'center' }}>
                            <div style={{
                                width: '64px', height: '64px', borderRadius: '20px',
                                background: 'rgba(59, 130, 246, 0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                marginBottom: '1.5rem'
                            }}>
                                <Layers size={32} color="#3b82f6" />
                            </div>
                            <h4 style={{ margin: '0 0 0.5rem 0' }}>Ready to Debug</h4>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '400px' }}>
                                The debugger will break your SQL query into physical execution steps so you can see how data flows through JOINs and WHERE clauses.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .sql-debugger-panel {
                    border-radius: 20px;
                    overflow: hidden;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    box-shadow: var(--glass-shadow);
                }
                .debugger-table-container {
                    border-radius: 12px;
                    border: 1px solid rgba(255,255,255,0.05);
                    overflow: hidden;
                    background: #020617;
                }
            `}</style>
        </div>
    )
}

export default SQLDebugger
