import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z, type ZodType } from 'zod';

/**
 * Derives the Swagger body schema from a Zod schema so the published contract
 * and the enforced contract cannot drift apart.
 *
 * The JSON Schema dialect marker is dropped because OpenAPI documents declare
 * their own dialect.
 */
export function toOpenApiSchema(schema: ZodType): SchemaObject {
  const jsonSchema = z.toJSONSchema(schema, { io: 'input' });
  delete jsonSchema.$schema;

  return jsonSchema as SchemaObject;
}
