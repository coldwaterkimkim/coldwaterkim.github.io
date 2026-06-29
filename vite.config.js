import { defineConfig } from 'vite'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const htmlDirs = ['.', 'posts', 'daily', 'programs', 'nasajab', 'admin']
const liveCmsUrl = 'https://api.coldwaterkim.com'
const cmsTarget = String(process.env.VITE_CMS_TARGET || '').toLowerCase()
const useLiveCmsProxy = cmsTarget === 'live'
const useSameOriginCms = ['same-origin', 'self', 'imac', 'home'].includes(cmsTarget)
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

function localEmojiMartDataPlugin() {
    const cdnBase = 'https://cdn.jsdelivr.net/npm/@emoji-mart/data@latest'
    const localBase = '/emoji-mart-data'
    const emojiDatasourceBase = 'https://cdn.jsdelivr.net/npm/emoji-datasource-${e.set}@15.0.1/img/${e.set}'
    const localEmojiDatasourceBase = '/emoji-datasource/${e.set}'

    return {
        name: 'coldwaterkim-local-emoji-mart-data',
        generateBundle(_options, bundle) {
            Object.values(bundle).forEach(chunk => {
                if (chunk.type !== 'chunk') return
                chunk.code = chunk.code
                    .replaceAll(cdnBase, localBase)
                    .replaceAll(emojiDatasourceBase, localEmojiDatasourceBase)
            })
        },
    }
}

export default defineConfig({
    define: {
        __SITE_VERSION__: JSON.stringify(siteVersion),
        __CMS_TARGET__: JSON.stringify(cmsTarget),
        __LIVE_CMS_URL__: JSON.stringify(useSameOriginCms ? '' : liveCmsUrl),
    },
    plugins: [
        versionManifestPlugin(),
        localEmojiMartDataPlugin(),
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
