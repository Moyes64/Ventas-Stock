import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/** Duration of inactivity (ms) after which hidden options are auto-hidden */
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000 // 2 minutes

/** Activity events that reset the inactivity timer */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
]

interface HiddenOptionsContextValue {
  /** Whether the hidden "ventas en negro" options are currently visible */
  isHiddenOptionsVisible: boolean
}

const HiddenOptionsContext = createContext<HiddenOptionsContextValue>({
  isHiddenOptionsVisible: false,
})

export function HiddenOptionsProvider({ children }: { children: ReactNode }) {
  const [isVisible, setIsVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Clear the existing inactivity timer */
  function clearInactivityTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  /** Start (or restart) the 2-minute inactivity timer */
  function startInactivityTimer() {
    clearInactivityTimer()
    timerRef.current = setTimeout(() => {
      setIsVisible(false)
    }, INACTIVITY_TIMEOUT_MS)
  }

  /** Handler for user activity events — resets the timer while options are visible */
  function handleActivity() {
    setIsVisible(prev => {
      if (prev) startInactivityTimer()
      return prev
    })
  }

  useEffect(() => {
    /** Toggle visibility on Ctrl+Shift+N */
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault()
        setIsVisible(prev => {
          const next = !prev
          if (next) {
            startInactivityTimer()
          } else {
            clearInactivityTimer()
          }
          return next
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true })
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity)
      }
      clearInactivityTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <HiddenOptionsContext.Provider value={{ isHiddenOptionsVisible: isVisible }}>
      {children}
    </HiddenOptionsContext.Provider>
  )
}

/** Hook to access the hidden options visibility state */
export function useHiddenOptions(): HiddenOptionsContextValue {
  return useContext(HiddenOptionsContext)
}
