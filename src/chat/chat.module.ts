import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { LibreChatAuthGuard } from '../common/guards';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [WorkflowModule],
  controllers: [ChatController],
  providers: [ChatService, LibreChatAuthGuard],
})
export class ChatModule {}
