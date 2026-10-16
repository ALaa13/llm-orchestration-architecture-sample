import type { ContextPackage } from '../../workflow/context-assembly/context-assembly.types';

/** Converts the controlled Stage 4 package into model-input text. */
export abstract class GenerationContextSerializer {
  abstract serialize(contextPackage: ContextPackage): string;
}
