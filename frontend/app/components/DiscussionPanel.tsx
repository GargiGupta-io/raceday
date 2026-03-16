"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

interface Theory {
  id: string;
  user_id: string;
  title: string;
  body: string;
  created_at: string;
  upvote_count: number;
  comment_count: number;
  user_upvoted: boolean;
}

interface Comment {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
}

export default function DiscussionPanel({
  raceYear,
  raceTrack,
}: {
  raceYear: number;
  raceTrack: string;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [theories, setTheories] = useState<Theory[]>([]);
  const [loading, setLoading] = useState(true);

  // New theory form
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Expanded theory (comments view)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");

  const isAnonymous = user?.is_anonymous;
  const canPost = user && !isAnonymous;

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Fetch theories
  const fetchTheories = useCallback(async () => {
    const { data: theoriesData } = await supabase
      .from("theories")
      .select("id, user_id, title, body, created_at")
      .eq("race_year", raceYear)
      .eq("race_track", raceTrack)
      .order("created_at", { ascending: false });

    if (!theoriesData) {
      setTheories([]);
      setLoading(false);
      return;
    }

    // Get upvote counts
    const { data: upvoteCounts } = await supabase
      .from("upvotes")
      .select("theory_id");

    // Get comment counts
    const { data: commentCounts } = await supabase
      .from("comments")
      .select("theory_id");

    // Get current user's upvotes
    const userId = user?.id;
    const { data: userUpvotes } = userId
      ? await supabase
          .from("upvotes")
          .select("theory_id")
          .eq("user_id", userId)
      : { data: [] };

    const upvoteMap: Record<string, number> = {};
    (upvoteCounts || []).forEach((u: { theory_id: string }) => {
      upvoteMap[u.theory_id] = (upvoteMap[u.theory_id] || 0) + 1;
    });

    const commentMap: Record<string, number> = {};
    (commentCounts || []).forEach((c: { theory_id: string }) => {
      commentMap[c.theory_id] = (commentMap[c.theory_id] || 0) + 1;
    });

    const userUpvoteSet = new Set((userUpvotes || []).map((u: { theory_id: string }) => u.theory_id));

    setTheories(
      theoriesData.map((t) => ({
        ...t,
        upvote_count: upvoteMap[t.id] || 0,
        comment_count: commentMap[t.id] || 0,
        user_upvoted: userUpvoteSet.has(t.id),
      }))
    );
    setLoading(false);
  }, [raceYear, raceTrack, user?.id]);

  useEffect(() => {
    fetchTheories();
  }, [fetchTheories]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`discussion-${raceYear}-${raceTrack}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "theories" }, () => {
        fetchTheories();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => {
        fetchTheories();
        if (expandedId) fetchComments(expandedId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "upvotes" }, () => {
        fetchTheories();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceYear, raceTrack, fetchTheories, expandedId]);

  // Submit theory
  const submitTheory = async () => {
    if (!title.trim() || !body.trim() || !user) return;
    setSubmitting(true);

    const { error } = await supabase.from("theories").insert({
      user_id: user.id,
      race_year: raceYear,
      race_track: raceTrack,
      title: title.trim(),
      body: body.trim(),
    });

    if (!error) {
      setTitle("");
      setBody("");
      setShowForm(false);
      fetchTheories();
    }
    setSubmitting(false);
  };

  // Toggle upvote
  const toggleUpvote = async (theoryId: string, currentlyUpvoted: boolean) => {
    if (!canPost) return;

    if (currentlyUpvoted) {
      await supabase
        .from("upvotes")
        .delete()
        .eq("user_id", user!.id)
        .eq("theory_id", theoryId);
    } else {
      await supabase.from("upvotes").insert({
        user_id: user!.id,
        theory_id: theoryId,
      });
    }
    fetchTheories();
  };

  // Fetch comments for a theory
  const fetchComments = async (theoryId: string) => {
    const { data } = await supabase
      .from("comments")
      .select("id, user_id, body, created_at")
      .eq("theory_id", theoryId)
      .order("created_at", { ascending: true });

    setComments(data || []);
  };

  // Expand/collapse theory comments
  const toggleExpand = async (theoryId: string) => {
    if (expandedId === theoryId) {
      setExpandedId(null);
      setComments([]);
    } else {
      setExpandedId(theoryId);
      fetchComments(theoryId);
    }
    setCommentText("");
  };

  // Submit comment
  const submitComment = async (theoryId: string) => {
    if (!commentText.trim() || !user) return;

    const { error } = await supabase.from("comments").insert({
      user_id: user.id,
      theory_id: theoryId,
      body: commentText.trim(),
    });

    if (!error) {
      setCommentText("");
      fetchComments(theoryId);
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-4">

      {/* Post button or sign-up prompt */}
      {canPost ? (
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full rounded-lg border border-dashed border-zinc-700 py-3 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {showForm ? "Cancel" : "Share a theory or take..."}
        </button>
      ) : (
        <div className="rounded-lg bg-zinc-900 p-4 text-center">
          <p className="text-sm text-zinc-500">
            {user ? "Sign up with email to join the discussion." : "Sign in to join the discussion."}
          </p>
        </div>
      )}

      {/* New theory form */}
      {showForm && canPost && (
        <div className="rounded-lg bg-zinc-900 p-4 space-y-3">
          <input
            type="text"
            placeholder="Theory title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <textarea
            placeholder="What's your take on this race?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
          />
          <button
            onClick={submitTheory}
            disabled={submitting || !title.trim() || !body.trim()}
            className="rounded bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Posting..." : "Post"}
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && <p className="text-zinc-600 text-sm">Loading discussion...</p>}

      {/* Empty state */}
      {!loading && theories.length === 0 && (
        <div className="rounded-lg bg-zinc-900 p-8 text-center">
          <p className="text-zinc-500 text-sm">No theories yet. Be the first to share your take.</p>
        </div>
      )}

      {/* Theory list */}
      {theories.map((theory) => (
        <div key={theory.id} className="rounded-lg bg-zinc-900 p-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-zinc-100">{theory.title}</h3>
              <p className="text-sm text-zinc-400 mt-1 leading-relaxed">{theory.body}</p>
            </div>

            {/* Upvote button */}
            <button
              onClick={() => toggleUpvote(theory.id, theory.user_upvoted)}
              disabled={!canPost}
              className={`flex flex-col items-center shrink-0 rounded px-2 py-1 transition-colors ${
                theory.user_upvoted
                  ? "bg-red-600/20 text-red-400"
                  : canPost
                    ? "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                    : "bg-zinc-800 text-zinc-600 cursor-default"
              }`}
            >
              <span className="text-xs leading-none">&#9650;</span>
              <span className="text-xs font-medium">{theory.upvote_count}</span>
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 mt-3">
            <span className="text-xs text-zinc-600">{timeAgo(theory.created_at)}</span>
            <button
              onClick={() => toggleExpand(theory.id)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {theory.comment_count} {theory.comment_count === 1 ? "reply" : "replies"}
            </button>
          </div>

          {/* Comments (expanded) */}
          {expandedId === theory.id && (
            <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2.5">
              {comments.length === 0 && (
                <p className="text-xs text-zinc-600">No replies yet.</p>
              )}
              {comments.map((c) => (
                <div key={c.id} className="pl-3 border-l-2 border-zinc-800">
                  <p className="text-sm text-zinc-300">{c.body}</p>
                  <span className="text-xs text-zinc-600">{timeAgo(c.created_at)}</span>
                </div>
              ))}

              {/* Reply input */}
              {canPost && (
                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Write a reply..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitComment(theory.id)}
                    className="flex-1 rounded bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                  />
                  <button
                    onClick={() => submitComment(theory.id)}
                    disabled={!commentText.trim()}
                    className="rounded bg-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-600 transition-colors disabled:opacity-40"
                  >
                    Reply
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
