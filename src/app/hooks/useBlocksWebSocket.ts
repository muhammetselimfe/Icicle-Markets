import { useState, useEffect, useRef, useCallback } from 'react';
import type { Block } from '../types/api';

interface UseBlocksWebSocketResult {
  blocks: Block[];
  connected: boolean;
  error: string | null;
  lastError: { message: string; timestamp: Date } | null;
  clearError: () => void;
}

const WS_URL = 'wss://api.l1beat.io/ws/blocks/43114';
const MAX_BLOCKS = 10;
const RECONNECT_BASE_DELAY = 3000;
const RECONNECT_MAX_DELAY = 30_000;

export function useBlocksWebSocket(): UseBlocksWebSocketResult {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<{ message: string; timestamp: Date } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  // Set on unmount so a close triggered by cleanup does not schedule a reconnect.
  const disposedRef = useRef(false);

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  const connect = useCallback(() => {
    if (disposedRef.current) return;

    // Clean up existing connection without triggering its reconnect handler
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'initial') {
            setBlocks(message.data.slice(0, MAX_BLOCKS));
          } else if (message.type === 'new_block') {
            setBlocks(prev => [message.data, ...prev].slice(0, MAX_BLOCKS));
          } else if (message.type === 'ping') {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong' }));
            }
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      ws.onerror = () => {
        setError('WebSocket connection error');
        setLastError({ message: 'WebSocket connection error', timestamp: new Date() });
      };

      ws.onclose = () => {
        setConnected(false);
        if (wsRef.current === ws) wsRef.current = null;
        if (disposedRef.current) return;

        // Reconnect with exponential backoff, capped
        const delay = Math.min(RECONNECT_BASE_DELAY * 2 ** attemptsRef.current, RECONNECT_MAX_DELAY);
        attemptsRef.current += 1;
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };
    } catch (err) {
      console.error('[WebSocket] Failed to connect:', err);
      setError('Failed to establish WebSocket connection');
      setLastError({ message: 'Failed to establish WebSocket connection', timestamp: new Date() });
    }
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    connect();

    return () => {
      disposedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { blocks, connected, error, lastError, clearError };
}
