import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useThemeCustomization } from '@/hooks/use-theme';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { hasCustomTheme, resetColors } = useThemeCustomization();
  const [mounted, setMounted] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';
  const targetTheme = isDark ? 'light' : 'dark';

  const handleToggleClick = () => {
    if (hasCustomTheme) {
      setShowConfirm(true);
    } else {
      setTheme(targetTheme);
    }
  };

  const handleConfirmReset = () => {
    resetColors();
    setTheme(targetTheme);
    setShowConfirm(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleToggleClick}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset custom colors?</AlertDialogTitle>
            <AlertDialogDescription>
              You currently have custom workspace colors enabled. Switching to default {targetTheme === 'dark' ? 'Dark' : 'Light'} Mode will clear your custom palette and restore default colors.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReset}>
              Reset & Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
