import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { migrateLocalToCloud, clearLocalChats } from '@/lib/db';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type AuthMode = 'login' | 'signup' | 'forgot-password' | 'update-password';

interface AuthViewProps {
  initialMode?: AuthMode;
  onClose: () => void;
}

export function AuthView({ initialMode = 'login', onClose }: AuthViewProps) {
  // Opened by an event, so remember the button to return focus to on close
  const [returnFocusTo] = useState(() => document.activeElement as HTMLElement | null);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccessMsg(null);
    if (nextMode !== 'signup') {
      setUsername('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await clearLocalChats();
        window.location.reload();
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: username }
          }
        });
        if (error) throw error;
        if (data.session) {
          if (data.user) await migrateLocalToCloud(data.user.id);
          window.location.reload();
        } else {
          setSuccessMsg('Account created. Check your email for a confirmation link, then sign in.');
        }
      } else if (mode === 'forgot-password') {
        const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        setSuccessMsg('If an account exists for that email, a password reset link is on its way.');
      } else if (mode === 'update-password') {
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        if (window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery')) {
          window.history.replaceState(null, '', window.location.pathname);
        }
        setSuccessMsg('Your password has been updated.');
      }
    } catch (err: any) {
      setError(err.message || 'That didn’t work. Check your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  const titleText =
    mode === 'login'
      ? 'Sign in'
      : mode === 'signup'
        ? 'Create an account'
        : mode === 'forgot-password'
          ? 'Reset your password'
          : 'Set a new password';

  const descriptionText =
    mode === 'login'
      ? 'Sign in to open your notebooks on any device.'
      : mode === 'signup'
        ? 'Your notebooks in this browser will be copied to your new account.'
        : mode === 'forgot-password'
          ? 'Enter your email address and we’ll send you a link to reset your password.'
          : 'Choose a new password for your account.';

  return (
    <Dialog open onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent
        className="max-w-md p-8"
        onCloseAutoFocus={(e) => {
          if (returnFocusTo?.isConnected) {
            e.preventDefault();
            returnFocusTo.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl font-semibold">{titleText}</DialogTitle>
          <DialogDescription>{descriptionText}</DialogDescription>
        </DialogHeader>

        {successMsg ? (
          <div role="status" className="mt-4 space-y-4">
            <div className="rounded-lg bg-accent/60 p-4 text-sm text-foreground">
              <p className="font-medium">{successMsg}</p>
            </div>
            {mode === 'update-password' && (
              <Button type="button" className="w-full" onClick={onClose}>
                Continue to notebook
              </Button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-2 space-y-4">
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="e.g. Alex"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={2}
                  maxLength={30}
                />
              </div>
            )}

            {mode !== 'update-password' && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  pattern="[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
                />
              </div>
            )}

            {(mode === 'login' || mode === 'signup') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => switchMode('forgot-password')}
                      className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            )}

            {mode === 'update-password' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
              </>
            )}

            {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {mode === 'login'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Create account'
                  : mode === 'forgot-password'
                    ? 'Send reset link'
                    : 'Update password'}
            </Button>
          </form>
        )}

        {mode !== 'update-password' && (
          <p className="mt-2 text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>
                New here?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="rounded font-medium text-primary underline-offset-4 hover:underline"
                >
                  Create an account
                </button>
              </>
            ) : mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="rounded font-medium text-primary underline-offset-4 hover:underline"
                >
                  Sign in
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="rounded font-medium text-primary underline-offset-4 hover:underline"
              >
                Back to sign in
              </button>
            )}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
