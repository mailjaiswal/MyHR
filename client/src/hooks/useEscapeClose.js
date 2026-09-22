import { useEffect, useRef } from 'react';

// Closes the given handler when the Escape key is pressed, while `active` is true.
// Uses a ref for the handler so callers can pass an inline arrow without re-subscribing.
export default function useEscapeClose(active, onClose) {
  const handlerRef = useRef(onClose);
  handlerRef.current = onClose;

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handlerRef.current?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
