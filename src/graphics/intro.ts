// The one hero intro per session (PLAN.md 7.6). The headline's characters
// resolve from 12% opacity (never 0, so it still counts as the LCP paint)
// while the Data formation assembles. Any input finishes both at once.
//
// This chunk loads with the page, before the engine. The two only share
// timestamps on <html>: the engine reads data-intro-start and data-intro-skip
// to know how far the particles should have gathered when it arrives.
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

const SEEN_KEY = 'intro:seen';

export function runIntro(): void {
  const root = document.documentElement;
  const headline = document.querySelector<HTMLElement>('[data-world-intro]');
  if (!root.classList.contains('intro') || !headline) {
    root.classList.remove('intro');
    return;
  }
  // The visitor pressed a key, clicked, scrolled or touched before this chunk
  // loaded (the inline script in Base.astro records it): skip straight to the end.
  if (root.dataset.introSkip) {
    root.classList.remove('intro');
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Not remembered: harmless.
    }
    return;
  }
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Not remembered: the intro may play again this session, which is harmless.
  }
  root.dataset.introStart = String(performance.now());

  const split = SplitText.create(headline, { type: 'words,chars' }); // words keep lines from breaking mid-word
  gsap.set(headline, { opacity: 1, animation: 'none' });
  const text = gsap.from(split.chars, {
    opacity: 0.12,
    duration: 0.6,
    stagger: 0.035,
    ease: 'power2.out',
    delay: 0.15,
  });
  const finish = () => {
    text.progress(1);
    root.dataset.introSkip = '1';
  };
  text.eventCallback('onComplete', () => {
    split.revert();
    root.classList.remove('intro');
  });
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    addEventListener(type, finish, { once: true, passive: true });
  }
}
