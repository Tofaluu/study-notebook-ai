import { useState, useEffect } from 'react';
import { hexToHsl } from '@/lib/colors';

export interface ThemeColors {
  primary: string | null;
  background: string | null;
  foreground: string | null;
  secondaryBackground: string | null;
  secondaryForeground: string | null;
}

const STORAGE_KEY = 'study-notebook-theme-colors';

export function useThemeCustomization() {
  const [colors, setColors] = useState<ThemeColors>({
    primary: null,
    background: null,
    foreground: null,
    secondaryBackground: null,
    secondaryForeground: null
  });

  // Load from local storage and sync across hook instances
  useEffect(() => {
    const loadSaved = () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          setColors(JSON.parse(saved));
        } catch (e) {}
      } else {
        setColors({
          primary: null,
          background: null,
          foreground: null,
          secondaryBackground: null,
          secondaryForeground: null
        });
      }
    };

    loadSaved();
    window.addEventListener('study-notebook-theme-updated', loadSaved);
    return () => window.removeEventListener('study-notebook-theme-updated', loadSaved);
  }, []);

  // Apply to DOM whenever colors change
  useEffect(() => {
    const root = document.documentElement;
    
    if (colors.primary) {
      root.style.setProperty('--primary', hexToHsl(colors.primary));
    } else {
      root.style.removeProperty('--primary');
    }

    if (colors.background) {
      root.style.setProperty('--background', hexToHsl(colors.background));
    } else {
      root.style.removeProperty('--background');
    }

    if (colors.foreground) {
      const fgHsl = hexToHsl(colors.foreground);
      root.style.setProperty('--foreground', fgHsl);
      
      
    } else {
      root.style.removeProperty('--foreground');
    }

    if (colors.secondaryForeground) {
      root.style.setProperty('--muted-foreground', hexToHsl(colors.secondaryForeground));
    } else {
      root.style.removeProperty('--muted-foreground');
    }

    if (colors.secondaryBackground) {
      const hsl = hexToHsl(colors.secondaryBackground);
      root.style.setProperty('--card', hsl);
      root.style.setProperty('--muted', hsl);
      root.style.setProperty('--popover', hsl);
    } else {
      root.style.removeProperty('--card');
      root.style.removeProperty('--muted');
      root.style.removeProperty('--popover');
    }

  }, [colors]);

  const updateColor = (key: keyof ThemeColors, hex: string | null) => {
    setColors(prev => {
      const next = { ...prev, [key]: hex };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event('study-notebook-theme-updated'));
      return next;
    });
  };

  const resetColors = () => {
    const defaultColors = { primary: null, background: null, foreground: null, secondaryBackground: null, secondaryForeground: null };
    setColors(defaultColors);
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('study-notebook-theme-updated'));
  };

  const hasCustomTheme = Boolean(
    colors.primary ||
    colors.background ||
    colors.foreground ||
    colors.secondaryBackground ||
    colors.secondaryForeground
  );

  return { colors, updateColor, resetColors, hasCustomTheme };
}











