import { useEffect } from "react";

/** One delegated listener gives mouse, touch and keyboard activation the same feedback. */
export function InteractionEffects() {
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const active = new Set<HTMLElement>();
    const clear = () => {
      active.forEach((node) => node.remove());
      active.clear();
    };
    const feedback = (event: MouseEvent) => {
      if (preference.matches || !(event.target instanceof Element)) return;
      const control = event.target.closest('button, a[href], [role="button"]');
      if (
        !(control instanceof HTMLElement) ||
        control.matches(':disabled, [aria-disabled="true"]')
      )
        return;
      const rect = control.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const ring = document.createElement("span");
      ring.className = "interaction-ring";
      ring.setAttribute("aria-hidden", "true");
      const diameter = Math.min(48, rect.height);
      const x = event.detail
        ? Math.max(rect.left, Math.min(event.clientX, rect.right))
        : rect.left + rect.width / 2;
      const y = event.detail
        ? Math.max(rect.top, Math.min(event.clientY, rect.bottom))
        : rect.top + rect.height / 2;
      Object.assign(ring.style, {
        left: `${x - diameter / 2}px`,
        top: `${y - diameter / 2}px`,
        width: `${diameter}px`,
        height: `${diameter}px`,
      });
      if (active.size >= 8) {
        const first = active.values().next().value;
        first?.remove();
        if (first) active.delete(first);
      }
      active.add(ring);
      document.body.appendChild(ring);
      ring.addEventListener(
        "animationend",
        () => {
          ring.remove();
          active.delete(ring);
        },
        { once: true },
      );
    };
    document.addEventListener("click", feedback, true);
    preference.addEventListener("change", clear);
    return () => {
      document.removeEventListener("click", feedback, true);
      preference.removeEventListener("change", clear);
      clear();
    };
  }, []);
  return null;
}
