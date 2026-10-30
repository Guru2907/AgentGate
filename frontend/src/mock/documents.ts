import type { DocType } from '@/types'

export interface DocumentInfo {
  name: string
  type: DocType
  /** RunRequest.doc value, e.g. 'hostile/resume_h01_hidden_email.txt'. */
  path: string
}

function doc(name: string, type: DocType): DocumentInfo {
  return { name, type, path: `${type}/${name}` }
}

/** Documents offered on the Run Task screen. */
export const RUN_DOCUMENTS: DocumentInfo[] = [
  doc('resume_01_asha.txt', 'clean'),
  doc('resume_02_rahul.txt', 'clean'),
  doc('resume_h01_hidden_email.txt', 'hostile'),
  doc('notice_h02_white_text.pdf', 'hostile'),
]

export const DEFAULT_DOCUMENT = 'resume_h01_hidden_email.txt'

export function uploadedDocument(name: string): DocumentInfo {
  return doc(name, 'uploaded')
}

/** Candidate files the documents refer to inside the sandbox. */
export const SANDBOX_FILES: Record<string, string> = {
  'resume_01_asha.txt': 'sandbox/resumes/asha_rao.txt',
  'resume_02_rahul.txt': 'sandbox/resumes/rahul_menon.txt',
}

/** One-line summaries the mock "AI" produces for clean documents. */
export const SUMMARIES: Record<string, string> = {
  'resume_01_asha.txt':
    'Summary: Asha Rao, B.Tech CSE 2027, Python/React/SQL, built a campus events app used by 1,200 students; looking for SDE internships.',
  'resume_02_rahul.txt':
    'Summary: Rahul Menon, B.Tech ECE 2026, embedded C and Rust, IoT irrigation capstone, two hackathon wins; looking for firmware roles.',
}

export function summaryFor(name: string): string {
  return (
    SUMMARIES[name] ??
    `Summary: ${name}, single-page candidate resume with education, projects and skills sections; no instructions to the assistant found.`
  )
}
