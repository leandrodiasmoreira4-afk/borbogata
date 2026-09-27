"use client";

import Image from "next/image";
import Link from "next/link";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function BrandHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const update = () => {
      if (motion.matches || connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) {
        video.pause();
        setReady(false);
        return;
      }
      video.src = "/brand/borbogata-institucional.mp4";
      void video.play().catch(() => setPlaying(false));
    };
    update();
    motion.addEventListener("change", update);
    return () => { motion.removeEventListener("change", update); video.pause(); };
  }, []);

  async function toggleVideo() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) { video.pause(); return; }
    if (!video.getAttribute("src")) video.src = "/brand/borbogata-institucional.mp4";
    try { await video.play(); } catch { setPlaying(false); }
  }

  return <section className="brand-film" aria-labelledby="brand-title">
    <Image src="/brand/borbogata-poster.jpg" alt="Campanha institucional Borbogata" fill priority sizes="100vw" className="brand-film-poster" />
    <video ref={videoRef} className={ready && !failed ? "brand-film-video is-ready" : "brand-film-video"}
      muted loop playsInline preload="none" poster="/brand/borbogata-poster.jpg" aria-hidden="true"
      onPlaying={() => { setReady(true); setPlaying(true); }} onPause={() => setPlaying(false)}
      onError={() => { setFailed(true); setPlaying(false); }} />
    <div className="brand-film-shade" />
    <div className="brand-film-copy">
      <h1 id="brand-title">Você, ousada<br />e sem limites.</h1>
      <Link href="#novidades" className="brand-film-cta">Ver novidades</Link>
    </div>
    {!failed && <button className="brand-film-control" onClick={toggleVideo} aria-label={playing ? "Pausar vídeo" : "Reproduzir vídeo"}>
      {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
    </button>}
  </section>;
}
