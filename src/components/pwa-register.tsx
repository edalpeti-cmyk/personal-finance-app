"use client";

import { useEffect, useRef, useState } from "react";

function postSkipWaiting(worker: ServiceWorker | null) {
  worker?.postMessage({ type: "SKIP_WAITING" });
}

export default function PwaRegister() {
  const [updateReady, setUpdateReady] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const handleControllerChange = () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      window.location.reload();
    };

    const attachWaitingWorker = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) {
        waitingWorkerRef.current = registration.waiting;
        setUpdateReady(true);
      }
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        attachWaitingWorker(registration);

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              waitingWorkerRef.current = registration.waiting ?? newWorker;
              setUpdateReady(true);
            }
          });
        });

        const checkForUpdates = async () => {
          try {
            await registration.update();
            attachWaitingWorker(registration);
          } catch {
            // Silent fallback: the app should remain usable even if the update check fails.
          }
        };

        const handleVisibilityChange = () => {
          if (document.visibilityState === "visible") {
            void checkForUpdates();
          }
        };

        window.addEventListener("focus", checkForUpdates);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
          window.removeEventListener("focus", checkForUpdates);
          document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
      } catch {
        return undefined;
      }
    };

    let cleanup: (() => void) | undefined;

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    void register().then((dispose) => {
      cleanup = dispose;
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      cleanup?.();
    };
  }, []);

  if (!updateReady) {
    return null;
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-[70] flex justify-center md:inset-x-auto md:right-6 md:bottom-6">
      <div className="w-full max-w-md rounded-[24px] border border-emerald-300/20 bg-[linear-gradient(180deg,rgba(9,20,38,0.98)_0%,rgba(12,27,49,0.98)_100%)] p-4 text-white shadow-[0_24px_54px_rgba(2,8,23,0.5)] backdrop-blur">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Nueva version</p>
        <p className="mt-2 text-sm leading-6 text-white/84">
          Hay una actualizacion lista. Pulsa el boton y recargamos la app sin reinstalarla.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => postSkipWaiting(waitingWorkerRef.current)}
            className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-400"
          >
            Actualizar app
          </button>
          <button
            type="button"
            onClick={() => setUpdateReady(false)}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
          >
            Luego
          </button>
        </div>
      </div>
    </div>
  );
}
