interface DrainAwareResponse {
  once(event: 'drain' | 'close', listener: () => void): unknown;
  off(event: 'drain' | 'close', listener: () => void): unknown;
}

export function waitForDrainOrClose(
  response: DrainAwareResponse,
): Promise<boolean> {
  return new Promise((resolve) => {
    const complete = (canContinue: boolean): void => {
      response.off('drain', onDrain);
      response.off('close', onClose);
      resolve(canContinue);
    };
    const onDrain = (): void => complete(true);
    const onClose = (): void => complete(false);

    response.once('drain', onDrain);
    response.once('close', onClose);
  });
}
