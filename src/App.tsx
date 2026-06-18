import { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { PageSkeleton } from './components/PageSkeleton';
import i18n from './i18n';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const Workspace = lazy(() => import('./components/Workspace').then((m) => ({ default: m.Workspace })));
const ChatRouteResolver = lazy(() => import('./components/ChatRouteResolver').then((m) => ({ default: m.ChatRouteResolver })));
const NewSessionPage = lazy(() => import('./pages/NewSessionPage').then((m) => ({ default: m.NewSessionPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ProvidersPage = lazy(() => import('./pages/ProvidersPage').then((m) => ({ default: m.ProvidersPage })));
const AssistantsPage = lazy(() => import('./pages/AssistantsPage').then((m) => ({ default: m.AssistantsPage })));
const AssistantEditPage = lazy(() => import('./pages/AssistantEditPage').then((m) => ({ default: m.AssistantEditPage })));
const ApplicationsPage = lazy(() => import('./pages/ApplicationsPage').then((m) => ({ default: m.ApplicationsPage })));
const CloudSettingsPage = lazy(() => import('./pages/CloudSettingsPage').then((m) => ({ default: m.CloudSettingsPage })));
const HermesSettingsPage = lazy(() => import('./pages/HermesSettingsPage').then((m) => ({ default: m.HermesSettingsPage })));
const OpenCodeSettingsPage = lazy(() => import('./pages/OpenCodeSettingsPage').then((m) => ({ default: m.OpenCodeSettingsPage })));
const TududiSettingsPage = lazy(() => import('./pages/TududiSettingsPage').then((m) => ({ default: m.TududiSettingsPage })));

interface RouteBoundaryProps {
  children: ReactNode;
}

interface RouteBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class RouteErrorBoundary extends Component<RouteBoundaryProps, RouteBoundaryState> {
  constructor(props: RouteBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): RouteBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[RouteErrorBoundary] Caught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoBack = () => {
    window.history.back();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-bg-primary border border-red-200 dark:border-red-800 rounded-xl shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-fg-primary">
                {i18n.t('errorBoundary.title')}
              </h2>
            </div>

            <p className="text-sm text-fg-secondary mb-4">
              {this.state.error?.message || i18n.t('errorBoundary.unknownError')}
            </p>

            {this.state.errorInfo && (
              <details className="mb-4">
                <summary className="text-xs text-fg-muted cursor-pointer hover:text-fg-secondary">
                  {i18n.t('errorBoundary.showDetails')}
                </summary>
                <pre className="mt-2 text-xs font-mono bg-bg-secondary p-3 rounded overflow-x-auto text-fg-secondary max-h-40">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={this.handleRetry}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                {i18n.t('common.retry')}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={this.handleGoBack}
                  className="flex-1 px-4 py-2 border border-border-default text-fg-secondary hover:bg-bg-secondary text-sm rounded-lg transition-colors"
                >
                  {i18n.t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="flex-1 px-4 py-2 border border-border-default text-fg-secondary hover:bg-bg-secondary text-sm rounded-lg transition-colors"
                >
                  {i18n.t('errorBoundary.reloadPage')}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function RouteBoundary({ children }: RouteBoundaryProps) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<RouteBoundary><DashboardPage /></RouteBoundary>} />
              <Route path="sessions" element={<RouteBoundary><Workspace /></RouteBoundary>} />
              <Route path="chat/:id" element={<RouteBoundary><ChatRouteResolver /></RouteBoundary>} />
              <Route path="new" element={<RouteBoundary><NewSessionPage /></RouteBoundary>} />
              <Route path="settings" element={<RouteBoundary><SettingsPage /></RouteBoundary>} />
              <Route path="settings/providers" element={<RouteBoundary><ProvidersPage /></RouteBoundary>} />
              <Route path="assistants" element={<RouteBoundary><AssistantsPage /></RouteBoundary>} />
              <Route path="assistants/new" element={<RouteBoundary><AssistantEditPage /></RouteBoundary>} />
              <Route path="assistants/:id" element={<RouteBoundary><AssistantEditPage /></RouteBoundary>} />
              <Route path="applications" element={<RouteBoundary><ApplicationsPage /></RouteBoundary>} />
              <Route path="settings/cloud" element={<RouteBoundary><CloudSettingsPage /></RouteBoundary>} />
              <Route path="settings/executors/hermes-agent" element={<RouteBoundary><HermesSettingsPage /></RouteBoundary>} />
              <Route path="settings/executors/opencode" element={<RouteBoundary><OpenCodeSettingsPage /></RouteBoundary>} />
              <Route path="settings/tududi" element={<RouteBoundary><TududiSettingsPage /></RouteBoundary>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}
