import gsap from 'gsap';

/** Full-screen black fade used to swap between the desk and the studio. */
export function createCurtain(el) {
  return {
    close: (duration = 0.35) => gsap.to(el, { autoAlpha: 1, duration, ease: 'power1.in' }).then(() => {}),
    open: (duration = 0.5) => gsap.to(el, { autoAlpha: 0, duration, ease: 'power1.out' }).then(() => {}),
  };
}
