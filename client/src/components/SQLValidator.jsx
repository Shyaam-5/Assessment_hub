import React, { useState, useEffect } from 'react'
import initSqlJs from 'sql.js'
import { Table, Copy, CheckCircle, XCircle, Database } from 'lucide-react'

function SQLValidator({ query, schemaContext }) {
    const [executing, setExecuting] = useState(false)
    const [executionResult, setExecutionResult] = useState(null)
    const [SQL, setSQL] = useState(null)
    const [dbLoading, setDbLoading] = useState(true)

    // Initialize SQL.js
    useEffect(() => {
        const init = async () => {
            try {
                const sql = await initSqlJs({
                    locateFile: file => `/${file}` // Point to public folder
                })
                setSQL(sql)
                setDbLoading(false)
            } catch (err) {
                console.error('Failed to initialize SQL.js:', err)
                setDbLoading(false)
            }
        }
        init()
    }, [])

    const executeAndVisualize = async () => {
        if (!query?.trim() || !SQL) return
        setExecuting(true)
        setExecutionResult(null)

        try {
            // Create a new in-memory database for each execution to ensure clean state
            const db = new SQL.Database()

            // 1. Run Schema (DDL)
            if (schemaContext?.trim()) {
                db.run(schemaContext)
            }

            // 2. Run student query
            const res = db.exec(query)

            if (res.length > 0) {
                const result = res[0]
                setExecutionResult({
                    success: true,
                    output: 'Success',
                    parsedData: {
                        columns: result.columns,
                        rows: result.values
                    }
                })
            } else {
                setExecutionResult({
                    success: true,
                    output: 'Query executed successfully. No rows returned.',
                    parsedData: { columns: [], rows: [] }
                })
            }

            db.close()
        } catch (error) {
            setExecutionResult({
                success: false,
                error: error.message || 'Execution failed'
            })
        } finally {
            setExecuting(false)
        }
    }

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text)
    }

    // Parse output into rows for display
    const getTableData = () => {
        if (!executionResult?.parsedData) return { columns: [], rows: [] }

        const { columns, rows } = executionResult.parsedData
        return { columns: columns || [], rows: rows || [] }
    }

    const { columns, rows } = getTableData()

    return (
        <div style={{ marginTop: '1rem' }}>
            {/* Run & Visualize Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={executeAndVisualize}
                        disabled={executing || !query?.trim() || dbLoading}
                        style={{
                            fontSize: '0.85rem',
                            padding: '0.6rem 1rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: executing || !query?.trim() || dbLoading ? 'not-allowed' : 'pointer',
                            opacity: executing || !query?.trim() || dbLoading ? 0.6 : 1,
                            fontWeight: 500
                        }}
                    >
                        {dbLoading ? (
                            <>
                                <span className="spinner-small"></span>
                                Initializing...
                            </>
                        ) : executing ? (
                            <>
                                <span className="spinner-small"></span>
                                Running...
                            </>
                        ) : (
                            <>
                                <Table size={16} />
                                Run & Visualize
                            </>
                        )}
                    </button>
                </div>

                {!dbLoading && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.75rem',
                        color: '#10b981',
                        background: 'rgba(16, 185, 129, 0.1)',
                        padding: '0.4rem 0.75rem',
                        borderRadius: '20px',
                        fontWeight: 600,
                        border: '1px solid rgba(16, 185, 129, 0.2)'
                    }}>
                        <Database size={12} />
                        WASM Sandbox Active
                    </div>
                )}
            </div>

            {/* Results Display */}
            {executionResult && (
                <div style={{
                    background: 'var(--bg-dark)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '1px solid var(--border-color)'
                }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        borderBottom: '1px solid var(--border-color)',
                        background: 'var(--bg-card)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {executionResult.success ? (
                                <>
                                    <CheckCircle size={16} color="#10b981" />
                                    <span style={{ fontWeight: 500, color: '#10b981' }}>Results</span>
                                </>
                            ) : (
                                <>
                                    <XCircle size={16} color="#ef4444" />
                                    <span style={{ fontWeight: 500, color: '#ef4444' }}>Error</span>
                                </>
                            )}
                        </div>
                        {executionResult.success && rows.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {rows.length} row(s) returned
                                </span>
                                <button
                                    onClick={() => copyToClipboard(executionResult.output || '')}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        padding: '0.3rem 0.6rem',
                                        fontSize: '0.75rem',
                                        background: 'rgba(255,255,255,0.1)',
                                        border: 'none',
                                        borderRadius: '4px',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Copy size={12} /> Copy
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Content */}
                    <div style={{ padding: '1rem' }}>
                        {executionResult.success ? (
                            <>
                                {columns.length > 0 && rows.length > 0 ? (
                                    <div style={{ overflowX: 'auto', maxHeight: '350px' }}>
                                        <table style={{
                                            width: '100%',
                                            borderCollapse: 'collapse',
                                            fontSize: '0.85rem'
                                        }}>
                                            <thead>
                                                <tr style={{
                                                    background: 'rgba(59, 130, 246, 0.1)',
                                                    position: 'sticky',
                                                    top: 0
                                                }}>
                                                    {columns.map((col, i) => (
                                                        <th key={i} style={{
                                                            padding: '0.75rem 1rem',
                                                            textAlign: 'left',
                                                            borderBottom: '2px solid var(--border-color)',
                                                            fontWeight: 600,
                                                            color: '#3b82f6',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {col}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rows.map((row, i) => (
                                                    <tr key={i} style={{
                                                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'
                                                    }}>
                                                        {row.map((cell, j) => (
                                                            <td key={j} style={{
                                                                padding: '0.6rem 1rem',
                                                                borderBottom: '1px solid var(--border-color)',
                                                                color: cell === null || cell === '' ? 'var(--text-muted)' : 'var(--text-main)'
                                                            }}>
                                                                {cell === null ? 'NULL' : cell}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div style={{
                                        padding: '1rem',
                                        textAlign: 'center',
                                        color: 'var(--text-muted)',
                                        fontStyle: 'italic'
                                    }}>
                                        Query executed successfully. No rows returned.
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={{
                                padding: '1rem',
                                background: 'rgba(239, 68, 68, 0.1)',
                                borderRadius: '8px',
                                border: '1px solid rgba(239, 68, 68, 0.2)'
                            }}>
                                <pre style={{
                                    margin: 0,
                                    fontSize: '0.85rem',
                                    color: '#f87171',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    fontFamily: 'monospace'
                                }}>
                                    {executionResult.error || executionResult.output || 'Unknown error'}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default SQLValidator
