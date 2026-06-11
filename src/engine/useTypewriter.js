import { useEffect, useState } from "react";

/**
 * Reveals `text` one character at a time. Returns the visible portion,
 * whether it's finished, and a skip() that reveals everything at once.
 */
export function useTypewriter(text, speed = 22) {
  const [shown, setShown] = useState({ text, count: 0 });
  // Reset during render when the text changes (React's "adjust state on
  // prop change" pattern) instead of inside an effect.
  if (shown.text !== text) setShown({ text, count: 0 });

  useEffect(() => {
    if (!text) return;
    const timer = setInterval(() => {
      setShown((s) => {
        if (s.text !== text || s.count >= text.length) {
          clearInterval(timer);
          return s;
        }
        return { text: s.text, count: s.count + 1 };
      });
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  const count = shown.text === text ? shown.count : 0;
  const done = !text || count >= text.length;
  const skip = () => setShown({ text, count: text?.length ?? 0 });

  return { visible: text?.slice(0, count) ?? "", done, skip };
}
