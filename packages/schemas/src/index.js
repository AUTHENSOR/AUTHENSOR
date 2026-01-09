// Re-export schemas for programmatic access
import actionEnvelopeSchema from './action-envelope.schema.json' assert { type: 'json' };
import actionReceiptSchema from './action-receipt.schema.json' assert { type: 'json' };
import policySchema from './policy.schema.json' assert { type: 'json' };

export { actionEnvelopeSchema, actionReceiptSchema, policySchema };
