import { useEffect } from 'react';
import { useTypewriter } from '../engine/useTypewriter';

export function DialogueBox({ character, text, onAdvance, autoMode, skipMode }) {
  const { displayed, done, skip } = useTypewriter(text, 30);

  // When skip mode is active, instantly complete the current line
  useEffect(() => {
    if (skipMode) skip();
  });

  // Auto mode: advance 1.8s after line finishes
  useEffect(() => {
    if (!autoMode || !done) return;
    const t = setTimeout(onAdvance, 1800);
    return () => clearTimeout(t);
  }, [autoMode, done, onAdvance]);

  // Skip mode: advance immediately after line finishes
  useEffect(() => {
    if (!skipMode || !done) return;
    const t = setTimeout(onAdvance, 80);
    return () => clearTimeout(t);
  }, [skipMode, done, onAdvance]);

  function handleClick() {
    if (!done) skip();
    else onAdvance();
  }

  return (
    <div className="vn-dialogue" onClick={handleClick} role="button" tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick()}>
      {character && <div className="vn-namebox">{character}</div>}
      <p className="vn-dialogue__text">{displayed}</p>
      {done && !autoMode && (
        <span className="vn-dialogue__continue" aria-hidden="true">▼ continue</span>
      )}
      {autoMode && done && (
        <span className="vn-dialogue__continue" aria-hidden="true">AUTO</span>
      )}
    </div>
  );
}
