import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.strictObject({
    model: z
      .string()
      .regex(/\S/, 'model must contain a non-whitespace character'),
    stream: z.boolean().optional(),
  });
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed value for a valid payload', () => {
    expect(
      pipe.transform({ model: 'architecture-sample-test', stream: true }),
    ).toEqual({ model: 'architecture-sample-test', stream: true });
  });

  it('rejects unknown properties and names the offending key', () => {
    let response: unknown;

    try {
      pipe.transform({ model: 'architecture-sample-test', extra: 1 });
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      response = (error as BadRequestException).getResponse();
    }

    expect(response).toEqual({
      message: 'Request validation failed',
      errors: [{ path: 'extra', message: 'Unrecognized property' }],
    });
  });

  it('reports field paths and messages without echoing submitted values', () => {
    let response: unknown;

    try {
      pipe.transform({ model: '   ' });
    } catch (error) {
      response = (error as BadRequestException).getResponse();
    }

    expect(response).toEqual({
      message: 'Request validation failed',
      errors: [
        {
          path: 'model',
          message: 'model must contain a non-whitespace character',
        },
      ],
    });
    expect(JSON.stringify(response)).not.toContain('   ');
  });
});
