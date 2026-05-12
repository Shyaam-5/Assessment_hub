import { Brain, FileText, Layers, Code, Database } from 'lucide-react'

export const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api'
export const MAX_VIOLATIONS = 10

export const LANGUAGE_CONFIG = {
    'Python': { monacoLang: 'python', ext: '.py', defaultCode: `# Write your Python code here\n\ndef solution():\n    pass\n\nsolution()` },
    'JavaScript': { monacoLang: 'javascript', ext: '.js', defaultCode: `// Write your JavaScript code here\n\nfunction solution() {\n    \n}\n\nsolution();` },
    'Java': { monacoLang: 'java', ext: '.java', defaultCode: `public class Solution {\n    public static void main(String[] args) {\n    }\n}` },
    'C': { monacoLang: 'c', ext: '.c', defaultCode: `#include <stdio.h>\n\nint main() {\n    return 0;\n}` },
    'C++': { monacoLang: 'cpp', ext: '.cpp', defaultCode: `#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}` },
    'SQL': { monacoLang: 'sql', ext: '.sql', defaultCode: `-- Write your SQL query here\nSELECT * FROM table_name;` }
}

export const SECTION_META = {
    aptitude: { label: 'Aptitude', icon: Brain },
    verbal: { label: 'Verbal', icon: FileText },
    logical: { label: 'Logical', icon: Layers },
    coding: { label: 'Coding', icon: Code },
    sql: { label: 'SQL', icon: Database }
}

export function seededShuffle(arr, seed) {
    const a = [...arr]
    let i = a.length
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
    while (i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
    return a
}

export function generateSeed(studentId, testId) {
    let h = 0
    const s = `${studentId}-${testId}`
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0
    return Math.abs(h)
}

export const cleanCode = (code) => {
    if (!code) return ''
    let cleaned = code
    if (cleaned.includes('```')) {
        cleaned = cleaned.split('\n').filter(l => !l.trim().startsWith('```')).join('\n')
    }
    return cleaned
}
