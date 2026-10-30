import type { OutboxItem } from '@/types'

/** Mock outbox. No real email is ever sent. */
export const SEED_OUTBOX: OutboxItem[] = [
  {
    id: 'outbox-35',
    time: '10:35:05',
    to: 'hr@partner-company.com',
    subject: 'Shortlisted resume',
    attachment: 'rahul_menon.txt',
  },
]
