import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Script node types:
 *   dialogue  – { id, type:"dialogue", character, text, next }
 *   choice    – { id, type:"choice", choices:[{ label, goto }] }
 *   background– { id, type:"background", src, next }
 *   sprite    – { id, type:"sprite", character, src, position, next }
 *   end       – { id, type:"end" }
 */

const NON_INTERACTIVE = new Set(['background', 'sprite']);

export function useVNEngine(script) {
  const nodeMap = useRef(Object.fromEntries(script.map((n) => [n.id, n]))).current;

  const [currentId, setCurrentId] = useState(script[0]?.id ?? null);
  const [background, setBackground] = useState(null);
  const [sprites, setSprites] = useState({});
  const [history, setHistory] = useState([]);

  // Auto-process non-interactive nodes so the screen never gets stuck blank
  useEffect(() => {
    const node = currentId ? nodeMap[currentId] : null;
    if (!node || !NON_INTERACTIVE.has(node.type)) return;

    if (node.type === 'background') {
      setBackground(node.src);
    } else if (node.type === 'sprite') {
      setSprites((s) => ({
        ...s,
        [node.character]: { src: node.src, position: node.position },
      }));
    }
    setCurrentId(node.next ?? null);
  }, [currentId, nodeMap]);

  const current = currentId ? nodeMap[currentId] : null;

  const advance = useCallback(
    (gotoId) => {
      if (!current) return;

      const nextId = gotoId ?? current.next ?? null;

      if (current.type === 'dialogue') {
        setHistory((h) => [
          ...h,
          { character: current.character, text: current.text },
        ]);
      }

      setCurrentId(nextId);
    },
    [current]
  );

  const choose = useCallback(
    (gotoId) => {
      if (current?.type !== 'choice') return;
      advance(gotoId);
    },
    [current, advance]
  );

  const reset = useCallback(() => {
    setCurrentId(script[0]?.id ?? null);
    setBackground(null);
    setSprites({});
    setHistory([]);
  }, [script]);

  return { current, background, sprites, history, advance, choose, reset };
}
