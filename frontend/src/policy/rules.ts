import type { TaskId, Verdict } from '@/types'

/** Policy display catalogue: IDs, labels, and task summaries shown in the UI. */
export const RULE_TITLES: Record<string, string> = {
  R1_TOOL_NOT_ALLOWED: 'Intent–action mismatch',
  R2_RECIPIENT_NOT_ALLOWED: 'Recipient not allowlisted',
  R3_FILE_OUT_OF_SCOPE: 'File outside task scope',
  R4_SENSITIVE_FILE: 'Sensitive file',
  R5_SENSITIVE_CONTENT: 'Sensitive content in outgoing text',
  R6_TOO_MANY_ACTIONS: 'Action limit exceeded',
  R8_TOOL_DENIED: 'Tool denied for every task',
  H1_REVIEWER_APPROVED: 'Approved by reviewer',
  H2_REVIEWER_DENIED: 'Denied by reviewer',
  T1_REVIEW_TIMEOUT: 'Review timed out',
}

export type PolicySection =
  | { rule: string; label: string; kind: 'chips'; values: string[] }
  | { rule: string; label: string; kind: 'text'; text: string }
  | { rule: string; label: string; kind: 'domains'; domains: { domain: string; verdict: Verdict }[] }

const DENIED_EVERYWHERE: PolicySection = {
  rule: 'R8',
  label: 'Denied for every task',
  kind: 'chips',
  values: ['delete_file'],
}

const ACTION_LIMIT: PolicySection = {
  rule: 'R6',
  label: 'Limit',
  kind: 'text',
  text: 'Max 3 actions per run.',
}

/** Policy text shown in the "View rules for this task" sheet. */
export const TASK_POLICIES: Record<TaskId, PolicySection[]> = {
  summarise_resume: [
    { rule: 'R1', label: 'Allowed tools', kind: 'chips', values: ['summarise'] },
    { rule: 'R2', label: 'Recipients', kind: 'text', text: 'None allowed.' },
    { rule: 'R3', label: 'Files', kind: 'text', text: 'None.' },
    DENIED_EVERYWHERE,
    ACTION_LIMIT,
  ],
  email_company: [
    { rule: 'R1', label: 'Allowed tools', kind: 'chips', values: ['send_email', 'read_file'] },
    {
      rule: 'R2',
      label: 'Recipient domains',
      kind: 'domains',
      domains: [
        { domain: 'college.edu', verdict: 'ALLOW' },
        { domain: 'partner-company.com', verdict: 'ALLOW' },
        { domain: 'gmail.com', verdict: 'REVIEW' },
        { domain: 'all other domains', verdict: 'BLOCK' },
      ],
    },
    { rule: 'R3', label: 'Files in scope', kind: 'chips', values: ['sandbox/resumes/*'] },
    {
      rule: 'R4',
      label: 'Sensitive files (never leave)',
      kind: 'chips',
      values: ['sandbox/placement_list.xlsx', 'sandbox/salary*'],
    },
    {
      rule: 'R5',
      label: 'Outgoing text',
      kind: 'text',
      text: 'Must not contain phone numbers, email lists or ID-like numbers.',
    },
    DENIED_EVERYWHERE,
    ACTION_LIMIT,
  ],
}
