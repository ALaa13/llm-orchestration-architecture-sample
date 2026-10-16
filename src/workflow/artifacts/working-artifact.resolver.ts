import { Injectable } from '@nestjs/common';
import type { ChatMessage } from '../conversation-context/conversation-context.types';
import {
  isAssistantMessage,
  isControlPlaneAssistantResponse,
  removeApprovalProposalSuffix,
} from './control-plane-response';

/** Resolves released content artifacts from the bounded conversation window. */
@Injectable()
export class WorkingArtifactResolver {
  resolve(
    messages: readonly ChatMessage[],
    selectedIndex?: number,
  ): string | undefined {
    if (selectedIndex !== undefined) {
      const selected = messages[selectedIndex];
      if (selected === undefined || !isAssistantMessage(selected))
        return undefined;
      const content = removeApprovalProposalSuffix(selected.content.trim());
      return content === '' || isControlPlaneAssistantResponse(content)
        ? undefined
        : content;
    }
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (!isAssistantMessage(message)) continue;
      const content = removeApprovalProposalSuffix(message.content.trim());
      if (content === '' || isControlPlaneAssistantResponse(content)) continue;
      return content;
    }
    return undefined;
  }
}
