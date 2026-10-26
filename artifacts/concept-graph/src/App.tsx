import { useEffect, useState, type ReactNode } from 'react';
import { useThemeCustomization } from '@/hooks/use-theme';
import { AuthView, type AuthMode } from '@/components/AuthView';
import { supabase } from '@/lib/supabase';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function isRecoveryUrl(): boolean {
  return (
    window.location.hash.includes('type=recovery') ||
    new URLSearchParams(window.location.search).get('type') === 'recovery'
  );
}

function App() {
  useThemeCustomization();
  const [authMode, setAuthMode] = useState<AuthMode>(() =>
    isRecoveryUrl() ? 'update-password' : 'login'
  );
  const [isAuthOpen, setIsAuthOpen] = useState(() => isRecoveryUrl());

  useEffect(() => {
    const handler = () => {
      setAuthMode('login');
      setIsAuthOpen(true);
    };
    window.addEventListener('open-auth', handler);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('update-password');
        setIsAuthOpen(true);
      }
    });

    return () => {
      window.removeEventListener('open-auth', handler);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="study-notebook-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
          {isAuthOpen && (
            <AuthView
              initialMode={authMode}
              onClose={() => {
                setIsAuthOpen(false);
                setAuthMode('login');
              }}
            />
          )}
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
