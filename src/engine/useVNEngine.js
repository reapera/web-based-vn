import { useState, useCallback } from 'react';

/**
 * Script node types:
 *   dialogue  – { id, type:"dialogue", character, text, next }
 *   choice    – { id, type:"choice", choices:[{ label, goto }] }
 *   background– { id, type:"background", src, next }
 *   sprite    – { id, type:"sprite", character, src, position, next }
 *   end       – { id, type:"end" }
 */

export function useVNEngine(script) {
  const nodeMap = Object.fromEntries(script.map((n) => [n.id, n]));

  const [currentId, setCurrentId] = useState(script[0]?.id ?? null);
  const [background, setBackground] = useState(null);
  const [sprites, setSprites] = useState({});
  const [history, setHistory] = useState([]);

  const current = currentId ? nodeMap[currentId] : null;

  const advance = useCallback(
    (gotoId) => {
      if (!current) return;

      const nextId = gotoId ?? current.next ?? null;

      // Accumulate history for dialogue nodes
      if (current.type === 'dialogue') {
        setHistory((h) => [
          ...h,
          { character: current.character, text: current.text },
        ]);
      }

      if (!nextId) return;

      const next = nodeMap[nextId];
      if (!next) {
        console.warn(`[VNEngine] Node "${nextId}" not found.`);
        return;
      }

      // Handle non-interactive nodes immediately
      if (next.type === 'background') {
        setBackground(next.src);
        setCurrentId(next.next ?? null);
      } else if (next.type === 'sprite') {
        setSprites((s) => ({
          ...s,
          [next.character]: { src: next.src, position: next.position },
        }));
        setCurrentId(next.next ?? null);
      } else {
        setCurrentId(nextId);
      }
    },
    [current, nodeMap]
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
