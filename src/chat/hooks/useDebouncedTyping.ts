import { useCallback, useEffect, useRef } from "react";
import debounce from "lodash.debounce";

type EmitTypingState = (isTyping: boolean) => void;

export function useDebouncedTyping(emitTypingState: EmitTypingState, delayMs = 1200) {
  const stopTypingDebouncedRef = useRef<ReturnType<typeof debounce> | null>(null);

  useEffect(() => {
    const debouncedStopTyping = debounce(() => {
      emitTypingState(false);
    }, delayMs);

    stopTypingDebouncedRef.current = debouncedStopTyping;

    return () => {
      debouncedStopTyping.cancel();
    };
  }, [delayMs, emitTypingState]);

  const handleTypingValue = useCallback(
    (value: string) => {
      const nowTyping = value.trim().length > 0;

      if (nowTyping) {
        emitTypingState(true);
        stopTypingDebouncedRef.current?.();
      } else {
        stopTypingDebouncedRef.current?.cancel();
        emitTypingState(false);
      }
    },
    [emitTypingState],
  );

  const stopTypingNow = useCallback(() => {
    stopTypingDebouncedRef.current?.cancel();
    emitTypingState(false);
  }, [emitTypingState]);

  return {
    handleTypingValue,
    stopTypingNow,
  };
}
