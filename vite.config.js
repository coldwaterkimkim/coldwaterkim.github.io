import { defineConfig } from 'vite'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const htmlDirs = ['.', 'posts', 'daily', 'programs', 'nasajab', 'admin']
const liveCmsUrl = 'https://api.coldwaterkim.com'
const useLiveCmsProxy = process.env.VITE_CMS_TARGET === 'live'
const siteVersion = resolveSiteVersion()

// Helper to find all public HTML entry files
function getHtmlEntries() {
    const pages = {}

    htmlDirs.forEach(dir => {
        const absoluteDir = path.resolve(__dirname, dir)
        if (!fs.existsSync(absoluteDir)) return

        fs.readdirSync(absoluteDir)
            .filter(file => file.endsWith('.html'))
            .forEach(file => {
                const basename = file.replace('.html', '')
                const name = dir === '.' ? basename : `${dir}/${basename}`
                pages[name] = path.resolve(absoluteDir, file)
            })
    })

    return pages
}

function resolveSiteVersion() {
    const fromEnv = process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA
    if (fromEnv) return fromEnv.slice(0, 12)

    try {
        return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim().slice(0, 12)
    } catch (e) {
        return String(Date.now())
    }
}

function versionManifestPlugin() {
    return {
        name: 'coldwaterkim-version-manifest',
        generateBundle() {
            this.emitFile({
                type: 'asset',
                fileName: 'site-version.json',
                source: `${JSON.stringify({
                    version: siteVersion,
                    builtAt: new Date().toISOString(),
                }, null, 2)}\n`,
            })
        },
    }
}

export default defineConfig({
    define: {
        __SITE_VERSION__: JSON.stringify(siteVersion),
    },
    plugins: [
        versionManifestPlugin(),
    ],
    server: useLiveCmsProxy
        ? {
            proxy: {
                '/api': {
                    target: liveCmsUrl,
                    changeOrigin: true,
                    secure: true,
                },
            },
        }
        : undefined,
    build: {
        rollupOptions: {
            input: getHtmlEntries(),
        },
    },
})
