import { Injectable } from '@nestjs/common';
import type { ContextPackage } from '../../workflow/context-assembly/context-assembly.types';
import { projectContextPackageForGeneration } from '../../workflow/context-assembly/context-package-model-projection';
import { GenerationContextSerializer } from './generation-context-serializer';

@Injectable()
export class JsonGenerationContextSerializer extends GenerationContextSerializer {
  serialize(contextPackage: ContextPackage): string {
    return JSON.stringify(projectContextPackageForGeneration(contextPackage));
  }
}
