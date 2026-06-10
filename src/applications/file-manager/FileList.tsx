import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, Search } from 'lucide-react';
import type { GlobalFile } from '../../lib/api';
import { FileRow } from './FileRow';

type SortKey = 'name' | 'date' | 'size' | 'expires';
type SortOrder = 'asc' | 'desc';
type FilterKey = 'all' | 'expiring' | 'images' | 'code' | 'documents';

interface FileListProps {
  files: GlobalFile[];
  search: string;
  sort: SortKey;
  order: SortOrder;
  filter: FilterKey;
  now: number;
  onSearchChange: (value: string) => void;
  onSortChange: (value: SortKey) => void;
  onOrderChange: (value: SortOrder) => void;
  onFilterChange: (value: FilterKey) => void;
  onExtend: (fileId: number) => Promise<void>;
  onDelete: (file: GlobalFile) => void;
}

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const CODE_MIMES = new Set([
  'text/x-python', 'text/javascript', 'application/javascript',
  'text/typescript', 'text/html', 'text/css', 'text/xml', 'application/xml',
  'application/json', 'text/csv', 'application/csv', 'text/yaml',
  'application/x-yaml', 'text/x-shellscript', 'application/x-sh',
  'application/sql', 'text/plain', 'text/markdown',
]);
const DOC_MIMES = new Set(['application/pdf']);

export function FileList({
  files,
  search,
  sort,
  order,
  filter,
  now,
  onSearchChange,
  onSortChange,
  onOrderChange,
  onFilterChange,
  onExtend,
  onDelete,
}: FileListProps) {
  const { t } = useTranslation();

  const filteredAndSorted = useMemo(() => {
    let result = [...files];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.filename.toLowerCase().includes(q));
    }

    if (filter === 'expiring') {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      result = result.filter((f) => f.expiresAt && f.expiresAt - now < sevenDaysMs && f.expiresAt > now);
    } else if (filter === 'images') {
      result = result.filter((f) => f.mimeType && IMAGE_MIMES.includes(f.mimeType));
    } else if (filter === 'code') {
      result = result.filter((f) => f.mimeType && CODE_MIMES.has(f.mimeType));
    } else if (filter === 'documents') {
      result = result.filter((f) => f.mimeType && DOC_MIMES.has(f.mimeType));
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sort) {
        case 'name':
          cmp = a.filename.localeCompare(b.filename);
          break;
        case 'date':
          cmp = a.uploadedAt - b.uploadedAt;
          break;
        case 'size':
          cmp = a.size - b.size;
          break;
        case 'expires':
          cmp = (a.expiresAt || Infinity) - (b.expiresAt || Infinity);
          break;
      }
      return order === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [files, search, sort, order, filter, now]);

  const emptyMessage = useMemo(() => {
    if (filteredAndSorted.length > 0) return null;
    if (files.length === 0) return null;
    if (search.trim()) return t('fileManager.empty.noSearch', { query: search });
    if (filter !== 'all') return t('fileManager.empty.noMatch');
    return null;
  }, [filteredAndSorted.length, files.length, search, filter, t]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 flex items-center gap-2 px-4 py-2 bg-bg-primary border-b border-border-default z-10">
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className="px-2 py-1 text-sm bg-bg-secondary border border-border-default rounded"
        >
          <option value="date">{t('fileManager.sort.date')}</option>
          <option value="name">{t('fileManager.sort.name')}</option>
          <option value="size">{t('fileManager.sort.size')}</option>
          <option value="expires">{t('fileManager.sort.expires')}</option>
        </select>

        <button
          type="button"
          onClick={() => onOrderChange(order === 'asc' ? 'desc' : 'asc')}
          className="p-1.5 text-fg-secondary hover:bg-bg-secondary rounded"
        >
          {order === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
        </button>

        <select
          value={filter}
          onChange={(e) => onFilterChange(e.target.value as FilterKey)}
          className="px-2 py-1 text-sm bg-bg-secondary border border-border-default rounded"
        >
          <option value="all">{t('fileManager.filter.all')}</option>
          <option value="expiring">{t('fileManager.filter.expiring')}</option>
          <option value="images">{t('fileManager.filter.images')}</option>
          <option value="code">{t('fileManager.filter.code')}</option>
          <option value="documents">{t('fileManager.filter.documents')}</option>
        </select>

        <div className="flex-1 relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            placeholder={t('fileManager.search')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-7 pr-2 py-1 text-sm bg-bg-secondary border border-border-default rounded"
          />
        </div>
      </div>

      {emptyMessage ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-fg-muted">{emptyMessage}</p>
        </div>
      ) : (
        <div className="divide-y divide-border-default">
          {filteredAndSorted.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              now={now}
              onExtend={onExtend}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
