/**
 * Icicle Markets Brand Constants
 * 
 * Retro Winter Theme - Inspired by 80s computer interfaces and Avalanche's icy aesthetic
 */

export const BRAND = {
  name: 'ICICLE',
  fullName: 'Icicle Markets',
  tagline: 'AVALANCHE MARKETS',
  description: 'Avalanche Blockchain Explorer and Marketplace',
  
  // Logo paths
  logos: {
    main: '/logo.svg',
    icon: '/logo-icon.svg',
    light: '/logo-light.svg',
    wordmark: '/logo-wordmark.svg',
    favicon: '/favicon.svg',
  },
} as const;

/**
 * Brand Color Palette
 * Icy blue gradient with neon green accents for a retro winter feel
 */
export const COLORS = {
  // Primary - Ice Blue
  primary: {
    ice: '#8be4ff',      // Bright ice blue (main brand color)
    glacier: '#4db8ff',  // Medium glacier blue
    deep: '#2a8fcc',     // Deep ice blue
    frost: '#b8f0ff',    // Light frost/highlight
  },
  
  // Background - Dark Navy/Space
  background: {
    deep: '#0a0e27',     // Deep space navy
    elevated: '#0f1535', // Slightly elevated surface
    overlay: '#1a2850',  // Overlay/modal background
  },
  
  // Accent Colors
  accent: {
    positive: '#4dff88', // Neon green (gains/success)
    negative: '#ff4d4d', // Neon red (losses/errors)
    warning: '#ffeb3b',  // Neon yellow (warnings/favorites)
    purple: '#b84dff',   // Neon purple (special items)
  },
  
  // Neutral
  neutral: {
    white: '#ffffff',
    border: '#4db8ff',
    borderLight: 'rgba(75, 184, 255, 0.3)',
    text: '#8be4ff',
    textMuted: '#4db8ff',
  },
} as const;

/**
 * Typography - Retro Fonts
 */
export const FONTS = {
  // Primary font for headings and buttons
  display: "'Press Start 2P', cursive",
  
  // Secondary font for body text and data
  mono: "'VT323', monospace",
  
  // Fallback system fonts
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
} as const;

/**
 * Typography Sizes (for VT323 which is larger)
 */
export const FONT_SIZES = {
  display: {
    xs: '8px',   // Press Start 2P - very small
    sm: '10px',  // Press Start 2P - small
    md: '12px',  // Press Start 2P - medium
    lg: '14px',  // Press Start 2P - large
    xl: '16px',  // Press Start 2P - extra large
    '2xl': '18px', // Press Start 2P - 2x large
    '3xl': '24px', // Press Start 2P - 3x large
  },
  mono: {
    sm: '14px',  // VT323 - small
    md: '16px',  // VT323 - medium
    lg: '18px',  // VT323 - large
    xl: '20px',  // VT323 - extra large
    '2xl': '22px', // VT323 - 2x large
    '3xl': '24px', // VT323 - 3x large
  },
} as const;

/**
 * Border Styles - Retro chunky borders
 */
export const BORDERS = {
  width: {
    thin: '2px',
    medium: '3px',
    thick: '4px',
  },
  style: 'solid',
  radius: '0px', // No border radius for retro feel
} as const;

/**
 * Effects - Glows and shadows
 */
export const EFFECTS = {
  glow: {
    sm: '0 0 10px rgba(139, 228, 255, 0.3)',
    md: '0 0 15px rgba(139, 228, 255, 0.5)',
    lg: '0 0 20px rgba(139, 228, 255, 0.6)',
    xl: '0 0 30px rgba(139, 228, 255, 0.7)',
  },
  glowGreen: {
    md: '0 0 15px rgba(77, 255, 136, 0.4)',
    lg: '0 0 20px rgba(77, 255, 136, 0.5)',
  },
  scanline: 'repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.1) 0px, transparent 1px, transparent 2px, rgba(0, 0, 0, 0.1) 3px)',
} as const;

/**
 * Spacing System
 */
export const SPACING = {
  xs: '0.25rem',  // 4px
  sm: '0.5rem',   // 8px
  md: '1rem',     // 16px
  lg: '1.5rem',   // 24px
  xl: '2rem',     // 32px
  '2xl': '3rem',  // 48px
  '3xl': '4rem',  // 64px
} as const;

/**
 * Animation Durations
 */
export const ANIMATIONS = {
  fast: '150ms',
  normal: '250ms',
  slow: '350ms',
} as const;

/**
 * Z-Index Layers
 */
export const Z_INDEX = {
  base: 0,
  elevated: 10,
  dropdown: 100,
  sticky: 200,
  modal: 1000,
  tooltip: 2000,
} as const;
