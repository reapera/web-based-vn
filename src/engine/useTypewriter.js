import { useState, useEffect, useRef } from 'react';

export function useTypewriter(text, speed = 30, onComplete) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    indexRef.current = 0;

    timerRef.current = setInterval(() => {
      indexRef.current += 1;
      setDisplayed(text.slice(0, indexRef.current));

      if (indexRef.current >= text.length) {
        clearInterval(timerRef.current);
        setDone(true);
        onComplete?.();
      }
    }, speed);

    return () => clearInterval(timerRef.current);
  }, [text, speed]);

  function skip() {
    clearInterval(timerRef.current);
    setDisplayed(text);
    setDone(true);
    onComplete?.();
  }

  return { displayed, done, skip };
}
