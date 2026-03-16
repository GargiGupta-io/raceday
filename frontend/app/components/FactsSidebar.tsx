interface Article {
  title: string;
  url: string;
  summary: string;
  source: string;
  published: string;
}

interface RedditPost {
  title: string;
  url: string;
  score: number;
  num_comments: number;
  author: string;
  flair: string;
}

interface SidebarData {
  articles: Article[];
  reddit: {
    race_thread: RedditPost | null;
    posts: RedditPost[];
  };
  did_you_know: string[];
}

export default function FactsSidebar({ data }: { data: SidebarData }) {
  const hasArticles = data.articles.length > 0;
  const hasReddit = data.reddit.race_thread || data.reddit.posts.length > 0;
  const hasFacts = data.did_you_know.length > 0;

  if (!hasArticles && !hasReddit && !hasFacts) {
    return null;
  }

  return (
    <div className="space-y-5">

      {/* Did You Know */}
      {hasFacts && (
        <div className="rounded-lg bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Did you know</p>
          <ul className="space-y-2">
            {data.did_you_know.map((fact, i) => (
              <li key={i} className="text-sm text-zinc-300 leading-relaxed">
                <span className="text-yellow-500 mr-2">*</span>
                {fact}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* From the Press */}
      {hasArticles && (
        <div className="rounded-lg bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">From the press</p>
          <ul className="space-y-3">
            {data.articles.map((article, i) => (
              <li key={i}>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-zinc-200 hover:text-white transition-colors leading-snug block"
                >
                  {article.title}
                </a>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-zinc-600">{article.source}</span>
                  {article.published && (
                    <span className="text-xs text-zinc-600">{article.published}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fan Discussion */}
      {hasReddit && (
        <div className="rounded-lg bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Fan discussion</p>

          {/* Race thread */}
          {data.reddit.race_thread && (
            <a
              href={data.reddit.race_thread.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded bg-zinc-800 p-3 mb-3 hover:bg-zinc-750 transition-colors"
            >
              <p className="text-sm text-zinc-200 leading-snug">{data.reddit.race_thread.title}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-xs text-orange-400">{data.reddit.race_thread.score.toLocaleString()} pts</span>
                <span className="text-xs text-zinc-500">{data.reddit.race_thread.num_comments.toLocaleString()} comments</span>
              </div>
            </a>
          )}

          {/* Top posts */}
          <ul className="space-y-2.5">
            {data.reddit.posts.slice(0, 5).map((post, i) => (
              <li key={i}>
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-zinc-300 hover:text-white transition-colors leading-snug block"
                >
                  {post.title}
                </a>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-orange-400/70">{post.score.toLocaleString()}</span>
                  <span className="text-xs text-zinc-600">{post.num_comments} comments</span>
                  {post.flair && (
                    <span className="text-xs text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5">{post.flair}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
