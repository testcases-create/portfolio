// Scroll choreography (PLAN.md 7.6). ScrollTrigger only reads scroll
// progress: scrolling stays native, nothing is pinned or hijacked, and all
// movement comes from GPU uniforms, never from moving DOM elements.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { oneHot } from './sim.shared';
import { formationIndex, scrollWeights } from './weights';

gsap.registerPlugin(ScrollTrigger);

/**
 * Binds scroll triggers for every `main [data-world-formation]` section on the
 * page. Returns a cleanup function. With no sections, the page's own
 * formation applies.
 */
export function bindScroll(pageFormation: number, setTarget: (w: number[]) => void): () => void {
  const sections = [...document.querySelectorAll<HTMLElement>('main [data-world-formation]')];
  if (sections.length === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setTarget(oneHot(sections.length ? formationIndex(sections[0]?.dataset.worldFormation) : pageFormation));
    return () => undefined;
  }
  const formations = sections.map((s) => formationIndex(s.dataset.worldFormation));
  const progress = new Array<number>(sections.length).fill(0);
  const update = () => setTarget(scrollWeights(formations, progress));
  const triggers = sections.slice(1).map((el, j) =>
    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      end: 'top 30%',
      onUpdate: (self) => {
        progress[j + 1] = self.progress;
        update();
      },
      onRefresh: (self) => {
        progress[j + 1] = self.progress;
        update();
      },
    }),
  );
  update();
  return () => triggers.forEach((t) => t.kill());
}
