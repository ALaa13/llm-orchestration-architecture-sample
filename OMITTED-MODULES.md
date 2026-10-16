# Intentionally omitted module boundaries

This inventory records unresolved local imports; it does not imply the remaining application builds. Each listed module was withheld because it contains instructions, presentation templates, private policy implementations, policy-specific schemas, or bundled examples. The paths below use neutral sample names.

| Absent module | Referenced by |
| --- | --- |
| `src/chat/user-facing-response.ts` | `src/chat/chat.service.ts` |
| `src/llm/feedback/rule-conflict-prompt.ts` | `src/llm/feedback/openai-rule-conflict-analyzer.service.ts` |
| `src/llm/generation/anthropic-generation.service.ts` | `src/llm/llm.module.ts` |
| `src/llm/generation/mock-generation.service.ts` | `src/llm/llm.module.ts` |
| `src/llm/semantic-analysis/semantic-analysis-prompt.ts` | `src/llm/semantic-analysis/openai-semantic-analysis.service.ts` |
| `src/llm/verification/openai-semantic-verification.service.ts` | `src/llm/llm.module.ts`, `src/workflow/workflow.module.ts` |
| `src/workflow/artifacts/control-plane-response.ts` | `src/llm/semantic-analysis/openai-semantic-analysis.service.ts`, `src/workflow/artifacts/working-artifact.resolver.ts`, `src/workflow/workflow.service.ts` |
| `src/workflow/feedback/mock-rule-conflict-analyzer.service.ts` | `src/workflow/feedback/controlled-write.service.ts`, `src/workflow/workflow.module.ts` |
| `src/workflow/feedback/policy-feedback-compatibility.service.ts` | `src/workflow/context-assembly/context-assembler.service.ts`, `src/workflow/workflow.module.ts` |
| `src/workflow/policy-rules/article/article-authoring-plan.types.ts` | `src/workflow/context-assembly/context-assembly.types.ts`, `src/workflow/generation/generation.types.ts`, `src/workflow/verification/verification.types.ts` |
| `src/workflow/policy-rules/policy-authoring-projection.ts` | `src/workflow/context-assembly/context-package-model-projection.ts` |
| `src/workflow/policy-rules/policy-authoring-projection.types.ts` | `src/workflow/context-assembly/context-package-model-projection.ts` |
| `src/workflow/policy-rules/policy-rule-applicability.ts` | `src/workflow/context-assembly/context-assembler.service.ts`, `src/workflow/context-assembly/context-package-model-projection.ts` |
| `src/workflow/policy-rules/policy-runtime-profile.resolver.ts` | `src/workflow/context-assembly/context-assembler.service.ts` |
| `src/workflow/policy-rules/policy-runtime-profile.types.ts` | `src/workflow/context-assembly/context-assembly.types.ts` |
| `src/workflow/policy-rules/policy-verification-projection.ts` | `src/workflow/context-assembly/context-package-model-projection.ts` |
| `src/workflow/policy-rules/policy-verification-projection.types.ts` | `src/workflow/context-assembly/context-package-model-projection.ts` |
| `src/workflow/retrieval/mock-knowledge-retrieval.service.ts` | `src/workflow/workflow.module.ts` |
| `src/workflow/semantic-analysis/mock-semantic-analysis.service.ts` | `src/workflow/workflow.module.ts` |
| `src/workflow/verification/deterministic-verification-checks.ts` | `src/workflow/verification/verification.service.ts`, `src/workflow/workflow.module.ts` |
| `src/workflow/verification/effective-policy-planning.ts` | `src/workflow/verification/verification.service.ts` |
| `src/workflow/verification/mock-semantic-verification.service.ts` | `src/workflow/workflow.module.ts` |
