/**
 * Main App Component
 * Implements Excalidraw frontend with:
 * - Theme management (system/light/dark)
 * - localStorage persistence for canvas and viewport
 * - Export functionality (PNG, SVG, JSON)
 * - Real-time WebSocket sync with backend
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Excalidraw, MainMenu, languages, exportToBlob, exportToSvg, CaptureUpdateAction } from '@excalidraw/excalidraw';
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawElement,
  AppState,
} from '@excalidraw/excalidraw/types/types';
import '@excalidraw/excalidraw/index.css';

import type { PersistedCanvasState, WebSocketMessage, ServerElement } from './types';
import { STORAGE_KEYS } from './types';
import { validateAndFixBindings, cleanElementForExcalidraw } from './utils/validation';
import { toServerElements } from './utils/elementConverter';
import { useWebSocket } from './hooks/useWebSocket';
import { getCanvasState, syncElementsToBackend } from './services/api';

// Debounce helper for localStorage saves
function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

// Throttle helper for WebSocket sync
function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
}

// Sync status type
type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

function App() {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const initialLoadDone = useRef(false);
  const isUpdatingFromWebSocket = useRef(false);

  // Sync state management
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Preferred theme management (user's choice: 'system' | 'light' | 'dark')
  const [preferredTheme, setPreferredTheme] = useState<'system' | 'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('excalidraw-theme');
      return (saved === 'system' || saved === 'light' || saved === 'dark') ? saved : 'light';
    } catch {
      return 'light';
    }
  });

  // Language management (with localStorage persistence)
  const [currentLang, setCurrentLang] = useState<string>(() => {
    try {
      return localStorage.getItem('excalidraw-language') || 'pt-BR';
    } catch {
      return 'pt-BR';
    }
  });

  // WebSocket URL from environment
  const wsUrl = import.meta.env.VITE_WS_SERVER_URL || 'ws://localhost:3333';

  // Function to resolve theme (convert 'system' to 'light' or 'dark')
  const resolveTheme = useCallback((theme: 'system' | 'light' | 'dark'): 'light' | 'dark' => {
    if (theme !== 'system') return theme;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }, []);

  // Resolved theme (always 'light' or 'dark')
  const resolvedTheme = React.useMemo(() => {
    return resolveTheme(preferredTheme);
  }, [preferredTheme, resolveTheme]);

  // Display developer signature on app load
  useEffect(() => {
    console.log(
      '%c🎨 Excalidraw MCP',
      'color: #6965db; font-size: 12px; font-weight: bold;'
    );
    console.log(
      '%cDeveloped by: Whallysson Avelino',
      'color: #6965db; font-size: 12px;'
    );
  }, []);

  // Listen to system theme changes when using 'system' theme
  useEffect(() => {
    if (preferredTheme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (): void => {
      if (excalidrawAPI && preferredTheme === 'system') {
        excalidrawAPI.updateScene({
          appState: {
            theme: mediaQuery.matches ? 'dark' : 'light',
          },
        });
      }
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [preferredTheme, excalidrawAPI]);

  // Load persisted canvas state BEFORE rendering (useMemo for performance)
  // This ensures viewport (scrollX, scrollY, zoom) is applied on initial render
  const initialData = React.useMemo(() => {
    try {
      const savedState = localStorage.getItem(STORAGE_KEYS.CANVAS_STATE);
      const savedScrollX = localStorage.getItem('excalidraw-scrollX');
      const savedScrollY = localStorage.getItem('excalidraw-scrollY');
      const savedZoom = localStorage.getItem('excalidraw-zoom');
      const savedBackgroundColor = localStorage.getItem('excalidraw-viewBackgroundColor');
      const savedGridMode = localStorage.getItem('excalidraw-gridModeEnabled');
      const savedZenMode = localStorage.getItem('excalidraw-zenModeEnabled');

      let elements: ExcalidrawElement[] = [];
      let appState: Partial<AppState> = {
        theme: resolvedTheme,
        viewBackgroundColor: savedBackgroundColor || '#ffffff',
        gridModeEnabled: savedGridMode === 'true',
        zenModeEnabled: savedZenMode === 'true',
      };

      // Load canvas elements
      if (savedState) {
        const parsed: PersistedCanvasState = JSON.parse(savedState);
        elements = validateAndFixBindings(parsed.elements || []) as ExcalidrawElement[];
        appState = {
          ...appState,
          ...(parsed.appState || {}),
        };
      }

      // CRITICAL: Load viewport BEFORE rendering to ensure zoom/position persists
      if (savedScrollX || savedScrollY || savedZoom) {
        appState = {
          ...appState,
          scrollX: savedScrollX ? parseFloat(savedScrollX) : 0,
          scrollY: savedScrollY ? parseFloat(savedScrollY) : 0,
          zoom: savedZoom ? { value: parseFloat(savedZoom) as any } : { value: 1 as any },
        };
      }

      return { elements, appState };
    } catch (error) {
      // Failed to load canvas state from localStorage
      return {
        elements: [],
        appState: {
          theme: resolvedTheme,
          viewBackgroundColor: '#ffffff',
          gridModeEnabled: false,
          zenModeEnabled: false,
        },
      };
    }
  }, [resolvedTheme]); // Only re-compute if theme changes

  // Save canvas state to localStorage (debounced)
  const saveCanvasState = useCallback(
    debounce((elements: readonly ExcalidrawElement[], appState: AppState) => {
      try {
        // Save canvas elements
        const canvasState: PersistedCanvasState = {
          elements: elements as ExcalidrawElement[],
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            currentItemFontFamily: appState.currentItemFontFamily,
            currentItemFontSize: appState.currentItemFontSize,
            currentItemStrokeColor: appState.currentItemStrokeColor,
            currentItemBackgroundColor: appState.currentItemBackgroundColor,
            gridSize: appState.gridSize,
          },
          version: 1,
          lastSaved: new Date().toISOString(),
        };
        localStorage.setItem(STORAGE_KEYS.CANVAS_STATE, JSON.stringify(canvasState));

        // Save viewport separately for quick restoration
        const viewport = {
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          zoom: appState.zoom,
        };
        localStorage.setItem(STORAGE_KEYS.VIEWPORT, JSON.stringify(viewport));

        // Save UI preferences separately
        if (appState.gridModeEnabled !== undefined) {
          localStorage.setItem('excalidraw-gridModeEnabled', String(appState.gridModeEnabled));
        }
        if (appState.zenModeEnabled !== undefined) {
          localStorage.setItem('excalidraw-zenModeEnabled', String(appState.zenModeEnabled));
        }
        if (appState.viewBackgroundColor) {
          localStorage.setItem('excalidraw-viewBackgroundColor', appState.viewBackgroundColor);
        }
      } catch (error) {
        // Failed to save canvas state to localStorage
      }
    }, 1000), // 1 second debounce
    []
  );

  // Format sync time display
  const formatSyncTime = (time: Date | null): string => {
    if (!time) return '';
    return time.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Sync elements to backend (throttled)
  const syncToBackend = useCallback(
    throttle((elements: readonly ExcalidrawElement[]) => {
      if (!syncEnabled || !wsRef.current) return;

      setSyncStatus('syncing');

      const serverElements = toServerElements(elements as ExcalidrawElement[], 'frontend');

      wsRef.current.send({
        type: 'sync_to_backend',
        canvasId: 'main',
        elements: serverElements,
        timestamp: new Date().toISOString(),
        source: 'frontend',
      });

      // Backend will send 'sync_response' to confirm sync completion
      // handleWebSocketMessage will update status when confirmation is received
    }, 3000), // 3 second throttle
    [syncEnabled]
  );

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    if (!excalidrawAPI) return;

    // Prevent echo loops - ignore messages from our own source
    if (message.source === 'frontend') {
      // Ignoring echo from frontend source
      return;
    }

    switch (message.type) {
      case 'sync_response':
        // Backend confirms sync was successful
        setSyncStatus('idle');
        setLastSyncTime(new Date());
        setHasUnsavedChanges(false);
        break;

      case 'initial_elements':  // Backend sends this on connection
      case 'element_created':
      case 'element_updated':
      case 'element_deleted': {
        // Support both singular 'element' and plural 'elements'
        const incomingElements = message.elements || (message.element ? [message.element] : []);

        if (incomingElements.length > 0) {
          isUpdatingFromWebSocket.current = true;

          // Clean server metadata from elements
          const cleanedElements = incomingElements.map(cleanElementForExcalidraw);

          // Merge with existing elements
          const currentElements = excalidrawAPI.getSceneElements();

          const newElementsMap = new Map(cleanedElements.map((el: any) => [el.id, el]));

          // Update or add elements
          const mergedElements = currentElements.map((el) => {
            const updated = newElementsMap.get(el.id);
            if (updated) {
              newElementsMap.delete(el.id);
              return updated;
            }
            return el;
          });

          // Add new elements that don't exist
          newElementsMap.forEach((el) => {
            mergedElements.push(el);
          });

          // Validate and update scene
          const validated = validateAndFixBindings(mergedElements) as ExcalidrawElement[];

          excalidrawAPI.updateScene({
            elements: validated,
            captureUpdate: CaptureUpdateAction.NEVER  // Prevent onChange loop
          });

          // Reset flag after React update cycle
          setTimeout(() => {
            isUpdatingFromWebSocket.current = false;
          }, 100);
        }
        break;
      }

      default:
        // Unknown message type
    }
  }, [excalidrawAPI]);

  // WebSocket callbacks (memoized to prevent recreating connections)
  const wsRef = useRef<ReturnType<typeof useWebSocket> | null>(null);

  const onConnect = useCallback(() => {
    // Request initial sync when connected
    if (wsRef.current) {
      wsRef.current.send({
        type: 'sync_request',
        canvasId: 'main',
        timestamp: new Date().toISOString(),
      });
    }
  }, []);

  const onDisconnect = useCallback(() => {
    // WebSocket disconnected
  }, []);

  const onError = useCallback((error: Event) => {
    // WebSocket error
  }, []);

  // Initialize WebSocket connection (memoized config)
  const ws = useWebSocket({
    url: wsUrl,
    onMessage: handleWebSocketMessage,
    onConnect,
    onDisconnect,
    onError,
  });

  wsRef.current = ws;

  // Handle theme changes from ToggleTheme component
  const handleThemeChange = useCallback(
    (theme: 'system' | 'light' | 'dark'): void => {
      setPreferredTheme(theme);
      localStorage.setItem('excalidraw-theme', theme);

      // Update Excalidraw canvas theme immediately
      if (excalidrawAPI) {
        excalidrawAPI.updateScene({
          appState: {
            theme: resolveTheme(theme),
          },
        });
      }
    },
    [excalidrawAPI, resolveTheme]
  );

  // Handle element changes (save to localStorage and mark as unsaved)
  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState) => {
      if (!initialLoadDone.current) return;

      // Skip if update came from WebSocket (prevent echo loop)
      if (isUpdatingFromWebSocket.current) {
        return;
      }

      saveCanvasState(elements, appState);

      // Mark as unsaved (will sync on pointer up)
      if (elements && elements.length > 0) {
        setHasUnsavedChanges(true);
      }
    },
    [saveCanvasState]
  );

  // Throttled sync on pointer up (more efficient than onChange)
  const throttledSyncOnPointerUp = useRef(
    throttle(() => {
      if (hasUnsavedChanges && excalidrawAPI && syncEnabled) {
        const elements = excalidrawAPI.getSceneElements();
        syncToBackend(elements);
      }
    }, 3000, { leading: true, trailing: false })
  ).current;

  // Handle pointer up (when user releases mouse - finishes action)
  const handlePointerUp = useCallback(() => {
    if (hasUnsavedChanges && syncEnabled) {
      throttledSyncOnPointerUp();
    }
  }, [hasUnsavedChanges, syncEnabled, throttledSyncOnPointerUp]);

  // Mark initial load as done when API is ready
  useEffect(() => {
    if (excalidrawAPI && !initialLoadDone.current) {
      initialLoadDone.current = true;
    }
  }, [excalidrawAPI]);

  // Update theme when it changes
  useEffect(() => {
    if (!excalidrawAPI) return;

    excalidrawAPI.updateScene({
      appState: {
        theme: resolvedTheme,
      },
    });
  }, [excalidrawAPI, resolvedTheme]);

  // Event listeners for critical sync (prevent data loss)
  useEffect(() => {
    // Sync when switching tabs (visibilitychange)
    const handleVisibilityChange = (): void => {
      if (document.hidden && hasUnsavedChanges && excalidrawAPI && syncEnabled) {
        const elements = excalidrawAPI.getSceneElements();
        syncToBackend(elements);
      }
    };

    // Sync when closing browser/tab (pagehide - more reliable than beforeunload)
    const handlePageHide = (): void => {
      if (hasUnsavedChanges && excalidrawAPI && syncEnabled) {
        const elements = excalidrawAPI.getSceneElements();
        syncToBackend(elements);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [hasUnsavedChanges, excalidrawAPI, syncEnabled, syncToBackend]);

  // Manual sync handler
  const handleManualSync = useCallback(async () => {
    if (!excalidrawAPI) return;

    try {
      const elements = excalidrawAPI.getSceneElements();
      const serverElements = toServerElements(elements as ExcalidrawElement[], 'frontend');

      const result = await syncElementsToBackend('main', serverElements);

      if (result.success) {
        alert(`Synced ${result.data?.synced} elements to backend!`);
      } else {
        alert(`Sync failed: ${result.error?.message}`);
      }
    } catch (error) {
      alert('Sync failed.');
    }
  }, [excalidrawAPI]);

  // Load from backend handler
  const handleLoadFromBackend = useCallback(async () => {
    if (!excalidrawAPI) return;

    try {
      const result = await getCanvasState('main');

      if (result.success && result.data) {
        const validated = validateAndFixBindings(result.data.elements) as ExcalidrawElement[];
        excalidrawAPI.updateScene({ elements: validated });
        alert(`Loaded ${validated.length} elements from backend!`);
      } else {
        alert(`Load failed: ${result.error?.message}`);
      }
    } catch (error) {
      alert('Load failed.');
    }
  }, [excalidrawAPI]);

  // Export handlers
  const handleExportPNG = useCallback(async () => {
    if (!excalidrawAPI) return;

    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();

      const blob = await exportToBlob({
        elements,
        appState,
        files,
        mimeType: 'image/png',
      });

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `excalidraw-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to export PNG.');
    }
  }, [excalidrawAPI]);

  const handleExportSVG = useCallback(async () => {
    if (!excalidrawAPI) return;

    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();

      const svg = await exportToSvg({
        elements,
        appState,
        files,
      });

      // Convert SVG to blob
      const svgString = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `excalidraw-${Date.now()}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to export SVG.');
    }
  }, [excalidrawAPI]);

  const handleExportJSON = useCallback(() => {
    if (!excalidrawAPI) return;

    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();

      const data = {
        type: 'excalidraw',
        version: 2,
        source: 'excalidraw-mcp-frontend',
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize,
        },
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });

      // Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `excalidraw-${Date.now()}.excalidraw`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to export JSON.');
    }
  }, [excalidrawAPI]);

  // Handler for language change
  const handleLanguageChange = useCallback((langCode: string) => {
    setCurrentLang(langCode);
    localStorage.setItem('excalidraw-language', langCode);
  }, []);

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>
      <Excalidraw
        excalidrawAPI={(api) => setExcalidrawAPI(api)}
        onChange={handleChange}
        onPointerUp={handlePointerUp}
        onScrollChange={(scrollX: number, scrollY: number, zoom: any) => {
          // Persist viewport automatically (official Excalidraw callback)
          localStorage.setItem('excalidraw-scrollX', String(scrollX));
          localStorage.setItem('excalidraw-scrollY', String(scrollY));
          if (zoom && typeof zoom.value === 'number') {
            localStorage.setItem('excalidraw-zoom', String(zoom.value));
          }
        }}
        langCode={currentLang}
        initialData={initialData}
        renderTopRightUI={() => (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              paddingRight: 8,
            }}
          >
            {/* Connection Status */}
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: ws.isConnected ? '#4caf50' : '#f44336',
                boxShadow: ws.isConnected
                  ? '0 0 4px #4caf50'
                  : '0 0 4px #f44336',
              }}
              title={ws.isConnected ? 'Connected' : 'Disconnected'}
            />

            {/* Sync Status (quando habilitado) */}
            {syncEnabled && (
              <>
                {/* Última sincronização */}
                {lastSyncTime && syncStatus === 'idle' && !hasUnsavedChanges && (
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--color-text-secondary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatSyncTime(lastSyncTime)}
                  </span>
                )}

                {/* Botão sync manual */}
                <button
                  onClick={() => {
                    if (excalidrawAPI) {
                      const elements = excalidrawAPI.getSceneElements();
                      syncToBackend(elements);
                    }
                  }}
                  disabled={syncStatus === 'syncing' || !excalidrawAPI}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--color-border-default)',
                    borderRadius: '4px',
                    backgroundColor:
                      syncStatus === 'syncing'
                        ? 'var(--color-surface-secondary)'
                        : hasUnsavedChanges
                          ? 'var(--color-primary)'
                          : 'var(--color-surface-primary)',
                    color: hasUnsavedChanges ? 'white' : 'var(--color-text-primary)',
                    cursor: syncStatus === 'syncing' || !excalidrawAPI ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: syncStatus === 'syncing' || !excalidrawAPI ? 0.6 : 1,
                    transition: 'all 0.2s ease',
                  }}
                  title={hasUnsavedChanges ? 'Há mudanças não salvas' : 'Sincronizar com backend'}
                >
                  <span style={{ fontSize: '16px' }}>
                    {syncStatus === 'syncing' ? '⟳' : '↻'}
                  </span>
                  <span>
                    {syncStatus === 'syncing' ? 'Syncing...' : hasUnsavedChanges ? 'Sync*' : 'Sync'}
                  </span>
                </button>
              </>
            )}
          </div>
        )}
      >
        <MainMenu>
          {/* Native Scene Management Items */}
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SaveToActiveFile />

          <MainMenu.Separator />

          {/* Native Tools */}
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />

          <MainMenu.Separator />

          {/* Native Canvas Items */}
          <MainMenu.DefaultItems.ClearCanvas />

          <MainMenu.Separator />

          {/* Custom Sync Group (application-specific) */}
          <MainMenu.Group title="Sync">
            <MainMenu.Item
              onSelect={() => setSyncEnabled(!syncEnabled)}
              selected={syncEnabled}
            >
              Auto-Sync: {syncEnabled ? 'ON' : 'OFF'}
            </MainMenu.Item>
            <MainMenu.Item onSelect={handleManualSync}>
              Sync to Backend Now
            </MainMenu.Item>
            <MainMenu.Item onSelect={handleLoadFromBackend}>
              Load from Backend
            </MainMenu.Item>
          </MainMenu.Group>

          <MainMenu.Separator />

          {/* Custom Export Group (additional export options) */}
          <MainMenu.Group title="Export">
            <MainMenu.Item onSelect={handleExportPNG}>Export as PNG</MainMenu.Item>
            <MainMenu.Item onSelect={handleExportSVG}>Export as SVG</MainMenu.Item>
            <MainMenu.Item onSelect={handleExportJSON}>Export as JSON</MainMenu.Item>
          </MainMenu.Group>

          <MainMenu.Separator />

        {/* Native Theme Toggle (replaces custom theme buttons) */}
        <MainMenu.DefaultItems.ToggleTheme
            allowSystemTheme
            theme={preferredTheme}
            onSelect={handleThemeChange}
        />
        <MainMenu.DefaultItems.ChangeCanvasBackground />

        <MainMenu.Separator />

          {/* Custom Language Selector (application-specific) */}
          <MainMenu.Group title="Language">
            <MainMenu.ItemCustom>
              <select
                value={currentLang}
                onChange={(e) => handleLanguageChange(e.target.value)}
                style={{
                  width: '100%',
                  cursor: 'pointer',
                }}
                className="dropdown-select dropdown-select__language"
                aria-label="Selecionar idioma"
              >
                {languages.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </MainMenu.ItemCustom>
          </MainMenu.Group>
        </MainMenu>
      </Excalidraw>
    </div>
  );
}

export default App;
