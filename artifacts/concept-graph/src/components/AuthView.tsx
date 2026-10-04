import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { migrateLocalToCloud, clearLocalChats } from '@/lib/db';
import { BookOpen, Loader2, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AuthViewProps {
  onClose: () => void;
}

export function AuthView({ onClose }: AuthViewProps) {
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
          setSuccessMsg('Account created! Please check your email for the confirmation link.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-card p-8 rounded-xl border shadow-sm">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
            <BookOpen className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Study Notebook AI</h1>
          <p className="text-sm text-muted-foreground text-center">
            {isLogin ? 'Sign in to access your cloud notebooks.' : 'Create an account to save your local chats to the cloud.'}
          </p>
        </div>

        {successMsg ? (
          <div className="mt-8 flex flex-col items-center gap-4 p-4 bg-green-500/10 text-green-600 rounded-lg border border-green-500/20 text-center">
            <CheckCircle2 className="w-8 h-8" />
            <p className="text-sm font-medium">{successMsg}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-8">
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

            {error && <p className="text-sm text-destructive font-medium">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {isLogin ? 'Sign In' : 'Sign Up'}
            </Button>
          </form>
        )}

        <div className="text-center mt-4">
          <button 
            type="button" 
            onClick={toggleAuthMode}
            className="text-sm text-muted-foreground transition-colors"
          >
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <span className="text-orange-500 hover:underline font-medium">
              {isLogin ? 'Sign up' : 'Sign in'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
