import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Copy, ThumbsUp, MessageSquare, Share2, Globe, Clock, Star, EyeOff, Eye, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { getSupabase } from '../lib/supabase';

interface PostCardProps {
  post: any;
  onSaved?: (id: string, saved: boolean) => void;
  onHidden?: (id: string, hidden: boolean) => void;
}

const proxyImg = (url: string, w?: number, h?: number) => {
  if (!url) return '';
  const p = new URLSearchParams({ url, output: 'webp' });
  if (w) p.set('w', String(w));
  if (h) p.set('h', String(h));
  if (w && h) p.set('fit', 'cover');
  return `https://wsrv.nl/?${p.toString()}`;
};

const parseJson = <T,>(val: any, fallback: T): T => {
  if (val == null) return fallback;
  if (typeof val !== 'string') return val as T;
  try { return JSON.parse(val); } catch { return fallback; }
};

const formatCount = (n: number) => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
};

const formatRelative = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7)  return `${d}d`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return ''; }
};

const CONTENT_LIMIT = 350;

export const PostCard: React.FC<PostCardProps> = ({ post, onSaved, onHidden }) => {
  const { showToast } = useToast();
  const { settings } = useSettings();
  const [expanded, setExpanded] = useState(false);
  const [avatarErr, setAvatarErr] = useState(false);
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});
  const [isSaved, setIsSaved] = useState<boolean>(Boolean(post.saved));
  const [isHidden, setIsHidden] = useState<boolean>(Boolean(post.hidden));
  const [pendingHide, setPendingHide] = useState(false);
  const [barProgress, setBarProgress] = useState(100);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pendingHide) {
      setBarProgress(100);
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setBarProgress(0));
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setBarProgress(100);
    }
  }, [pendingHide]);

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const images: Array<{ url: string; width?: number; height?: number }> = Array.isArray(post.post_images)
    ? post.post_images
    : parseJson(post.post_images, []);
  const engagement = parseJson<{ likes?: number; comments?: number; shares?: number }>(post.engagement, {});
  const likes = engagement.likes ?? 0;
  const comments = engagement.comments ?? 0;
  const shares = engagement.shares ?? 0;

  const content: string = post.content ?? '';
  const isLong = content.length > CONTENT_LIMIT;
  const displayContent = expanded || !isLong ? content : content.slice(0, CONTENT_LIMIT);

  const initials = (post.poster_name ?? '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  const avatarUrl: string | null = post.avatar_url ?? null;
  const ago = formatRelative(post.posted_at);

  const copyForClaude = async () => {
    const text = [
      settings.claudePrompt,
      '',
      'LinkedIn post:',
      '---',
      `Poster: ${post.poster_name ?? ''}`,
      post.author_info ? `Author info: ${post.author_info}` : null,
      '',
      'Content:',
      content,
      '---',
      `Link: ${post.post_url ?? ''}`,
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    showToast('Text has been copied');
  };

  const handleToggleSaved = async () => {
    const next = !isSaved;
    setIsSaved(next);
    const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
    if (!supabase) return;
    const { error } = await supabase
      .from('linkedin_posts_lexiecoon')
      .update({ saved: next })
      .eq('id', post.id);
    if (error) {
      setIsSaved(!next);
      showToast('Failed to update');
      return;
    }
    showToast(next ? 'Post saved' : 'Removed saved mark');
    onSaved?.(post.id, next);
  };

  const handleHideClick = () => {
    if (isHidden) {
      handleUnhide();
      return;
    }
    if (pendingHide) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setPendingHide(false);
      return;
    }
    setPendingHide(true);
    hideTimerRef.current = setTimeout(async () => {
      setPendingHide(false);
      setIsHidden(true);
      const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
      if (!supabase) return;
      const { error } = await supabase
        .from('linkedin_posts_lexiecoon')
        .update({ hidden: true })
        .eq('id', post.id);
      if (error) {
        setIsHidden(false);
        showToast('Failed to hide post');
        return;
      }
      onHidden?.(post.id, true);
    }, 3000);
  };

  const handleUnhide = async () => {
    setIsHidden(false);
    const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
    if (!supabase) return;
    const { error } = await supabase
      .from('linkedin_posts_lexiecoon')
      .update({ hidden: false })
      .eq('id', post.id);
    if (error) {
      setIsHidden(true);
      showToast('Failed to unhide post');
      return;
    }
    showToast('Post unhidden');
    onHidden?.(post.id, false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300',
        pendingHide ? 'opacity-50' : isHidden ? 'opacity-60' : ''
      )}
    >
      {pendingHide && (
        <div className="h-0.5 bg-zinc-100 w-full">
          <div
            className="h-full bg-amber-400 transition-all ease-linear"
            style={{ width: `${barProgress}%`, transitionDuration: '3000ms' }}
          />
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <a href={post.poster_url ?? '#'} target="_blank" rel="noreferrer" className="flex-shrink-0">
          {avatarUrl && !avatarErr ? (
            <img
              src={proxyImg(avatarUrl, 48, 48)}
              alt={post.poster_name ?? ''}
              className="w-12 h-12 rounded-full object-cover ring-1 ring-zinc-200"
              onError={() => setAvatarErr(true)}
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm select-none">
              {initials}
            </div>
          )}
        </a>

        <div className="flex-1 min-w-0">
          <a
            href={post.poster_url ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-sm text-zinc-900 hover:underline leading-tight"
          >
            {post.poster_name}
          </a>
          {post.author_info && (
            <p className="text-xs text-zinc-500 truncate leading-tight mt-0.5">{post.author_info}</p>
          )}
          <div className="flex items-center gap-1 text-[11px] text-zinc-400 mt-1">
            <Clock className="w-3 h-3" />
            <span>{ago}</span>
            <span className="text-zinc-300">·</span>
            <Globe className="w-3 h-3" />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={copyForClaude}
            title="Copy for Claude"
            className="btn-copy-gradient flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          >
            <Copy className="w-3 h-3" />
            Copy
          </button>
          <button
            onClick={handleToggleSaved}
            title={isSaved ? 'Remove saved mark' : 'Save post'}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-all',
              isSaved
                ? 'bg-amber-500 text-white border-transparent hover:bg-amber-600'
                : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100'
            )}
          >
            <Star className={cn('w-3 h-3', isSaved && 'fill-current')} />
            {isSaved && 'Saved'}
          </button>
          <button
            onClick={handleHideClick}
            title={pendingHide ? 'Undo hide' : isHidden ? 'Unhide post' : 'Hide post'}
            className={cn(
              'flex items-center gap-1 px-2 py-1.5 rounded-full text-[11px] font-semibold border transition-all',
              pendingHide
                ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
                : isHidden
                ? 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200'
                : 'bg-zinc-50 text-zinc-400 border-zinc-200 hover:border-zinc-300 hover:text-zinc-600'
            )}
          >
            {pendingHide
              ? <><RotateCcw className="w-3.5 h-3.5" />Undo</>
              : isHidden
              ? <><Eye className="w-3.5 h-3.5" />Unhide</>
              : <EyeOff className="w-3.5 h-3.5" />
            }
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      {content && (
        <div className="px-4 pb-3">
          <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap">
            {displayContent}
            {isLong && !expanded && (
              <>
                {'… '}
                <button
                  onClick={() => setExpanded(true)}
                  className="font-semibold text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  see more
                </button>
              </>
            )}
          </p>
          {isLong && expanded && (
            <button
              onClick={() => setExpanded(false)}
              className="mt-1 text-[11px] font-semibold text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              see less
            </button>
          )}
        </div>
      )}

      {/* ── Post Images ── */}
      {images.length > 0 && (
        <div className={cn('overflow-hidden', images.length === 1 ? '' : 'grid grid-cols-2 gap-0.5')}>
          {images.map((img, i) =>
            imgErrors[i] || !img?.url ? null : (
              <img
                key={i}
                src={proxyImg(img.url, 800)}
                alt=""
                className={cn(
                  'w-full object-cover bg-zinc-100',
                  images.length === 1 ? 'max-h-[500px]' : 'h-48'
                )}
                onError={() => setImgErrors(prev => ({ ...prev, [i]: true }))}
              />
            )
          )}
        </div>
      )}

      {/* ── Engagement counts ── */}
      {(likes > 0 || comments > 0 || shares > 0) && (
        <div className="flex items-center justify-between px-4 py-2 text-[11px] text-zinc-500 border-t border-zinc-100">
          <div className="flex items-center gap-1">
            <div className="flex -space-x-0.5">
              <span className="w-4 h-4 rounded-full bg-[#0a66c2] border border-white flex items-center justify-center text-white text-[8px]">👍</span>
              {likes > 0 && <span className="w-4 h-4 rounded-full bg-red-500 border border-white flex items-center justify-center text-white text-[8px]">❤</span>}
            </div>
            {likes > 0 && <span className="ml-1">{formatCount(likes)}</span>}
          </div>
          <div className="flex gap-3">
            {comments > 0 && <span>{formatCount(comments)} comments</span>}
            {shares > 0 && <span>{formatCount(shares)} reposts</span>}
          </div>
        </div>
      )}

      {/* ── Action row ── */}
      <div className="flex items-center border-t border-zinc-100 px-1 py-0.5">
        <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors">
          <ThumbsUp className="w-4 h-4" />
          <span>Like</span>
        </button>
        <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors">
          <MessageSquare className="w-4 h-4" />
          <span>Comment</span>
        </button>
        <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors">
          <Share2 className="w-4 h-4" />
          <span>Repost</span>
        </button>
        <a
          href={post.post_url ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium text-[#0a66c2] hover:bg-blue-50 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          <span>LinkedIn</span>
        </a>
      </div>
    </motion.div>
  );
};
