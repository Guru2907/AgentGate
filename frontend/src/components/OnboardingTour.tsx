import { useCallback, useEffect } from 'react'
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

import { useAuth } from '@/state/auth'

/** Per-user, per-tour "seen" flag. Browser storage can be unavailable (private mode): then the tour just runs again. */
const seenKey = (tour: string, userId: number) => `agentgate.tour.v1.${tour}.${userId}`

function hasSeen(tour: string, userId: number): boolean {
  try {
    return window.localStorage.getItem(seenKey(tour, userId)) === 'done'
  } catch {
    return false
  }
}

function markSeen(tour: string, userId: number) {
  try {
    window.localStorage.setItem(seenKey(tour, userId), 'done')
  } catch {
    /* storage blocked: nothing to remember */
  }
}

/** Step that opens a tab (or presses any button) when highlighted, so the tour shows what it describes.
 * Radix tabs switch on mouse-down / focus, not on a synthetic click, so tabs get a mouse-down and focus. */
const clickOnShow: DriveStep['onHighlightStarted'] = (el) => {
  const target = el as HTMLElement | undefined
  if (!target) return
  if (target.getAttribute('role') === 'tab') {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
    target.focus()
  } else {
    target.click()
  }
}

export const RUN_TASK_TOUR: DriveStep[] = [
  {
    popover: {
      title: 'Welcome to AgentGate',
      description:
        'AI assistants can now send email and open files, and a document can secretly tell them what to do. AgentGate sits between the AI and its tools: the AI only <b>proposes</b> actions, plain rules decide. Here is a 1-minute tour.',
    },
  },
  {
    element: '#task-select',
    popover: {
      title: '1. Pick a task',
      description:
        '<b>Summarise resume</b> screens a resume (the AI may only summarise). <b>Email company</b> lets the AI draft an email to a company contact, which the gate checks before anything is sent (it has its own short tour).',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="upload"]',
    popover: {
      title: '2. Upload a resume',
      description:
        'Drop any PDF, Word or text resume. AgentGate reads everything, including text hidden in white or tiny fonts and in file properties: that is where attacks hide.',
      side: 'right',
    },
  },
  {
    element: '[data-tour="documents"]',
    popover: { title: '3. Your documents', description: 'Only your own uploads appear here. Each account has a private workspace.', side: 'right' },
  },
  {
    element: '[data-tour="run"]',
    popover: {
      title: '4. Run it',
      description:
        'The live AI reads the document and proposes actions. Each one is checked against 11 rules: <b>ALLOWED</b> runs in a sandbox, <b>BLOCKED</b> never runs, <b>NEEDS REVIEW</b> waits for a person.',
      side: 'top',
    },
  },
  {
    element: 'section[aria-label="Result"]',
    popover: {
      title: '5. See what the AI tried, and why',
      description:
        "Results show the hidden instruction (if any), every action the AI proposed, the gate's verdict and the exact rule. Fooled or not, harmful actions never run.",
      side: 'left',
    },
  },
  {
    element: '[data-tour="rules"]',
    popover: { title: 'The rules for this task', description: 'Open the live rulebook: allowed actions, approved company domains, protected files.', side: 'top' },
  },
  {
    element: 'header [aria-label="Gate Log"]',
    popover: { title: 'Gate Log', description: 'Every action ever proposed, allowed or not, in a tamper-evident chain.', side: 'bottom' },
  },
  {
    element: 'header [aria-label="Review Queue"]',
    popover: { title: 'Review Queue', description: 'Risky-but-valid actions wait here for a human. Sent emails are in its Outbox tab.', side: 'bottom' },
  },
  {
    element: 'header [aria-label="Attack Bench"]',
    popover: { title: 'Attack Bench', description: 'Proof: test sets, an attacker AI, real-world results and one-click attacks.', side: 'bottom' },
  },
  {
    popover: {
      title: 'You are ready',
      description:
        'Each page has its own short tour the first time you open it, and a <b>Take the tour</b> button to replay it. Next: try <b>Email company</b>.',
    },
  },
]

