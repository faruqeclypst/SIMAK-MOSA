/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        mosa: {
          blue: '#1e40af', // Deep Mosa Navy
          dark: '#0f172a',
          gold: '#d97706', // Warm Mosa Gold
          goldLight: '#fef3c7',
          surface: '#ffffff',
          bg: '#f8fafc',
          border: '#e2e8f0',
          success: '#10b981',
          danger: '#ef4444',
          warning: '#f59e0b'
        }
      },
      backdropBlur: {
        xs: '2px',
      },
      spacing: {
        'safe': 'env(safe-area-inset-bottom)',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
        card: '0 4px 12px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -1px rgba(15, 23, 42, 0.04)',
        modal: '0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08)',
        '2xs': '0 1px 2px rgba(15, 23, 42, 0.06)',
      },
      keyframes: {
        'mosa-fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'mosa-slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'mosa-scale-up': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        fadeIn: 'mosa-fade-in 150ms ease-out both',
        slideUp: 'mosa-slide-up 180ms ease-out both',
        scaleUp: 'mosa-scale-up 160ms ease-out both',
      }
    },
  },
  plugins: [],
}
