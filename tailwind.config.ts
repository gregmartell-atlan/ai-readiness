import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        atlan: {
          primary: '#3C71DF',
          primaryHover: '#225BD2',
          primaryMuted: '#F4F6FD',
          bg: '#F6F7F9',
          surface: '#FFFFFF',
          surfaceHover: '#F0F7FF',
          surfaceActive: '#EAF1FF',
          border: '#E0E4EB',
          borderLight: '#C0D2FA',
          text: '#34394B',
          textSecondary: '#525C73',
          textMuted: '#6A7692',
          success: '#00B28A',
          successBg: '#F0FFFC',
          warning: '#F7B43D',
          warningBg: '#FEF7E4',
          danger: '#3C71DF',
          dangerBg: '#F4F6FD',
          info: '#3C71DF',
          infoBg: '#F4F6FD',
          critical: '#3C71DF',
          criticalBg: '#F4F6FD',
          optimized: '#818CF8',
          optimizedBg: 'rgba(129,140,248,0.12)',
        },
      },
      fontFamily: {
        sans: ['Avenir', 'Avenir Next', 'Segoe UI', 'sans-serif'],
        mono: ['Menlo', 'monospace'],
      },
      animation: {
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
