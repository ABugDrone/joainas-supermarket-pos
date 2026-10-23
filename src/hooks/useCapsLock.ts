import { useState, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react';

export function useCapsLock() {
  const [capsOn, setCapsOn] = useState(false);
  const check = useCallback((e: ReactKeyboardEvent<HTMLInputElement> | KeyboardEvent) => {
    const on = (e as KeyboardEvent).getModifierState ? (e as KeyboardEvent).getModifierState('CapsLock') : false;
    setCapsOn(on);
  }, []);
  return { capsOn, check, setCapsOn };
}
