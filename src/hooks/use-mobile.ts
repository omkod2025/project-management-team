import * as React from "react"

/** The house phone layout: 750px and below (DESIGN.md § 5). */
const PHONE_QUERY = "(max-width: 750px)"

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(PHONE_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/** True on the phone layout. The server renders the desktop layout. */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  )
}
