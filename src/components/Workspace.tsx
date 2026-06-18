import {
  useWorkspaceStore,
  EXECUTOR_LABEL,
  WORKSPACE_EXECUTORS,
} from '../store/workspaceStore';
import { SessionsPage } from '../pages/SessionsPage';
import { ChatPage } from '../pages/ChatPage';
import { ExecutorToolbar } from './ExecutorToolbar';
import { ExecutorStatusDot } from './ExecutorStatusDot';
import { WorkspaceSessionControls } from './WorkspaceSessionControls';

export function Workspace() {
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const activeSessionByExecutor = useWorkspaceStore((s) => s.activeSessionByExecutor);

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
      active
        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
        : 'text-fg-secondary hover:bg-bg-secondary'
    }`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-3 py-2 border-b border-border-default bg-bg-primary">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 overflow-x-auto flex-1 min-w-0">
            {WORKSPACE_EXECUTORS.map((executor) => (
              <button
                key={executor}
                type="button"
                onClick={() => setActiveTab(executor)}
                className={tabClass(activeTab === executor)}
              >
                <ExecutorStatusDot executor={executor} />
                <span>{EXECUTOR_LABEL[executor]}</span>
              </button>
            ))}
          </div>
          {activeTab !== 'sessions' && !!activeSessionByExecutor[activeTab] && (
            <WorkspaceSessionControls />
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-bg-secondary">
        <div className={activeTab === 'sessions' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
          <SessionsPage />
        </div>
        {WORKSPACE_EXECUTORS.map((executor) => (
          <div
            key={executor}
            className={activeTab === executor ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}
          >
            <ExecutorToolbar executor={executor} />
            <div className="flex-1 min-h-0 flex flex-col">
              <ChatPage
                sessionId={activeSessionByExecutor[executor]}
                isActive={activeTab === executor}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
