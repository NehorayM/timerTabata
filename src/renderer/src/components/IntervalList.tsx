import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatDuration } from '../../../shared/format'
import { INTERVAL_LABELS } from '../../../shared/sequence'
import type { Interval, Workout } from '../../../shared/types'
import { Icon } from './Icon'

export function intervalText(i: Interval): string {
  return `${i.number}. ${INTERVAL_LABELS[i.type]}: ${formatDuration(i.duration)}`
}

export function describe(i: Interval, w: Workout): string {
  if (i.type === 'work') return w.workDescription.trim()
  if (i.type === 'rest' || i.type === 'setRest') return w.restDescription.trim()
  return ''
}

/**
 * Numbered interval list ending with "Finish". The active row is auto-scrolled to the top;
 * manual scrolling suspends that until the user returns to the current interval.
 */
export function IntervalList({
  sequence,
  workout,
  activeIndex,
  className,
  colorFor
}: {
  sequence: Interval[]
  workout: Workout
  activeIndex: number | null
  className?: string
  colorFor?: (i: Interval) => string
}): React.JSX.Element {
  const ref = useRef<HTMLOListElement>(null)
  const [follow, setFollow] = useState(true)
  const programmatic = useRef(false)

  const scrollToActive = (smooth: boolean): void => {
    const list = ref.current
    if (!list || activeIndex === null) return
    const row = list.children[activeIndex] as HTMLElement | undefined
    if (!row) return
    programmatic.current = true
    list.scrollTo({ top: row.offsetTop, behavior: smooth ? 'smooth' : 'auto' })
    window.setTimeout(() => (programmatic.current = false), smooth ? 600 : 50)
  }

  useLayoutEffect(() => {
    if (follow) scrollToActive(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, follow, sequence.length])

  useEffect(() => {
    const list = ref.current
    if (!list) return
    const ro = new ResizeObserver(() => follow && scrollToActive(false))
    ro.observe(list)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, activeIndex])

  const onUserScroll = (): void => {
    if (!programmatic.current && activeIndex !== null) setFollow(false)
  }

  return (
    <div className={`interval-list-wrap ${className ?? ''}`}>
      <ol
        className="interval-list"
        ref={ref}
        onWheel={onUserScroll}
        onTouchMove={onUserScroll}
        onKeyDown={(e) => ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key) && onUserScroll()}
        onMouseDown={(e) => {
          // Dragging the scrollbar counts as manual scrolling.
          if (e.target === e.currentTarget) onUserScroll()
        }}
        tabIndex={0}
        aria-label="Intervals"
      >
        {sequence.map((i) => {
          const d = describe(i, workout)
          const active = i.index === activeIndex
          return (
            <li
              key={i.id}
              className={`interval-row ${active ? 'active' : ''}`}
              aria-current={active ? 'step' : undefined}
              style={colorFor ? { ['--row-color' as string]: colorFor(i) } : undefined}
            >
              <span className="row-text">
                {intervalText(i)}
                {d && (
                  <>
                    {' • '}
                    <bdi className="desc">{d}</bdi>
                  </>
                )}
              </span>
            </li>
          )
        })}
        <li key="finish" className={`interval-row finish-row ${activeIndex === sequence.length ? 'active' : ''}`} aria-current={activeIndex === sequence.length ? 'step' : undefined}>
          <span className="row-text">Finish</span>
        </li>
      </ol>
      {!follow && activeIndex !== null && (
        <button className="follow-btn" onClick={() => setFollow(true)}>
          <Icon name="up" /> Current interval
        </button>
      )}
    </div>
  )
}
