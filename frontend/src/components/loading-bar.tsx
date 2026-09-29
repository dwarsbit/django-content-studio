import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import RootLoadingBar, { type LoadingBarRef } from "react-top-loading-bar";

export function LoadingBar() {
  const ref = useRef<LoadingBarRef>(null);
  const isStarted = useRef(false);
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const showLoader = isFetching + isMutating > 0;

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    if (showLoader) {
      timeoutId = setTimeout(() => {
        isStarted.current = true;
        ref.current?.start();
      }, 1_000);
    } else {
      if (isStarted.current) {
        isStarted.current = false;
        ref.current?.complete();
      }
    }

    return () => {
      clearTimeout(timeoutId);
    };
  }, [showLoader]);

  return <RootLoadingBar ref={ref} color="#1E2938" shadow={false} />;
}
