import { EventEmitter } from 'node:events';
import {
  createProviderAbortSignal,
  createRequestCancellation,
  RequestCancelledError,
} from './request-cancellation';

class RequestFake extends EventEmitter {
  aborted = false;
}

class ResponseFake extends EventEmitter {
  destroyed = false;
  writableFinished = false;
}

describe('request cancellation', () => {
  it('combines request cancellation with a separate provider timeout', () => {
    jest.useFakeTimers();
    const requestController = new AbortController();
    const provider = createProviderAbortSignal(requestController.signal, 1000);

    requestController.abort();

    expect(provider.signal.aborted).toBe(true);
    expect(provider.signal.reason).toBeInstanceOf(RequestCancelledError);
    provider.dispose();
    jest.useRealTimers();
  });

  it('preserves provider timeout cancellation when the request remains active', () => {
    jest.useFakeTimers();
    const provider = createProviderAbortSignal(undefined, 1000);

    jest.advanceTimersByTime(1000);

    expect(provider.signal.aborted).toBe(true);
    expect(provider.signal.reason).toBeInstanceOf(DOMException);
    if (provider.signal.reason instanceof DOMException) {
      expect(provider.signal.reason.name).toBe('TimeoutError');
    }
    provider.dispose();
    jest.useRealTimers();
  });

  it('cleans request listeners and does not cancel after normal completion', () => {
    const request = new RequestFake();
    const response = new ResponseFake();
    const cancelled = jest.fn();
    const lifecycle = createRequestCancellation(request, response, cancelled);

    lifecycle.complete();
    response.emit('close');

    expect(lifecycle.signal.aborted).toBe(false);
    expect(cancelled).not.toHaveBeenCalled();
    lifecycle.dispose();
    expect(request.listenerCount('aborted')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('cancels when the response closes before it finishes', () => {
    const request = new RequestFake();
    const response = new ResponseFake();
    const cancelled = jest.fn();
    const lifecycle = createRequestCancellation(request, response, cancelled);

    response.emit('close');

    expect(lifecycle.signal.aborted).toBe(true);
    expect(cancelled).toHaveBeenCalledTimes(1);
    lifecycle.dispose();
  });
});
