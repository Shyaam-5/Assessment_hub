import React, { useState, useEffect } from 'react'
import { Database, Table as TableIcon, Key, Link as LinkIcon, ChevronDown, ChevronUp, Hash, Type, Calendar, ToggleLeft } from 'lucide-react'

// Local schema parser — no AI/API needed
function parseSchemaLocally(schema) {
    if (!schema || !schema.trim()) return { tables: [] }

    const tables = []
    // Match CREATE TABLE blocks
    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\)\s*;/gi
    let match

    while ((match = tableRegex.exec(schema)) !== null) {
        const tableName = match[1]
        const body = match[2]
        const columns = []

        // Find primary key defined as table constraint
        const pkConstraintMatch = body.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i)
        const pkColumns = pkConstraintMatch
            ? pkConstraintMatch[1].split(',').map(c => c.trim().replace(/[`"']/g, '').toLowerCase())
            : []

        // Find foreign key constraints
        const fkRegex = /FOREIGN\s+KEY\s*\(\s*[`"']?(\w+)[`"']?\s*\)\s*REFERENCES\s+[`"']?(\w+)[`"']?\s*\(\s*[`"']?(\w+)[`"']?\s*\)/gi
        const foreignKeys = {}
        let fkMatch
        while ((fkMatch = fkRegex.exec(body)) !== null) {
            foreignKeys[fkMatch[1].toLowerCase()] = { table: fkMatch[2], column: fkMatch[3] }
        }

        // Parse column definitions line by line
        const lines = body.split('\n').map(l => l.trim().replace(/,\s*$/, '')).filter(l => l.length > 0)

        for (const line of lines) {
            // Skip constraint lines
            if (/^\s*(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT|INDEX|KEY\s)/i.test(line)) continue

            // Match: column_name TYPE(...) [constraints]
            const colMatch = line.match(/^[`"']?(\w+)[`"']?\s+(\w+(?:\s*\([^)]*\))?)\s*(.*)?$/i)
            if (!colMatch) continue

            const colName = colMatch[1]
            const colType = colMatch[2]
            const constraints = colMatch[3] || ''

            const isPK = pkColumns.includes(colName.toLowerCase()) || /PRIMARY\s+KEY/i.test(constraints)
            const isFK = foreignKeys.hasOwnProperty(colName.toLowerCase())

            columns.push({
                name: colName,
                type: colType,
                isPrimaryKey: isPK,
                isForeignKey: isFK,
                isNotNull: /NOT\s+NULL/i.test(constraints),
                isAutoIncrement: /AUTO_INCREMENT|AUTOINCREMENT/i.test(constraints),
                defaultValue: constraints.match(/DEFAULT\s+([^\s,]+)/i)?.[1] || null,
                references: isFK ? foreignKeys[colName.toLowerCase()] : null
            })
        }

        if (columns.length > 0) {
            tables.push({ name: tableName, columns })
        }
    }

    return { tables }
}

// Get icon for column type
function getTypeIcon(type) {
    const t = (type || '').toLowerCase()
    if (t.includes('int') || t.includes('decimal') || t.includes('float') || t.includes('double') || t.includes('numeric')) return <Hash size={12} color="#f59e0b" />
    if (t.includes('char') || t.includes('text') || t.includes('varchar')) return <Type size={12} color="#3b82f6" />
    if (t.includes('date') || t.includes('time') || t.includes('timestamp')) return <Calendar size={12} color="#8b5cf6" />
    if (t.includes('bool')) return <ToggleLeft size={12} color="#10b981" />
    return <Hash size={12} color="#64748b" />
}

function SQLVisualizer({ schema }) {
    const [data, setData] = useState(null)
    const [expandedTables, setExpandedTables] = useState({})

    useEffect(() => {
        if (schema) {
            const parsed = parseSchemaLocally(schema)
            setData(parsed)
            if (parsed.tables) {
                const initialExpanded = {}
                parsed.tables.forEach(t => initialExpanded[t.name] = true)
                setExpandedTables(initialExpanded)
            }
        }
    }, [schema])

    const toggleTable = (name) => {
        setExpandedTables(prev => ({ ...prev, [name]: !prev[name] }))
    }

    if (!data || !data.tables || data.tables.length === 0) {
        return (
            <div className="glass" style={{ padding: '2rem', textAlign: 'center', borderRadius: '16px' }}>
                <Database size={32} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No schema detected for this problem.</p>
            </div>
        )
    }

    // Collect relationships for summary
    const relationships = []
    data.tables.forEach(table => {
        table.columns.forEach(col => {
            if (col.isForeignKey && col.references) {
                relationships.push({
                    from: table.name,
                    fromCol: col.name,
                    to: col.references.table,
                    toCol: col.references.column
                })
            }
        })
    })

    return (
        <div className="sql-visualizer animate-fadeIn">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div style={{
                    padding: '0.5rem',
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    borderRadius: '10px',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                }}>
                    <Database size={20} color="white" />
                </div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Database Map</h3>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Interactive Entity Relationship View &bull; {data.tables.length} table(s) detected
                    </p>
                </div>
                <div style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.7rem',
                    color: '#10b981',
                    background: 'rgba(16, 185, 129, 0.1)',
                    padding: '0.35rem 0.7rem',
                    borderRadius: '20px',
                    fontWeight: 600,
                    border: '1px solid rgba(16, 185, 129, 0.2)'
                }}>
                    ⚡ Local Parse
                </div>
            </div>

            {/* Relationships Summary */}
            {relationships.length > 0 && (
                <div style={{
                    marginBottom: '1.5rem',
                    padding: '0.75rem 1rem',
                    background: 'rgba(139, 92, 246, 0.08)',
                    borderRadius: '12px',
                    border: '1px solid rgba(139, 92, 246, 0.15)'
                }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a78bfa', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Relationships
                    </div>
                    {relationships.map((rel, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                            <span style={{ fontWeight: 600, color: '#3b82f6' }}>{rel.from}</span>
                            <span style={{ color: 'var(--text-muted)' }}>.{rel.fromCol}</span>
                            <span style={{ color: '#f59e0b' }}>→</span>
                            <span style={{ fontWeight: 600, color: '#10b981' }}>{rel.to}</span>
                            <span style={{ color: 'var(--text-muted)' }}>.{rel.toCol}</span>
                        </div>
                    ))}
                </div>
            )}

            <div className="er-diagram-container" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '1.5rem'
            }}>
                {data.tables.map((table) => (
                    <div key={table.name} className="glass table-card" style={{
                        borderRadius: '16px',
                        overflow: 'hidden',
                        border: '1px solid var(--glass-border)',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                        background: 'var(--glass-bg)',
                        transition: 'all 0.3s ease'
                    }}>
                        <div
                            onClick={() => toggleTable(table.name)}
                            style={{
                                padding: '1rem',
                                background: 'rgba(59, 130, 246, 0.1)',
                                borderBottom: expandedTables[table.name] ? '1px solid var(--glass-border)' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <TableIcon size={18} color="#3b82f6" />
                                <span style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '-0.01em' }}>{table.name}</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>
                                    {table.columns.length} cols
                                </span>
                            </div>
                            {expandedTables[table.name] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>

                        {expandedTables[table.name] && (
                            <div className="table-columns" style={{ padding: '0.5rem 0' }}>
                                {table.columns.map((col, idx) => (
                                    <div key={idx} className="column-row" style={{
                                        padding: '0.6rem 1rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: '0.85rem',
                                        borderBottom: idx === table.columns.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.03)'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            {col.isPrimaryKey ? (
                                                <Key size={14} color="#f59e0b" title="Primary Key" />
                                            ) : col.isForeignKey ? (
                                                <LinkIcon size={14} color="#10b981" title={`FK → ${col.references?.table}`} />
                                            ) : (
                                                getTypeIcon(col.type)
                                            )}
                                            <span style={{ fontWeight: (col.isPrimaryKey || col.isForeignKey) ? 600 : 400 }}>{col.name}</span>
                                            {col.isPrimaryKey && (
                                                <span style={{ fontSize: '0.6rem', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>PK</span>
                                            )}
                                            {col.isForeignKey && (
                                                <span style={{ fontSize: '0.6rem', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>FK</span>
                                            )}
                                            {col.isNotNull && (
                                                <span style={{ fontSize: '0.6rem', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>NN</span>
                                            )}
                                        </div>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                            {col.type?.toLowerCase()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <style>{`
                .table-card:hover {
                    transform: translateY(-5px);
                    border-color: var(--primary);
                    box-shadow: 0 15px 35px rgba(59, 130, 246, 0.15);
                }
                .column-row:hover {
                    background: rgba(255, 255, 255, 0.05);
                }
                .sql-visualizer {
                    padding: 1.5rem;
                    background: rgba(15, 23, 42, 0.2);
                    border-radius: 20px;
                    border: 1px solid var(--border-color);
                }
            `}</style>
        </div>
    )
}

export default SQLVisualizer
