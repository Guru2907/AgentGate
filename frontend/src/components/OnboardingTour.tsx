import { useCallback, useEffect } from 'react'
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

import { useAuth } from '@/state/auth'

/** Per-user "seen the tour" flag. Browser storage can be unavailable (private mode): then the tour just runs again. */
const seenKey = (userId: number) => `agentgate.tour.v1.${userId}`

function hasSeen(userId: number): boolean {
  try {
    return window.localStorage.getItem(seenKey(userId)) === 'done'
  } catch {
    return false
  }
}

function markSeen(userId: number) {
  try {
    window.localStorage.setItem(seenKey(userId), 'done')
  } catch {
    /* storage blocked: nothing to remember */
  }
}

const STEPS: DriveStep[] = [
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
        '<b>Summarise resume</b> screens a resume (the AI may only summarise). <b>Email company</b> lets the AI draft an email to a company contact, which the gate checks before anything is sent.',
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
    popover: {
      title: '3. Your documents',
      description: 'Only your own uploads appear here. Each account has a private workspace.',
      side: 'right',
    },
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
        'Results show the hidden instruction (if any), every action the AI proposed, the gate\'s verdict and the exact rule. Fooled or not, harmful actions never run.',
      side: 'left',
    },
  },
  {
    element: '[data-tour="rules"]',
    popover: {
      title: 'The rules for this task',
      description: 'Open the live rulebook: allowed actions, approved company domains, protected files.',
      side: 'top',
    },
  },
  {
    element: 'header [aria-label="Gate Log"]',
    popover: {
      title: 'Gate Log',
      description:
        'Every action ever proposed, allowed or not, in a tamper-evident chain. Edit one row and verification fails.',
      side: 'bottom',
    },
  },
  {
    element: 'header [aria-label="Review Queue"]',
    popover: {
      title: 'Review Queue',
      description:
        'Risky-but-valid actions (like an email to a gmail address) wait here for a human. No decision in 10 minutes means denied. Sent emails are in the Outbox tab.',
      side: 'bottom',
    },
  },
  {
    element: 'header [aria-label="Attack Bench"]',
    popover: {
      title: 'Attack Bench',
      description:
        'Proof: score the gate on hundreds of test documents, let an attacker AI invent new attacks, or fire a known attack in one click.',
      side: 'bottom',
    },
  },
  {
    popover: {
      title: 'You are ready',
      description:
        'Tip: try <b>Email company</b> with a resume whose hidden text asks the AI to read the confidential placement list first. Every step looks allowed; watch the gate stop the email anyway. Replay this tour any time from <b>Take the tour</b>.',
    },
  },
]

/** Guided tour of Run Task and the app. Starts once per user on first visit; `start()` replays it. */
export function useOnboardingTour() {
  const userId = useAuth().user?.id ?? null

  const start = useCallback(() => {
    // Skip steps whose element isn't on screen (e.g. the Run button while Email company is selected).
    const steps = STEPS.filter((s) => !s.element || document.querySelector(String(s.element)))
    const tour = driver({
      steps,
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayOpacity: 0.65,
      stagePadding: 6,
      stageRadius: 10,
      popoverClass: 'ag-tour',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Start using AgentGate',
      onDestroyed: () => {
        if (userId !== null) markSeen(userId)
      },
    })
    tour.drive()
  }, [userId])

  useEffect(() => {
    if (userId === null || hasSeen(userId)) return
    // Let the page render its cards first so every highlighted element exists.
    const timer = window.setTimeout(start, 900)
    return () => window.clearTimeout(timer)
  }, [userId, start])

  return start
}
