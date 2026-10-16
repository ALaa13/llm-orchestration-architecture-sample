import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { $ZodIssue } from 'zod/v4/core';
import type { ZodType } from 'zod';

interface ValidationError {
  path: string;
  message: string;
}

const joinPath = (segments: PropertyKey[]): string => segments.join('.');

/**
 * Zod reports an unrecognized key against its parent object, which leaves the
 * path empty for a top-level key. Naming the rejected key keeps the response
 * actionable for the caller.
 */
function describeIssue(issue: $ZodIssue): ValidationError[] {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => ({
      path: joinPath([...issue.path, key]),
      message: 'Unrecognized property',
    }));
  }

  return [{ path: joinPath(issue.path), message: issue.message }];
}

/**
 * Parses an untrusted payload with a Zod schema and returns the typed result.
 *
 * Failures report only the field path and the schema message. Submitted values
 * are never echoed back, so a rejected request cannot reflect confidential
 * content into an error response or an access log.
 */
@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform<
  unknown,
  TOutput
> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Request validation failed',
        errors: result.error.issues.flatMap(describeIssue),
      });
    }

    return result.data;
  }
}
