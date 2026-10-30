import { prefersReducedMotion } from '@/lib/usePrefersReducedMotion'

/** Smooth-scrolls to a section by id; its scroll-margin keeps the title clear of the navbar. */
export function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
}
