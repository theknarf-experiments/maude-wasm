import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkerRequest, WorkerResponse } from "./protocol";

interface Pending {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
export type WorkerCall = DistributiveOmit<WorkerRequest, "id">;

export class CancelledError extends Error {
  constructor() {
    super("cancelled");
  }
}

/**
 * Runs Maude in a Web Worker so long rewrites/searches never block the
 * UI thread. `cancel()` terminates the worker mid-run; the next call
 * transparently spawns a fresh one.
 */
export function useMaude() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<number, Pending>>(new Map());
  const nextIdRef = useRef(0);
  const [running, setRunning] = useState(false);

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const pending = pendingRef.current.get(event.data.id);
        if (!pending) return;
        pendingRef.current.delete(event.data.id);
        if ("result" in event.data) pending.resolve(event.data.result);
        else pending.reject(new Error(event.data.error));
      };
      workerRef.current = worker;
    }
    return workerRef.current;
  }, []);

  const call = useCallback(
    <T,>(request: WorkerCall): Promise<T> => {
      const id = nextIdRef.current++;
      setRunning(true);
      return new Promise<T>((resolve, reject) => {
        pendingRef.current.set(id, {
          resolve: resolve as (r: unknown) => void,
          reject,
        });
        getWorker().postMessage({ ...request, id });
      }).finally(() => {
        if (pendingRef.current.size === 0) setRunning(false);
      });
    },
    [getWorker],
  );

  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    for (const pending of pendingRef.current.values()) {
      pending.reject(new CancelledError());
    }
    pendingRef.current.clear();
    setRunning(false);
  }, []);

  useEffect(() => () => workerRef.current?.terminate(), []);

  return { call, cancel, running };
}
