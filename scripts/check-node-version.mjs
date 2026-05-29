const [major, minor] = process.versions.node.split('.').map(Number);

const isSupported =
    (major === 20 && minor >= 19) ||
    (major >= 22 && major < 26);

if (!isSupported) {
    console.error(`Unsupported Node.js version: ${process.versions.node}`);
    console.error('Use Node.js 22 or 24 for this project. Node.js 26 can hang during the Vite build.');
    process.exit(1);
}
