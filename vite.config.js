import { defineConfig } from 'vite'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const htmlDirs = ['.', 'all', 'posts', 'daily', 'album', 'programs', 'nasajab', 'admin']
const liveCmsUrl = 'https://coldwaterkim.com'
const cmsTarget = String(process.env.VITE_CMS_TARGET || '').toLowerCase()
const useLiveCmsProxy = cmsTarget === 'live'
const useSameOriginCms = ['same-origin', 'self', 'imac', 'home'].includes(cmsTarget)
const siteVersion = resolveSiteVersion()
const siteOrigin = 'https://coldwaterkim.com'

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
            this.emitFile({
                type: 'asset',
                fileName: 'assets/profile-crop.jpg',
                source: fs.readFileSync(path.resolve(__dirname, 'assets/profile-crop.jpg')),
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

function staticSeoPlugin() {
    const pages = {
        '/all/index.html': ['모아보기 — coldwaterkim', '글방, 나으 하루, 나사잡과 방명록 답글을 최신순으로 모아봅니다.'],
        '/posts/index.html': ['글방 — coldwaterkim', '김찬수가 쓴 생각과 긴 기록을 모은 글방입니다.'],
        '/daily/index.html': ['나으 하루 — coldwaterkim', '김찬수의 날짜별 일상과 사진, 영상을 모은 생활 기록입니다.'],
        '/album/index.html': ['앨범 — coldwaterkim', '공개된 글과 하루 기록, 나사잡에 담긴 사진과 영상을 한곳에서 둘러보는 앨범입니다.'],
        '/programs/index.html': ['프로그램실 — coldwaterkim', '문서, PDF, 이미지, 엑셀과 CSV를 외부 사이트 없이 바로 처리하는 개인 파일 작업실입니다.'],
        '/nasajab/index.html': ['나사잡 — coldwaterkim', '김찬수를 사로잡은 사진, 캡처, 장면을 한 장씩 모은 기록입니다.'],
        '/about.html': ['About / Contact — coldwaterkim', 'coldwaterkim 개인 홈페이지의 주인장 김찬수 소개와 연락처입니다.'],
    }
    return {
        name: 'coldwaterkim-static-seo',
        transformIndexHtml: {
            order: 'pre',
            handler(html, context) {
                const pagePath = new URL(context.path || '/', siteOrigin).pathname
                if (pagePath.startsWith('/admin/')) {
                    return html.replace('</head>', '  <meta name="robots" content="noindex,nofollow">\n</head>')
                }
                if (pagePath === '/guestbook.html' || pagePath === '/askme.html') {
                    return html.replace('</head>', '  <meta name="robots" content="noindex,follow">\n</head>')
                }
                if (pagePath === '/all/view.html') {
                    return html.includes('name="robots"')
                        ? html
                        : html.replace('</head>', '  <meta name="robots" content="noindex,follow">\n</head>')
                }
                const meta = pages[pagePath]
                if (!meta || html.includes('rel="canonical"')) return html
                const [title, description] = meta
                const canonical = `${siteOrigin}${pagePath}`
                const tags = `  <meta name="description" content="${description}">\n` +
                    `  <link rel="canonical" href="${canonical}">\n` +
                    `  <meta property="og:type" content="website">\n` +
                    `  <meta property="og:title" content="${title}">\n` +
                    `  <meta property="og:description" content="${description}">\n` +
                    `  <meta property="og:url" content="${canonical}">\n` +
                    `  <meta property="og:image" content="${siteOrigin}/assets/profile-crop.jpg">\n` +
                    `  <meta name="twitter:card" content="summary">\n` +
                    `  <meta name="twitter:title" content="${title}">\n` +
                    `  <meta name="twitter:description" content="${description}">\n` +
                    `  <meta name="twitter:image" content="${siteOrigin}/assets/profile-crop.jpg">\n`
                return html.replace('</head>', `${tags}</head>`)
            },
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
        staticSeoPlugin(),
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
