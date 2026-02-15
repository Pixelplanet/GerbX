/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'brand-bg': '#0a0a0c',
                'brand-surface': 'rgba(20, 20, 25, 0.7)',
                'brand-accent': '#3b82f6',
                'brand-accent-glow': 'rgba(59, 130, 246, 0.3)',
                'brand-border': 'rgba(255, 255, 255, 0.1)',
                'brand-text': '#f8fafc',
                'brand-text-muted': '#94a3b8',
            },
            backdropBlur: {
                'glass': '20px',
            },
            backgroundImage: {
                'grid-pattern': "linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)",
            }
        },
    },
    plugins: [],
}
