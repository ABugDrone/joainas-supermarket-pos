import { useState, useCallback } from 'react';

export function useCapsLock() {
  const [capsOn, setCapsOn] = useState(false);
  const check = useCallback((e: React.KeyboardEvent<HTMLInputElement> | KeyboardEvent) => {
    const on = (e as KeyboardEvent).getModifierState ? (e as KeyboardEvent).getModifierState('CapsLock') : false;
    setCapsOn(on);
  }, []);
  return { capsOn, check, setCapsOn };
}
