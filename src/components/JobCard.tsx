import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Copy, Briefcase, MapPin, Clock, Users, DollarSign, Zap, Building2, Check, EyeOff, Eye, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { getSupabase } from '../lib/supabase';

interface JobCardProps {
  job: any;
  onApplied?: (jobId: string, applied: boolean) => void;
  onHidden?: (jobId: string, hidden: boolean) => void;
}

const DESCRIPTION_LIMIT = 350;

const EXPERIENCE_LABELS: Record<string, string> = {
  'Internship': 'Internship',
  'Entry level': 'Entry level',
  'Associate': 'Associate',
  'Mid-Senior level': 'Mid-Senior level',
  'Director': 'Director',
  'Executive': 'Executive',
  'Not Applicable': 'Any level',
};

export const JobCard: React.FC<JobCardProps> = ({ job, onApplied, onHidden }) => {
  const { showToast } = useToast();
  const { settings } = useSettings();
  const [expanded, setExpanded] = useState(false);
  const [isApplied, setIsApplied] = useState<boolean>(Boolean(job.applied));
  const [isHidden, setIsHidden] = useState<boolean>(Boolean(job.hidden));
  const [pendingHide, setPendingHide] = useState(false);
  const [barProgress, setBarProgress] = useState(100);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animate progress bar when pendingHide activates
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

  // Clean up timer on unmount
  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const description: string = job.job_description ?? '';
  const isLong = description.length > DESCRIPTION_LIMIT;
  const displayDescription = expanded || !isLong ? description : description.slice(0, DESCRIPTION_LIMIT);

  const companyInitials = (job.company_name ?? '?')
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const seniorityLabel = job.seniority_level
    ? EXPERIENCE_LABELS[job.seniority_level] ?? job.seniority_level
    : null;

  const applyHref = job.apply_url || job.job_url || '#';

  const copyForClaude = async () => {
    const lines = [
      settings.claudePrompt,
      '',
      'Job posting:',
      '---',
      `Title: ${job.job_title ?? ''}`,
      `Company: ${job.company_name ?? ''}`,
      `Location: ${job.location ?? ''}`,
      job.employment_type ? `Employment type: ${job.employment_type}` : null,
      seniorityLabel ? `Experience: ${seniorityLabel}` : null,
      job.salary_range ? `Salary: ${job.salary_range}` : null,
      '',
      'Description:',
      description,
      '---',
      `Link: ${job.job_url ?? ''}`,
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(lines);
    } catch {
      const el = document.createElement('textarea');
      el.value = lines;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    showToast('Text has been copied');
  };

  const handleToggleApplied = async () => {
    const next = !isApplied;
    setIsApplied(next);
    const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
    if (!supabase) return;
    const { error } = await supabase
      .from('linkedin_jobs_lexiecoon')
      .update({ applied: next })
      .eq('job_id', job.job_id);
    if (error) {
      setIsApplied(!next);
      showToast('Failed to update');
      return;
    }
    showToast(next ? 'Marked as applied' : 'Removed applied mark');
    onApplied?.(job.job_id, next);
  };

  const handleHideClick = () => {
    if (isHidden) {
      // Unhide immediately
      handleUnhide();
      return;
    }

    if (pendingHide) {
      // Cancel pending hide
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setPendingHide(false);
      return;
    }

    // Start 3-second grace period
    setPendingHide(true);
    hideTimerRef.current = setTimeout(async () => {
      setPendingHide(false);
      setIsHidden(true);
      const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
      if (!supabase) return;
      const { error } = await supabase
        .from('linkedin_jobs_lexiecoon')
        .update({ hidden: true })
        .eq('job_id', job.job_id);
      if (error) {
        setIsHidden(false);
        showToast('Failed to hide listing');
        return;
      }
      onHidden?.(job.job_id, true);
    }, 3000);
  };

  const handleUnhide = async () => {
    setIsHidden(false);
    const supabase = getSupabase(settings.supabaseUrl, settings.supabaseAnonKey);
    if (!supabase) return;
    const { error } = await supabase
      .from('linkedin_jobs_lexiecoon')
      .update({ hidden: false })
      .eq('job_id', job.job_id);
    if (error) {
      setIsHidden(true);
      showToast('Failed to unhide listing');
      return;
    }
    showToast('Listing unhidden');
    onHidden?.(job.job_id, false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 ${
        pendingHide ? 'opacity-50' : isHidden ? 'opacity-60' : ''
      }`}
    >
      {/* Pending-hide progress bar */}
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
        {/* Company logo */}
        <a href={job.company_url ?? '#'} target="_blank" rel="noreferrer" className="flex-shrink-0">
          {job.company_logo_url ? (
            <img
              src={`https://wsrv.nl/?url=${encodeURIComponent(job.company_logo_url)}&w=96&h=96&fit=contain&bg=white`}
              alt={job.company_name ?? 'Company logo'}
              className="w-12 h-12 rounded-xl object-contain border border-zinc-100 bg-white"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = 'none';
                target.nextElementSibling?.removeAttribute('style');
              }}
            />
          ) : null}
          <div
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center text-white font-bold text-sm select-none"
            style={job.company_logo_url ? { display: 'none' } : undefined}
          >
            {companyInitials}
          </div>
        </a>

        {/* Title + company */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base text-zinc-900 leading-tight">
            <a
              href={job.job_url ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {job.job_title}
            </a>
          </h3>
          {job.company_name && (
            <a
              href={job.company_url ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-zinc-600 hover:text-[#0a66c2] hover:underline truncate inline-flex items-center gap-1 mt-0.5"
            >
              <Building2 className="w-3.5 h-3.5" />
              {job.company_name}
            </a>
          )}
        </div>

        {/* Action buttons */}
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
            onClick={handleToggleApplied}
            title={isApplied ? 'Remove applied mark' : 'Mark as applied'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${
              isApplied
                ? 'bg-green-600 text-white border-transparent hover:bg-green-700'
                : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100'
            }`}
          >
            <Check className="w-3 h-3" />
            {isApplied && 'Applied'}
          </button>
          <button
            onClick={handleHideClick}
            title={pendingHide ? 'Undo hide' : isHidden ? 'Unhide listing' : 'Hide listing'}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${
              pendingHide
                ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
                : isHidden
                ? 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200'
                : 'bg-zinc-50 text-zinc-400 border-zinc-200 hover:border-zinc-300 hover:text-zinc-600'
            }`}
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

      {/* ── Meta row ── */}
      <div className="px-4 pb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
        {job.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {job.location}
          </span>
        )}
        {job.employment_type && (
          <span className="inline-flex items-center gap-1">
            <Briefcase className="w-3 h-3" />
            {job.employment_type}
          </span>
        )}
        {seniorityLabel && (
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" />
            {seniorityLabel}
          </span>
        )}
        {job.time_posted && (
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {job.time_posted}
          </span>
        )}
        {job.num_applicants && (
          <span className="text-zinc-400">· {job.num_applicants}</span>
        )}
      </div>

      {/* ── Salary pill (if present) ── */}
      {job.salary_range && (
        <div className="px-4 pb-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-full text-[11px] font-bold text-emerald-700">
            <DollarSign className="w-3 h-3" />
            {job.salary_range}
          </span>
        </div>
      )}

      {/* ── Tags (function + industries) ── */}
      {(job.job_function || job.industries) && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {job.job_function && (
            <span className="px-2 py-0.5 bg-zinc-50 border border-zinc-200 rounded-md text-[10px] font-semibold text-zinc-600">
              {job.job_function}
            </span>
          )}
          {job.industries && (
            <span className="px-2 py-0.5 bg-zinc-50 border border-zinc-200 rounded-md text-[10px] font-semibold text-zinc-600">
              {job.industries}
            </span>
          )}
        </div>
      )}

      {/* ── Description ── */}
      {description && (
        <div className="px-4 pb-3 border-t border-zinc-100 pt-3">
          <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap">
            {displayDescription}
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

      {/* ── Action row ── */}
      <div className="flex items-center border-t border-zinc-100 px-2 py-1.5 gap-1">
        <a
          href={applyHref}
          target="_blank"
          rel="noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-semibold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
        >
          {job.easy_apply ? <Zap className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
          <span>{job.easy_apply ? 'Easy Apply' : 'Apply'}</span>
        </a>
        <a
          href={job.job_url ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium text-[#0a66c2] hover:bg-blue-50 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          <span>View on LinkedIn</span>
        </a>
      </div>
    </motion.div>
  );
};
