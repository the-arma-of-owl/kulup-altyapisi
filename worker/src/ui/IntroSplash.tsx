import { useEffect, useRef, useState } from 'react'
import introVideo from '../assets/intro.mp4'

// Uygulama açılışında bir kez oynayan sesli tanıtım videosu (ses ABT worker'ın açılış sesi; numpy ile sentezlenmiş, lisans gerektirmez).
// Tıklama / Esc / Enter / Boşluk ile geçilir, bitince giriş ekranına yumuşakça geçer.
// "Hareketi azalt" açıksa veya aynı pencere oturumunda zaten oynadıysa hiç gösterilmez.
const PLAYED_KEY = 'kulup-intro-played'

function shouldPlay(): boolean {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  try { return sessionStorage.getItem(PLAYED_KEY) !== '1' } catch { return true }
}

export function IntroSplash() {
  const [state, setState] = useState<'playing' | 'leaving' | 'done'>(() => (shouldPlay() ? 'playing' : 'done'))
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (state !== 'playing') return
    try { sessionStorage.setItem(PLAYED_KEY, '1') } catch { /* depolama kapalıysa her açılışta oynar */ }
    const finish = () => setState((s) => (s === 'playing' ? 'leaving' : s))
    const onKey = (event: KeyboardEvent) => { if (['Escape', 'Enter', ' '].includes(event.key)) finish() }
    window.addEventListener('keydown', onKey)
    // Video oynatılamazsa ekranda takılı kalmasın
    const safety = window.setTimeout(finish, 6000)
    // ABT gibi: açılış sesiyle oynat; ses engellenirse sessiz dene, o da olmazsa geç.
    const video = videoRef.current
    if (video) {
      video.volume = 0.8
      void video.play().catch(() => { video.muted = true; return video.play() }).catch(finish)
    }
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(safety) }
  }, [state])

  useEffect(() => {
    if (state !== 'leaving') return
    const timer = window.setTimeout(() => setState('done'), 450)
    return () => clearTimeout(timer)
  }, [state])

  if (state === 'done') return null
  return <div className={`intro-splash${state === 'leaving' ? ' intro-splash--leaving' : ''}`}
    onClick={() => setState('leaving')} role="presentation" aria-hidden="true">
    <video ref={videoRef} src={introVideo} playsInline preload="auto"
      onEnded={() => setState('leaving')} onError={() => setState('leaving')} />
  </div>
}
