import { enabledLogLevels } from './log-levels';

describe('enabledLogLevels', () => {
  it('enables the configured minimum severity and higher severities', () => {
    expect(enabledLogLevels('warn')).toEqual(['warn', 'error', 'fatal']);
  });
});