export const EMAIL_TOUR: DriveStep[] = [
  {
    popover: {
      title: 'Email company: the AI drafts, the gate decides',
      description:
        'The AI writes an email about a candidate to a company. Nothing is sent until you press Send, and every send goes through the gate. Allowed emails land in a local test inbox: nothing ever leaves this machine.',
    },
  },
  {
    element: '#email-to',
    popover: {
      title: '1. Company contact',
      description:
        'Approved companies (e.g. <b>hr@partner-company.com</b>) can be emailed. Free mail like gmail.com needs a human, and unknown domains are blocked.',
      side: 'bottom',
    },
  },
  {
    element: '#email-note',
    popover: { title: '2. Your note', description: 'Optional context for the AI, e.g. the role. It is kept separate from the resume, so the document cannot pretend to be you.', side: 'bottom' },
  },
  {
    element: '[data-tour="email-draft"]',
    popover: {
      title: "3. Draft: the AI's whole plan",
      description:
        'The live AI plans step by step (read, then email). The gate previews <b>every step with what came before</b>, so if the plan read a confidential file, the email already shows <b>BLOCKED (R9)</b>, even to an approved partner. Nothing runs yet.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="allowlist"]',
    popover: {
      title: 'Approved company domains',
      description: 'Add or remove the companies your workspace may email. Locked ones come from the policy file; every change is written to the audit log.',
      side: 'right',
    },
  },
  {
    popover: {
      title: '4. Edit, preview, Send',
      description:
        'After drafting you can edit the recipient, subject and body; the preview re-checks as you type. <b>Send</b> runs the whole plan through the real gate and logs every step. Allowed → <b>Open inbox</b>; needs review → Review Queue; blocked → nothing leaves.',
    },
  },
  {
    popover: {
      title: 'Try the hurdle',
      description:
        'Upload <b>08_email-company_HURDLE-R9-read-then-email_BLOCKED.txt</b> from data/demo and email <b>hr@partner-company.com</b>. Every step looks allowed, yet the gate stops the email because the AI read the confidential placement list first.',
    },
  },
]

export const ATTACK_BENCH_TOUR: DriveStep[] = [
  {
    popover: {
      title: 'Attack Bench: proof, not promises',
      description: 'Five ways to see how the gate holds up. The tour opens each tab as it goes.',
    },
  },
  {
    element: '[data-tour="tab-bench"]',
    onHighlightStarted: clickOnShow,
    popover: {
      title: 'Bench',
      description: 'Runs a fixed set of clean and hostile documents through the real gate on a scratch database: attacks blocked, attacks that got through, clean allowed, false alarms.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="tab-redteam"]',
    onHighlightStarted: clickOnShow,
    popover: {
      title: 'Red team',
      description:
        'An attacker AI writes brand-new hostile resumes, each hiding a different trick, and the gate scores them. <b>Generate & score</b> makes a fresh batch (about 1 a minute on the free AI tier); <b>Re-score saved batch</b> is instant and offline.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="tab-eval"]',
    onHighlightStarted: clickOnShow,
    popover: {
      title: 'Real-world eval',
      description:
        '300 documents in real formats with real attack text: detection rate, false alarms and gate speed. The live AI run shows how often the AI alone was fooled, and that the gate stopped every harmful action.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="tab-tests"]',
    onHighlightStarted: clickOnShow,
    popover: { title: 'Test results', description: '164 hand-written test cases plus a manual UI checklist. Known gaps are listed honestly, not hidden.', side: 'bottom' },
  },
  {
    element: '[data-tour="tab-attack"]',
    onHighlightStarted: clickOnShow,
    popover: {
      title: 'Try an attack',
      description:
        'One-click attacks sent straight to the gate (no AI needed), including the three "every step allowed" tricks: read-then-email (R9), data hidden in base64 or split across emails (R10), and a swapped approval (R11). Each result links to its Gate Log row.',
      side: 'bottom',
    },
  },
]

export const GATE_LOG_TOUR: DriveStep[] = [
  {
    popover: {
      title: 'Gate Log: the audit trail',
      description: 'Every action the AI proposed, allowed or not, plus every human decision. Rows are only ever added, never changed.',
    },
  },
  {
    element: '[data-tour="log-tabs"]',
    popover: { title: 'Filter by verdict', description: 'All, Allowed, Blocked or Needs review, with live counts. The log refreshes by itself.', side: 'bottom' },
  },
  {
    element: '[data-tour="log-search"]',
    popover: { title: 'Search', description: 'Find a document, a tool or a log number like #42.', side: 'bottom' },
  },
  {
    element: '[data-tour="log-chain"]',
    popover: {
      title: 'Tamper-evident chain',
      description:
        'Each row is fingerprinted together with the one before it. If anyone edits or deletes a past row, this turns red and points at the broken row.',
      side: 'bottom',
    },
  },
  {
    popover: { title: 'Open any row', description: 'Click a row to see the exact action, every rule that fired and why, whether it ran, and its fingerprints.' },
  },
]

export const REVIEW_QUEUE_TOUR: DriveStep[] = [
  {
    popover: {
      title: 'Review Queue: humans decide the grey areas',
      description: 'Actions that are allowed but risky, like an email to a gmail address, wait here instead of being blocked outright.',
    },
  },
  {
    element: '[data-tour="tab-pending"]',
    onHighlightStarted: clickOnShow,
    popover: {
      title: 'Pending',
      description:
        'Each card shows the email, why it was held and a countdown. No decision within 10 minutes means <b>denied</b>. An approval only works for the exact email you saw: if it is swapped afterwards, it is blocked (R11).',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="tab-outbox"]',
    onHighlightStarted: clickOnShow,
    popover: { title: 'Outbox', description: 'Every email the sandboxed mail tool sent. With the local inbox running, they also arrive there with attachments.', side: 'bottom' },
  },
]

/**
 * A guided tour that starts once per user the first time `autoStart` is true; the returned function replays it.
 * Steps whose element isn't on screen are skipped.
 */
export function useTour(id: string, steps: DriveStep[], autoStart = true) {
  const userId = useAuth().user?.id ?? null

  const start = useCallback(() => {
    const visible = steps.filter((s) => !s.element || document.querySelector(String(s.element)))
    const tour = driver({
      steps: visible,
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayOpacity: 0.65,
      stagePadding: 6,
      stageRadius: 10,
      popoverClass: 'ag-tour',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Got it',
      onDestroyed: () => {
        if (userId !== null) markSeen(id, userId)
      },
    })
    tour.drive()
  }, [id, steps, userId])

  useEffect(() => {
    if (!autoStart || userId === null || hasSeen(id, userId)) return
    // Let the page render its cards first so every highlighted element exists.
    const timer = window.setTimeout(start, 900)
    return () => window.clearTimeout(timer)
  }, [autoStart, id, userId, start])

  return start
}

/** Run Task tour (kept for the existing import). */
export function useOnboardingTour() {
  return useTour('run-task', RUN_TASK_TOUR)
}
