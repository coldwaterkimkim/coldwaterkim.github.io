import { resolve } from 'path'
import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

// Helper to find all HTML files
function getHtmlEntries() {
    const pages = {}

    // Root HTML files
    const rootFiles = fs.readdirSync(__dirname)
        .filter(file => file.endsWith('.html'))

    rootFiles.forEach(file => {
        const name = file.replace('.html', '')
        pages[name] = resolve(__dirname, file)
    })

    // Posts HTML files
    const postsDir = resolve(__dirname, 'posts')
    if (fs.existsSync(postsDir)) {
        const postFiles = fs.readdirSync(postsDir)
            .filter(file => file.endsWith('.html'))

        postFiles.forEach(file => {
            const name = 'posts/' + file.replace('.html', '')
            pages[name] = resolve(postsDir, file)
        })
    }

    return pages
}

export default defineConfig({
    build: {
        rollupOptions: {
            input: getHtmlEntries(),
        },
    },
})
