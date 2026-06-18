import { useState, useCallback } from 'react';
import { Cloud, WifiOff, Wifi, Loader2, ChevronDown, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCloudConnectStore } from '../../../store/cloudConnectStore';

export function ConnectionChips() {
  const connections = useCloudConnectStore((s) => s.connections);
  const selectedConnectionId = useCloudConnectStore((s) => s.selectedConnectionId);
  const disconnectedIds = useCloudConnectStore((s) => s.disconnectedIds);
  const selectConnection = useCloudConnectStore((s) => s.selectConnection);
  const disconnectConnection = useCloudConnectStore((s) => s.disconnectConnection);
  const reconnectConnection = useCloudConnectStore((s) => s.reconnectConnection);

  const [reconnecting, setReconnecting] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const activeConn = connections.find((c) => c.id === selectedConnectionId) ?? null;
  const isDisconnected = activeConn ? disconnectedIds.has(activeConn.id) : false;

  const handleDisconnect = useCallback(() => {
    if (activeConn) disconnectConnection(activeConn.id);
  }, [activeConn, disconnectConnection]);

  const handleReconnect = useCallback(async () => {
    if (!activeConn) return;
    setReconnecting(activeConn.id);
    try {
      await reconnectConnection(activeConn.id);
    } finally {
      setReconnecting(null);
    }
  }, [activeConn, reconnectConnection]);

  const handleSwitch = useCallback((id: number) => {
    setShowPicker(false);
    if (disconnectedIds.has(id)) {
      reconnectConnection(id);
    } else {
      selectConnection(id);
    }
  }, [disconnectedIds, selectConnection, reconnectConnection]);

  if (connections.length === 0) return null;

  return (
    <div className="flex-shrink-0 border-b border-border-default bg-bg-primary">
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Connection icon + status */}
        <div className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${
          isDisconnected ? 'bg-gray-100 dark:bg-gray-800 text-fg-muted' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
        }`}>
          {isDisconnected
            ? <WifiOff className="w-3.5 h-3.5" />
            : <Cloud className="w-3.5 h-3.5" />
          }
        </div>

        {/* Connection name + switcher */}
        <div className="flex-1 min-w-0 relative">
          <button
            type="button"
            onClick={() => connections.length > 1 && setShowPicker((v) => !v)}
            className={`flex items-center gap-1 w-full text-left ${connections.length > 1 ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <span className="text-sm font-medium text-fg-primary truncate">
              {activeConn?.label ?? '—'}
            </span>
            {connections.length > 1 && (
              <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-fg-muted" />
            )}
          </button>
          <p className="text-xs text-fg-muted truncate">{activeConn?.url ?? ''}</p>

          {/* Dropdown picker */}
          {showPicker && connections.length > 1 && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-bg-primary border border-border-default rounded-lg shadow-lg z-20 py-1">
              {connections.map((conn) => {
                const isConn = conn.id === selectedConnectionId;
                const isOff = disconnectedIds.has(conn.id);
                return (
                  <button
                    key={conn.id}
                    type="button"
                    onClick={() => handleSwitch(conn.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-bg-secondary transition-colors ${isConn ? 'text-blue-600 dark:text-blue-400' : 'text-fg-primary'}`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      isOff ? 'bg-gray-400' : conn.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                    <span className="truncate">{conn.label}</span>
                    {isConn && <span className="ml-auto text-xs text-fg-muted">active</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Disconnect / Reconnect toggle */}
        {activeConn && (
          isDisconnected ? (
            <button
              type="button"
              onClick={handleReconnect}
              disabled={reconnecting === activeConn.id}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors disabled:opacity-50"
              title="Reconnect"
            >
              {reconnecting === activeConn.id
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Wifi className="w-3 h-3" />
              }
              Connect
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDisconnect}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md text-fg-muted hover:bg-bg-secondary transition-colors"
              title="Disconnect"
            >
              <WifiOff className="w-3 h-3" />
              Disconnect
            </button>
          )
        )}

        {/* Settings link */}
        <Link
          to="/settings/cloud"
          className="flex-shrink-0 p-1.5 text-fg-muted hover:text-fg-primary hover:bg-bg-secondary rounded-md transition-colors"
          title="Cloud Connect settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
