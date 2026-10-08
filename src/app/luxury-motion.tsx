"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Ambient light is decorative. It never simulates ledger activity. */
export function LuxuryMotion() {
 const pathname=usePathname();
 const atmosphere=useRef<HTMLDivElement>(null);
 const enabled=!pathname.startsWith('/rwa') && !pathname.startsWith('/wallet');
 useEffect(()=>{
  if(!enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const cards=Array.from(document.querySelectorAll<HTMLElement>('.portal-page .portal-panel,.portal-page .proof-flow-stage,.portal-page .credit-schematic>div')).filter(card=>!card.querySelector('.portal-wallet-control'));
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('luxury-visible');observer.unobserve(entry.target);}}),{threshold:.08});
  cards.forEach((card,i)=>{card.style.setProperty('--reveal-delay',`${Math.min(i%4*70,210)}ms`);card.classList.add('luxury-reveal');observer.observe(card);});
  let frame=0;
  const move=(event:PointerEvent)=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{atmosphere.current?.style.setProperty('--ambient-x',`${event.clientX/window.innerWidth*100}%`);atmosphere.current?.style.setProperty('--ambient-y',`${event.clientY/window.innerHeight*100}%`);});};
  window.addEventListener('pointermove',move,{passive:true});
  return ()=>{cancelAnimationFrame(frame);window.removeEventListener('pointermove',move);observer.disconnect();cards.forEach(card=>{card.classList.remove('luxury-reveal','luxury-visible');card.style.removeProperty('--reveal-delay');});};
 },[pathname,enabled]);
 if(!enabled)return null;
 return <div ref={atmosphere} className="luxury-atmosphere" aria-hidden="true">{Array.from({length:18},(_,i)=><i key={i} style={{left:`${(i*37+11)%100}%`,top:`${(i*29+7)%100}%`,animationDelay:`${-i*1.3}s`,animationDuration:`${14+i%5*3}s`}}/>)}</div>;
}
