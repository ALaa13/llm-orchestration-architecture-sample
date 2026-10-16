import { EventEmitter } from 'node:events';
import { waitForDrainOrClose } from './stream-backpressure';

describe('waitForDrainOrClose', () => {
  it('allows streaming to continue when the response drains', async () => {
    const response = new EventEmitter();
    const result = waitForDrainOrClose(response);

    response.emit('drain');

    await expect(result).resolves.toBe(true);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('stops streaming when the connection closes', async () => {
    const response = new EventEmitter();
    const result = waitForDrainOrClose(response);

    response.emit('close');

    await expect(result).resolves.toBe(false);
    expect(response.listenerCount('drain')).toBe(0);
  });
});
