import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  it('keeps a request ID across asynchronous work and isolates contexts', async () => {
    const context = new RequestContextService();

    expect(context.getRequestId()).toBeUndefined();

    await context.run('request-123', async () => {
      await Promise.resolve();
      expect(context.getRequestId()).toBe('request-123');
    });

    expect(context.getRequestId()).toBeUndefined();
  });
});
