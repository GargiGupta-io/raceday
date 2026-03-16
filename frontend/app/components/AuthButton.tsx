"use client";

import { useEffect, useState } from "react";
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

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const isAnonymous = user?.is_anonymous;
  const displayName = user?.email || (isAnonymous ? "Guest" : null);

  // Signed in
  if (user && !showModal) {
    return (
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
    );
  }

  // Not signed in
  if (!user && !showModal) {
    return (
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
    );
  }

  // Modal
  return (
    <>
      {/* Trigger buttons (behind modal) */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">...</span>
      </div>

      {/* Modal overlay */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        onClick={() => setShowModal(false)}
      >
        <div
          className="w-80 rounded-lg bg-zinc-900 p-6 shadow-xl border border-zinc-800"
          onClick={(e) => e.stopPropagation()}
        >
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

          <p className="text-xs text-zinc-500 text-center">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(""); setMessage(""); }}
              className="text-red-400 hover:text-red-300"
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>

          <button
            onClick={() => setShowModal(false)}
            className="absolute top-3 right-3 text-zinc-500 hover:text-white text-lg"
          >
          </button>
        </div>
      </div>
    </>
  );
}
