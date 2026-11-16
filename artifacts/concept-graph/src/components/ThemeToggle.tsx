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
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <span className="relative flex h-4 w-4 items-center justify-center" aria-hidden="true">
          <Sun
            className={`absolute h-4 w-4 transition-[opacity,transform,filter] duration-200 ease-out motion-reduce:transition-none ${
              isDark ? 'scale-100 opacity-100 blur-0' : 'scale-75 opacity-0 blur-[4px]'
            }`}
            strokeWidth={1.75}
          />
          <Moon
            className={`absolute h-4 w-4 transition-[opacity,transform,filter] duration-200 ease-out motion-reduce:transition-none ${
              isDark ? 'scale-75 opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-0'
            }`}
            strokeWidth={1.75}
          />
        </span>
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
