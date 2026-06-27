import { useEffect, useRef, useState } from 'react'

// Track an element's content width with a ResizeObserver.
export default function useMeasure() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width
      setWidth(w)
    })
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}
