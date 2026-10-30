import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * True once the element has scrolled into view (fires once, then disconnects).
 * Pairs with the `.ag-reveal` CSS class via `data-inview`.
 */
export function useInView<T extends HTMLElement>(rootMargin = '0px 0px -10% 0px'): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  // Without IntersectionObserver support, show content immediately.
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const el = ref.current
    if (!el || inView) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin, threshold: 0.15 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [inView, rootMargin])

  return [ref, inView]
}
