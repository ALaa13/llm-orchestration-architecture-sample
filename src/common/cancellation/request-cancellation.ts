export interface CancellationRuntime {
  signal?: AbortSignal;
}

export class RequestCancelledError extends Error {
  constructor() {
    super('The request was cancelled by the client.');
    this.name = 'RequestCancelledError';
  }
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new RequestCancelledError();
}

export function isRequestCancelled(
  error: unknown,
  signal: AbortSignal | undefined,
): boolean {
  return error instanceof RequestCancelledError || signal?.aborted === true;
}

export function createProviderAbortSignal(
  requestSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void; didTimeout: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(
      new DOMException('The operation timed out.', 'TimeoutError'),
    );
  }, timeoutMs);
  const onRequestAbort = (): void => {
    controller.abort(new RequestCancelledError());
  };

  if (requestSignal?.aborted === true) onRequestAbort();
  else requestSignal?.addEventListener('abort', onRequestAbort, { once: true });

  return {
    signal: controller.signal,
    didTimeout: (): boolean => timedOut,
    dispose: (): void => {
      clearTimeout(timeout);
      requestSignal?.removeEventListener('abort', onRequestAbort);
    },
  };
}

interface RequestLifecycle {
  aborted: boolean;
  once(event: 'aborted', listener: () => void): unknown;
  off(event: 'aborted', listener: () => void): unknown;
}

interface ResponseLifecycle {
  destroyed: boolean;
  writableFinished: boolean;
  once(event: 'close', listener: () => void): unknown;
  off(event: 'close', listener: () => void): unknown;
}

export function createRequestCancellation(
  request: RequestLifecycle,
  response: ResponseLifecycle,
  onCancelled: () => void,
): {
  signal: AbortSignal;
  isCancelled: () => boolean;
  complete: () => void;
  dispose: () => void;
} {
  const controller = new AbortController();
  let active = true;
  let cancelled = false;
  const cancel = (): void => {
    if (!active || cancelled) return;
    cancelled = true;
    controller.abort(new RequestCancelledError());
    onCancelled();
  };
  const onRequestAborted = (): void => cancel();
  const onResponseClosed = (): void => {
    if (!response.writableFinished) cancel();
  };

  if (request.aborted) cancel();
  request.once('aborted', onRequestAborted);
  response.once('close', onResponseClosed);

  return {
    signal: controller.signal,
    isCancelled: (): boolean => cancelled,
    complete: (): void => {
      active = false;
    },
    dispose: (): void => {
      active = false;
      request.off('aborted', onRequestAborted);
      response.off('close', onResponseClosed);
    },
  };
}
