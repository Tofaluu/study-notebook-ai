import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { migrateLocalToCloud, clearLocalChats } from '@/lib/db';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AuthViewProps {
  onClose: () => void;
}

export function AuthView({ onClose }: AuthViewProps) {
  // Opened by an event, so remember the button to return focus to on close
  const [returnFocusTo] = useState(() => document.activeElement as HTMLElement | null);
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const toggleAuthMode = () => {
    setIsLogin(!isLogin);
    setUsername('');
    setEmail('');
    setPassword('');
    setError(null);
    setSuccessMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await clearLocalChats();
        window.location.reload();
      } else {
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
      }
    } catch (err: any) {
      setError(err.message || 'That didn’t work. Check your email and password, then try again.');
    } finally {
      setLoading(false);
    }
  };

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
          <DialogTitle className="font-serif text-2xl font-semibold">{isLogin ? 'Sign in' : 'Create an account'}</DialogTitle>
          <DialogDescription>
            {isLogin ? 'Sign in to open your notebooks on any device.' : 'Your notebooks in this browser will be copied to your new account.'}
          </DialogDescription>
        </DialogHeader>

        {successMsg ? (
          <div role="status" className="mt-4 rounded-lg bg-accent/60 p-4 text-sm text-foreground">
            <p className="font-medium">{successMsg}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-2 space-y-4">
            {!isLogin && (
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
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
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

            {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {isLogin ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        )}

        <p className="mt-2 text-center text-sm text-muted-foreground">
          {isLogin ? 'New here? ' : 'Already have an account? '}
          <button
            type="button"
            onClick={toggleAuthMode}
            className="rounded font-medium text-primary underline-offset-4 hover:underline"
          >
            {isLogin ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </DialogContent>
    </Dialog>
  );
}
