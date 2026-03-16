"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const signInAnonymous = async () => {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) setError(error.message);
  };

  const signInEmail = async () => {
    setError("");
    setMessage("");
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else {
        setMessage("Check your email to confirm your account.");
        setEmail("");
        setPassword("");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else setShowModal(false);
    }
  };

  const signInGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const isAnonymous = user?.is_anonymous;
  const displayName = user?.email || (isAnonymous ? "Guest" : null);

  // Modal rendered via portal to escape navbar stacking context
  const modal = showModal && typeof document !== "undefined"
    ? createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
          onClick={() => setShowModal(false)}
        >
          <div
            className="relative w-80 rounded-lg bg-zinc-900 p-6 shadow-xl border border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-3 right-4 text-zinc-500 hover:text-white text-lg"
            >
              ×
            </button>

            <h2 className="text-lg font-bold text-white mb-4">
              {isSignUp ? "Create Account" : "Sign In"}
            </h2>

            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            {message && <p className="text-emerald-400 text-xs mb-3">{message}</p>}

            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-500 mb-3 focus:outline-none focus:border-zinc-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && signInEmail()}
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-500 mb-4 focus:outline-none focus:border-zinc-500"
            />

            <button
              onClick={signInEmail}
              className="w-full rounded bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors mb-3"
            >
              {isSignUp ? "Sign Up" : "Sign In"}
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-zinc-700" />
              <span className="text-xs text-zinc-500">or</span>
              <div className="flex-1 h-px bg-zinc-700" />
            </div>

            <button
              onClick={signInGoogle}
              className="w-full rounded bg-white py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 transition-colors mb-3 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <p className="text-xs text-zinc-500 text-center">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                onClick={() => { setIsSignUp(!isSignUp); setError(""); setMessage(""); }}
                className="text-red-400 hover:text-red-300"
              >
                {isSignUp ? "Sign in" : "Sign up"}
              </button>
            </p>
          </div>
        </div>,
        document.body
      )
    : null;

  // Signed in
  if (user) {
    return (
      <>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">{displayName}</span>
          {isAnonymous && (
            <button
              onClick={() => { setIsSignUp(true); setShowModal(true); }}
              className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500 transition-colors"
            >
              Sign Up
            </button>
          )}
          <button
            onClick={signOut}
            className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:text-white transition-colors"
          >
            Sign Out
          </button>
        </div>
        {modal}
      </>
    );
  }

  // Not signed in
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={signInAnonymous}
          className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:text-white transition-colors"
        >
          Guest
        </button>
        <button
          onClick={() => { setIsSignUp(false); setShowModal(true); }}
          className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500 transition-colors"
        >
          Sign In
        </button>
      </div>
      {modal}
    </>
  );
}
