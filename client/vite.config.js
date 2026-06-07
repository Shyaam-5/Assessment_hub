import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
    const env = loadEnv(mode, __dirname, '')
    const googleClientId = (env.VITE_GOOGLE_CLIENT_ID || '').trim()
    const strictCrossOriginIsolation =
        env.VITE_STRICT_CROSS_ORIGIN_ISOLATION === 'true' ||
        env.VITE_STRICT_CROSS_ORIGIN_ISOLATION === '1'

    if (command === 'build' && process.env.RENDER === 'true') {
        const apiUrl = (env.VITE_API_URL || '').trim()
        if (!apiUrl || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(apiUrl)) {
            throw new Error('Set VITE_API_URL to your deployed backend URL in Render before building the frontend.')
        }
    }

    /** Hostnames allowed by the Vite dev server (required when using HTTPS tunnels like ngrok). */
    const hostSet = new Set()
    const publicApp = (env.VITE_PUBLIC_APP_URL || '').trim()
    if (publicApp) {
        try {
            hostSet.add(new URL(publicApp).hostname)
        } catch {
            /* ignore invalid URL */
        }
    }
    for (const part of (env.VITE_DEV_ALLOWED_HOSTS || '').split(',')) {
        const h = part.trim()
        if (h) hostSet.add(h)
    }
    const allowedHosts = hostSet.size > 0 ? [...hostSet] : true

    if (strictCrossOriginIsolation && googleClientId) {
        console.warn(
            '[vite] Ignoring VITE_STRICT_CROSS_ORIGIN_ISOLATION because Google Sign-In requires popup/postMessage support.',
        )
    }

    return {
        plugins: [react(), tailwindcss()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src')
            },
            dedupe: ['react', 'react-dom']
        },
        optimizeDeps: {
            include: ['react', 'react-dom', 'react/jsx-runtime']
        },
        server: {
            host: true,
            port: 5173,
            strictPort: true,
            allowedHosts,
            proxy: {
                '/api': {
                    target: 'http://localhost:8000',
                    changeOrigin: true,
                },
                '/socket.io': {
                    target: 'http://localhost:8000',
                    ws: true, // enable WebSocket proxying for socket.io
                    changeOrigin: true,
                },
            },
            // COOP + COEP enable crossOriginIsolated (SharedArrayBuffer / some TF.js).
            // They break Google Sign-In popups (blank gsi/transform). Opt-in only.
            ...(strictCrossOriginIsolation && !googleClientId
                ? {
                      headers: {
                          'Cross-Origin-Opener-Policy': 'same-origin',
                          'Cross-Origin-Embedder-Policy': 'require-corp',
                      },
                  }
                : {}),
        },
        build: {
            chunkSizeWarningLimit: 1400,
            rollupOptions: {
                output: {
                    manualChunks(id) {
                        if (!id.includes('node_modules')) return undefined
                        if (id.includes('@tensorflow') || id.includes('coco-ssd') || id.includes('blazeface')) return 'tensorflow'
                        if (id.includes('monaco-editor') || id.includes('@monaco-editor')) return 'monaco'
                        if (id.includes('recharts') || id.includes('d3-')) return 'charts'
                        if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')) return 'reports'
                        if (id.includes('socket.io-client') || id.includes('engine.io-client')) return 'realtime'
                        if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'react-vendor'
                        return undefined
                    },
                },
            },
        },
    }
})
