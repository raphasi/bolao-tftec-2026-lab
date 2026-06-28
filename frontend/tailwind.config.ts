import type { Config } from 'tailwindcss';
import tailwindAnimate from 'tailwindcss-animate';

/**
 * Tailwind config padrão shadcn/ui.
 * Cores TFTEC Cloud entram no Block 1.6 via override de tokens em brand.css.
 * Por enquanto usa as cores neutras shadcn (zinc/slate).
 */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        display: ['"Bebas Neue"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // TFTEC Cloud brand colors (custom, fora do shadcn)
        brand: {
          magenta: 'hsl(var(--brand-magenta))',
          purple: 'hsl(var(--brand-purple))',
          violet: 'hsl(var(--brand-violet))',
          electric: 'hsl(var(--brand-electric))',
        },
        // Copa do Mundo — cores complementares
        copa: {
          pitch: 'hsl(var(--copa-pitch))',
          gold: 'hsl(var(--copa-gold))',
          red: 'hsl(var(--copa-red))',
        },
      },
      backgroundImage: {
        'tftec-gradient': 'linear-gradient(180deg, hsl(45 100% 54%) 0%, hsl(45 100% 47%) 100%)',
        'tftec-radial': 'radial-gradient(at 0% 100%, hsl(var(--brand-electric) / 0.4), hsl(var(--background)) 60%)',
      },
      boxShadow: {
        'brand-glow': '0 0 0 1px hsl(var(--brand-purple) / 0.3), 0 4px 24px -4px hsl(var(--brand-magenta) / 0.4)',
        'brand-glow-lg': '0 0 0 1px hsl(var(--brand-purple) / 0.4), 0 8px 32px -4px hsl(var(--brand-magenta) / 0.5), 0 16px 48px -8px hsl(var(--brand-violet) / 0.4)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        marquee: 'marquee 60s linear infinite',
      },
    },
  },
  plugins: [tailwindAnimate],
} satisfies Config;
