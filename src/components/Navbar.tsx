import { Link, useSearchParams } from 'react-router-dom';
import { useRef, useEffect, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, LogOut, Search, Pencil, Check, X, Trash2, Loader2, Paperclip, FileText, Image as ImageIcon, ChevronDown, Sun, Moon, Bell, BellOff, Heart, PanelRight } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { useSearchStore } from '../store/searchStore';
import { useChatInputStore } from '../store/chatInputStore';
import { useAppsPaneStore } from '../store/appsPaneStore';
import { useFilePreviewStore } from '../store/filePreviewStore';
import { HermesStatusIndicator } from './HermesStatusIndicator';

import { formatFileSize } from '../lib/fileUtils';
import { api } from '../lib/api';
import type { SessionFile } from '../lib/api';

const LIKE_STORAGE_KEY = 'hermes-1230-last-like';
const LIKE_COOLDOWN_SEC = 3600;



// ── Inline SessionFilesBar for Navbar ─────────────────────────────────────
function NavSessionFilesBar({ files }: { files: SessionFile[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const setSelectedFileId = useFilePreviewStore((s) => s.setSelectedFileId);
  const appsPaneVisible = useAppsPaneStore((s) => s.visible);
  const toggleAppsPane = useAppsPaneStore((s) => s.toggleVisible);

  // Close on outside click — use 'click' (not mousedown) to avoid race with toggle
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    // Delay one tick so the opening click doesn't immediately close the panel
    const id = window.setTimeout(() => document.addEventListener('click', handler), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', handler);
    };
  }, [open]);

  const handleFileClick = (fileId: number) => {
    setSelectedFileId(fileId);
    if (!appsPaneVisible) toggleAppsPane();
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Badge — same visual size as model/assistant badges */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border transition-colors ${
          open
            ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300'
            : 'border-border-default bg-bg-secondary text-fg-secondary hover:text-fg-primary hover:border-blue-200 dark:hover:border-blue-800'
        }`}
        aria-expanded={open}
        title={t('chat.sessionFilesTitle', { defaultValue: 'Файлы сессии' })}
      >
        <Paperclip className="w-3 h-3 flex-shrink-0" />
        <span>{files.length}</span>
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 z-[60] w-64 rounded-lg border border-border-default bg-bg-primary shadow-xl overflow-hidden">
          <div className="px-3 py-2 bg-bg-secondary border-b border-border-default">
            <span className="text-xs font-medium text-fg-secondary">
              {t('chat.sessionFilesTitle', { defaultValue: 'Файлы сессии' })} · {files.length}
            </span>
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {files.map(file => (
              <div
                key={file.id}
                onClick={() => handleFileClick(file.id)}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-secondary cursor-pointer transition-colors"
              >
                {file.mimeType?.startsWith('image/')
                  ? <ImageIcon className="w-3.5 h-3.5 text-fg-muted flex-shrink-0" />
                  : <FileText className="w-3.5 h-3.5 text-fg-muted flex-shrink-0" />
                }
                <span className="text-xs text-fg-primary truncate flex-1 min-w-0" title={file.filename}>
                  {file.filename}
                </span>
                <span className="text-xs text-fg-muted flex-shrink-0">{formatFileSize(file.size)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Navbar ─────────────────────────────────────────────────────────────────
export function Navbar() {
  const { t } = useTranslation();

  // Theme + notifications
  const { isDarkMode, toggleDarkMode } = useThemeStore();
  const { enabled: notificationsEnabled, toggle: toggleNotifications } = useNotificationsStore();

  // Like state
  const [likeState, setLikeState] = useState<'idle' | 'sending' | 'sent' | 'cooldown'>(() => {
    try {
      const last = Number(localStorage.getItem(LIKE_STORAGE_KEY) || 0);
      return last && last + LIKE_COOLDOWN_SEC * 1000 > Date.now() ? 'cooldown' : 'idle';
    } catch { return 'idle'; }
  });

  async function handleLike() {
    if (likeState !== 'idle') return;
    setLikeState('sending');
    try {
      const result = await api.sendLike();
      try { localStorage.setItem(LIKE_STORAGE_KEY, String(result.sent_at)); } catch { /* ignore */ }
      setLikeState('sent');
    } catch (err) {
      const e = err as { type?: string; retry_after?: number };
      if (e.type === 'cooldown') {
        const sentAt = Date.now() - (LIKE_COOLDOWN_SEC - (e.retry_after ?? 0)) * 1000;
        try { localStorage.setItem(LIKE_STORAGE_KEY, String(sentAt)); } catch { /* ignore */ }
        setLikeState('cooldown');
      } else {
        setLikeState('idle');
      }
    }
  }

  const handleNotificationsToggle = async () => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result === 'granted') toggleNotifications();
    } else if (Notification.permission === 'granted') {
      toggleNotifications();
    }
  };

  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [, setSearchParams] = useSearchParams();
  const query = useSearchStore((s) => s.query);
  const setQuery = useSearchStore((s) => s.setQuery);
  const [localInput, setLocalInput] = useState(query);
  const debounceRef = useRef<number | null>(null);

  // Dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Session metadata from store
  const navSessionMeta = useChatInputStore((s) => s.navSessionMeta);
  const sessionActions = useChatInputStore((s) => s.sessionActions);
  const sessionFiles = useChatInputStore((s) => s.sessionFiles);
  const activeSessionId = useChatInputStore((s) => s.activeSessionId);
  const navPageContext = useChatInputStore((s) => s.navPageContext);

  // Apps pane
  const appsPaneVisible = useAppsPaneStore((s) => s.visible);
  const toggleAppsPane = useAppsPaneStore((s) => s.toggleVisible);

  // Title edit state (lives in Navbar now)
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Delete confirm state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset edit/delete state when session changes
  useEffect(() => {
    setIsEditingTitle(false);
    setEditingTitle('');
    setConfirmDelete(false);
    setIsDeleting(false);
  }, [activeSessionId]);

  // Close search when not on a page with search (optional UX)
  useEffect(() => {
    if (!isSearchOpen) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isSearchOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (query) next.set('q', query);
        else next.delete('q');
        return next;
      },
      { replace: true }
    );
  }, [query, setSearchParams]);

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalInput(value);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setQuery(value);
    }, 250);
  };

  function handleStartEditTitle() {
    setEditingTitle(navSessionMeta?.title || '');
    setIsEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  }

  async function handleSaveTitle() {
    if (!editingTitle.trim()) {
      setIsEditingTitle(false);
      return;
    }
    setIsSavingTitle(true);
    try {
      await sessionActions?.onSaveTitle(editingTitle.trim());
      setIsEditingTitle(false);
    } catch {
      // error handled inside onSaveTitle
    } finally {
      setIsSavingTitle(false);
    }
  }

  async function handleDeleteConfirmed() {
    setIsDeleting(true);
    try {
      await sessionActions?.onDeleteSession();
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }

  const isInChat = Boolean(activeSessionId);

  // Render title block (shared between chat and non-chat layouts)
  const titleBlock = isEditingTitle ? (
    <div className="flex items-center gap-1 min-w-0">
      <input
        ref={titleInputRef}
        type="text"
        value={editingTitle}
        onChange={(e) => setEditingTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSaveTitle();
          if (e.key === 'Escape') setIsEditingTitle(false);
        }}
        disabled={isSavingTitle}
        className="text-sm font-medium text-fg-primary bg-transparent border-b border-blue-500 outline-none min-w-0 w-40 sm:w-56 disabled:opacity-50"
        placeholder={t('chat.sessionTitlePlaceholder')}
      />
      <button type="button" onClick={handleSaveTitle} disabled={isSavingTitle || !editingTitle.trim()}
        className="p-1 rounded text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50 flex-shrink-0"
        aria-label={t('chat.saveTitle')}>
        {isSavingTitle ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </button>
      <button type="button" onClick={() => setIsEditingTitle(false)} disabled={isSavingTitle}
        className="p-1 rounded text-fg-muted hover:bg-bg-secondary disabled:opacity-50 flex-shrink-0"
        aria-label={t('chat.cancelEditing')}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-1 min-w-0">
      <span className="text-sm font-medium text-fg-primary truncate max-w-[140px] sm:max-w-[220px]">
        {navSessionMeta?.title || t('common.session')}
      </span>
      <button type="button" onClick={handleStartEditTitle}
        className="p-1 rounded text-fg-muted hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex-shrink-0"
        aria-label={t('chat.editTitle')} title={t('chat.editTitle')}>
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  );

  // Right-side session controls
  const sessionControls = (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div className="hidden sm:flex items-center gap-1.5">
        {navSessionMeta?.assistantName && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-bg-secondary text-fg-secondary border border-border-default">
            {navSessionMeta.assistantIcon && <span aria-hidden="true">{navSessionMeta.assistantIcon}</span>}
            <span className="truncate max-w-[80px]">{navSessionMeta.assistantName}</span>
          </span>
        )}
        {navSessionMeta?.model && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-bg-secondary text-fg-secondary border border-border-default truncate max-w-[100px]">
            {navSessionMeta.model}
          </span>
        )}
      </div>
      {sessionFiles.length > 0 && (
        <div className="hidden sm:block">
          <NavSessionFilesBar files={sessionFiles} />
        </div>
      )}
      {/* Apps pane toggle — desktop only */}
      <button
        type="button"
        onClick={toggleAppsPane}
        className={`hidden lg:flex p-1.5 rounded transition-colors ${
          appsPaneVisible
            ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
            : 'text-fg-muted hover:text-fg-primary hover:bg-bg-secondary'
        }`}
        aria-label={appsPaneVisible ? t('applications.hideApplications') : t('applications.showApplications')}
        title={appsPaneVisible ? t('applications.hideApplications') : t('applications.showApplications')}
      >
        <PanelRight className="w-3.5 h-3.5" />
      </button>
      {confirmDelete ? (
        <div className="flex items-center gap-1">
          <button type="button" onClick={handleDeleteConfirmed} disabled={isDeleting}
            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors disabled:opacity-50 flex items-center gap-1">
            {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            {t('chat.deleteConfirm')}
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)} disabled={isDeleting}
            className="px-2 py-1 bg-bg-secondary hover:bg-bg-muted text-fg-primary text-xs rounded transition-colors disabled:opacity-50">
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)}
          className="p-1.5 rounded text-fg-muted hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          aria-label={t('chat.deleteSession')} title={t('chat.deleteSession')}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}

    </div>
  );

  // Global controls (search + status + user)
  const globalControls = (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div className="hidden md:flex items-center">
        {isSearchOpen ? (
          <div className="flex items-center gap-1 w-44">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={localInput}
                onChange={handleSearchChange}
                onBlur={() => { if (!localInput) setIsSearchOpen(false); }}
                onKeyDown={(e) => { if (e.key === 'Escape') { setIsSearchOpen(false); setLocalInput(''); setQuery(''); } }}
                placeholder={t('nav.searchPlaceholder')}
                aria-label={t('nav.searchLabel')}
                className="w-full pl-7 pr-2 py-1 text-sm rounded-md border border-border-default bg-bg-secondary text-fg-primary focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button type="button" onClick={() => { setIsSearchOpen(false); setLocalInput(''); setQuery(''); }}
              className="p-1 rounded text-fg-muted hover:text-fg-primary" aria-label="Clear search">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setIsSearchOpen(true)}
            className="p-1.5 rounded-md text-fg-muted hover:text-fg-primary hover:bg-bg-secondary transition-colors"
            aria-label={t('nav.searchLabel')} title={`${t('nav.searchLabel')} (⌘K)`}>
            <Search className="w-4 h-4" />
          </button>
        )}
      </div>
      <HermesStatusIndicator />
      <div className="relative" ref={dropdownRef}>
        <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="flex items-center" aria-label={t('nav.userMenu')}>
          <div className="h-7 w-7 rounded-full border-2 border-green-500 bg-bg-muted flex items-center justify-center">
            <span className="text-xs font-medium text-fg-secondary">U</span>
          </div>
        </button>
        {isDropdownOpen && (
          <div className="absolute right-0 top-full mt-2 min-w-52 bg-bg-primary rounded-md shadow-lg py-1 border border-border-default z-[60]">
            <Link to="/settings" onClick={() => setIsDropdownOpen(false)}
              className="flex items-center px-4 py-2 text-sm text-fg-secondary hover:bg-bg-secondary">
              <Settings className="h-4 w-4 mr-2" />
              {t('nav.settings')}
            </Link>
            <hr className="my-1 border-border-default" />
            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleDarkMode}
              className="w-full flex items-center justify-between px-4 py-2 text-sm text-fg-secondary hover:bg-bg-secondary"
            >
              <span className="flex items-center gap-2">
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {isDarkMode ? t('nav.lightMode', { defaultValue: 'Light mode' }) : t('nav.darkMode', { defaultValue: 'Dark mode' })}
              </span>
            </button>
            {/* Notifications toggle */}
            <button
              type="button"
              onClick={handleNotificationsToggle}
              className="w-full flex items-center justify-between px-4 py-2 text-sm text-fg-secondary hover:bg-bg-secondary"
            >
              <span className="flex items-center gap-2">
                {notificationsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                {notificationsEnabled ? t('nav.notificationsOn') : t('nav.notificationsOff')}
              </span>
            </button>
            <hr className="my-1 border-border-default" />
            {/* Like */}
            <button
              type="button"
              onClick={handleLike}
              disabled={likeState !== 'idle'}
              className={`w-full flex items-center px-4 py-2 text-sm hover:bg-bg-secondary disabled:cursor-default transition-colors ${
                likeState === 'sent' ? 'text-pink-500 dark:text-pink-400'
                : likeState === 'cooldown' ? 'text-fg-muted'
                : 'text-fg-secondary hover:text-pink-500'
              }`}
            >
              <Heart className={`h-4 w-4 mr-2 ${likeState === 'sent' ? 'fill-pink-500 dark:fill-pink-400' : ''}`} />
              {likeState === 'sent' || likeState === 'cooldown' ? t('settings.liked') : t('settings.sendLike')}
            </button>
            {/* GitHub */}
            <a
              href="https://github.com/Pingvin1230/1230-ui"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setIsDropdownOpen(false)}
              className="flex items-center px-4 py-2 text-sm text-fg-secondary hover:bg-bg-secondary"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 mr-2 fill-current" aria-hidden="true">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              GitHub
            </a>
            <div className="px-4 py-1.5 text-xs text-fg-muted">{t('common.copyright')}</div>
            <hr className="my-1 border-border-default" />
            <button onClick={() => setIsDropdownOpen(false)}
              className="w-full flex items-center text-left px-4 py-2 text-sm text-fg-secondary hover:bg-bg-secondary">
              <LogOut className="h-4 w-4 mr-2" />
              {t('nav.logout')}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <nav className="flex-shrink-0 z-50 bg-bg-primary text-fg-primary shadow-md">
      <div className="h-[50px] flex items-center gap-2 px-3 sm:px-4">

        {/* Brand */}
        <div className="flex items-center flex-shrink-0">
          <Link to="/" className={`flex items-center no-underline ${isInChat ? 'hidden sm:flex' : 'flex'}`}>
            <span className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('nav.brand')}
            </span>
          </Link>
        </div>

        {isInChat ? (
          <>
            <div className="w-px h-4 bg-border-default flex-shrink-0" />
            <div className="min-w-0 flex-shrink-0">
              {titleBlock}
            </div>
            <div className="flex-1" />
            {sessionControls}
            <div className="w-px h-4 bg-border-default flex-shrink-0" />
          </>
        ) : navPageContext ? (
          <>
            <div className="w-px h-4 bg-border-default flex-shrink-0" />
            <span className="text-sm font-medium text-fg-primary flex-shrink-0">
              {navPageContext.title}
            </span>
            <div className="flex-1" />
            <div className="flex items-center gap-1 flex-shrink-0">
              {navPageContext.actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  aria-label={action.label}
                  title={action.label}
                  className={`p-1.5 rounded-md transition-colors ${
                    action.active
                      ? 'bg-accent/10 text-accent'
                      : 'text-fg-muted hover:text-fg-primary hover:bg-bg-secondary'
                  }`}
                >
                  {action.icon ?? <span className="text-xs font-medium">{action.label}</span>}
                </button>
              ))}
            </div>
            <div className="w-px h-4 bg-border-default flex-shrink-0" />
          </>
        ) : (
          <div className="flex-1" />
        )}

        {globalControls}

      </div>
    </nav>
  );
}
