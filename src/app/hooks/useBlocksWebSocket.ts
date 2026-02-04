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
const RECONNECT_DELAY = 3000;

export function useBlocksWebSocket(): UseBlocksWebSocketResult {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<{ message: string; timestamp: Date } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  const connect = useCallback(() => {
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected to blocks stream');
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'initial') {
            // Initial batch of blocks
            console.log('[WebSocket] Received initial blocks:', message.data.length);
            setBlocks(message.data.slice(0, MAX_BLOCKS));
          } else if (message.type === 'new_block') {
            // New block - add to front, remove oldest
            console.log('[WebSocket] New block:', message.data.block_number);
            setBlocks(prev => {
              const newBlocks = [message.data, ...prev];
              return newBlocks.slice(0, MAX_BLOCKS);
            });
          } else if (message.type === 'ping') {
            // Respond with pong
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong' }));
            }
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('[WebSocket] Error:', event);
        setError('WebSocket connection error');
        setLastError({ message: 'WebSocket connection error', timestamp: new Date() });
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Disconnected, code:', event.code);
        setConnected(false);
        wsRef.current = null;

        // Attempt to reconnect after delay
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[WebSocket] Attempting to reconnect...');
          connect();
        }, RECONNECT_DELAY);
      };
    } catch (err) {
      console.error('[WebSocket] Failed to connect:', err);
      setError('Failed to establish WebSocket connection');
      setLastError({ message: 'Failed to establish WebSocket connection', timestamp: new Date() });
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return { blocks, connected, error, lastError, clearError };
}
