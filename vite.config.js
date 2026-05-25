import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

const htmlDirs = ['.', 'posts', 'admin']

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

export default defineConfig({
    build: {
        rollupOptions: {
            input: getHtmlEntries(),
        },
    },
})
