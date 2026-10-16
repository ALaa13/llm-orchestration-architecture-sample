import { Global, Module } from '@nestjs/common';
import { RULE_CANDIDATE_REPOSITORY } from '../../workflow/feedback/rule-candidate.repository';
import { RuleCandidatePersistenceService } from '../../workflow/feedback/rule-candidate.persistence.service';
import { PostgresDatabase } from './postgres.database';
import { PostgresRuleCandidateRepository } from './postgres-rule-candidate.repository';

@Global()
@Module({
  providers: [
    PostgresDatabase,
    PostgresRuleCandidateRepository,
    RuleCandidatePersistenceService,
    {
      provide: RULE_CANDIDATE_REPOSITORY,
      useExisting: PostgresRuleCandidateRepository,
    },
  ],
  exports: [
    PostgresDatabase,
    RuleCandidatePersistenceService,
    RULE_CANDIDATE_REPOSITORY,
  ],
})
export class PersistenceModule {}
