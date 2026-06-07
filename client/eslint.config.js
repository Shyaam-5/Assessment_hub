import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
    {
        ignores: ['dist/**', 'node_modules/**'],
    },
    {
        files: ['**/*.{js,jsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.es2024,
            },
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        plugins: {
            'react-hooks': reactHooks,
        },
        rules: {
            'no-undef': 'off',
            'no-unused-vars': 'off',
            'react-hooks/exhaustive-deps': 'off',
        },
    },
]
