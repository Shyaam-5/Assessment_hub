import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, __dirname, '')

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

    return {
        plugins: [react()],
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
            ...(env.VITE_STRICT_CROSS_ORIGIN_ISOLATION === 'true' ||
            env.VITE_STRICT_CROSS_ORIGIN_ISOLATION === '1'
                ? {
                      headers: {
                          'Cross-Origin-Opener-Policy': 'same-origin',
                          'Cross-Origin-Embedder-Policy': 'require-corp',
                      },
                  }
                : {}),
        }
    }
})
