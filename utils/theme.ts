import { Theme } from "@/types";

/**
 * Get the current theme
 */
export function getTheme(): Theme {
  // Check if we're in the browser
  if (typeof window === 'undefined') {
    return 'system';
  }
  
  // Try to get theme from localStorage
  try {
    const savedTheme = localStorage.getItem('vsearch_theme') as Theme | null;
    
    if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
      return savedTheme;
    }
  } catch (error) {
    console.error('Error getting theme from localStorage:', error);
  }
  
  // Default to system
  return 'system';
}

/**
 * Set the theme
 */
export function setTheme(theme: Theme): void {
  // Check if we're in the browser
  if (typeof window === 'undefined') {
    return;
  }
  
  try {
    // Save theme to localStorage
    localStorage.setItem('vsearch_theme', theme);
    
    // Apply theme to document
    applyTheme(theme);
  } catch (error) {
    console.error('Error setting theme:', error);
  }
}

/**
 * Apply theme to document
 */
export function applyTheme(theme: Theme): void {
  // Check if we're in the browser
  if (typeof window === 'undefined') {
    return;
  }
  
  const isDark = 
    theme === 'dark' || 
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  // Apply dark mode class to document
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

/**
 * Initialize theme
 */
export function initTheme(): void {
  // Check if we're in the browser
  if (typeof window === 'undefined') {
    return;
  }
  
  // Get and apply theme
  const theme = getTheme();
  applyTheme(theme);
  
  // Listen for system theme changes
  if (theme === 'system') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Add listener for theme changes
    mediaQuery.addEventListener('change', () => {
      applyTheme('system');
    });
  }
}
