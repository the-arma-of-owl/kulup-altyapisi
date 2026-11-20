'use client'

import { useEffect, useId, useRef, type KeyboardEvent } from 'react'

const HEIGHT = 44

export const WheelPicker = ({ label, options, value, onChange }: {
  label: string
  options: string[]
  value: string
  onChange: (value: string) => void
}) => {
  const id = useId()
  const list = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const index = Math.max(0, options.indexOf(value))

  useEffect(() => {
    if (list.current) list.current.scrollTop = index * HEIGHT
  }, [index, options])
  useEffect(() => {
    if (!value && options.length) onChange(options[0])
  }, [value, options, onChange])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const select = (next: number) => {
    const position = Math.max(0, Math.min(options.length - 1, next))
    list.current?.scrollTo({ top: position * HEIGHT, behavior: 'smooth' })
    if (options[position] !== value) onChange(options[position])
  }
  const onScroll = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (list.current) select(Math.round(list.current.scrollTop / HEIGHT))
    }, 100)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      select(index + (event.key === 'ArrowDown' ? 1 : -1))
    }
  }

  return <div className="byt-gate__wheel" aria-label={label}>
    <div ref={list} role="listbox" aria-label={label} aria-activedescendant={`${id}-${index}`}
      className="byt-gate__wheel-list" tabIndex={0} onScroll={onScroll} onKeyDown={onKeyDown}>
      <div className="byt-gate__wheel-pad" aria-hidden="true" />
      {options.map((option, position) => <div key={`${position}-${option}`} id={`${id}-${position}`}
        role="option" aria-selected={position === index} className="byt-gate__wheel-option"
        onClick={() => select(position)}>{option}</div>)}
      <div className="byt-gate__wheel-pad" aria-hidden="true" />
    </div>
  </div>
}
