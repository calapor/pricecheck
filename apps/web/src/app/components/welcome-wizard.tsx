"use client";

import { useState, useEffect } from "react";
import type { ReactNode } from "react";

export interface WizardSlide {
  visual: ReactNode;
  headline: string;
  body: ReactNode;
}

interface WelcomeWizardProps {
  slides: WizardSlide[];
  sessionKey?: string;
}

export function WelcomeWizard({ slides, sessionKey = "welcome_wizard_seen" }: WelcomeWizardProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    Promise.resolve(sessionStorage.getItem(sessionKey) !== "1")
      .then((shouldShow) => { if (shouldShow) setVisible(true); })
      .catch(() => {});
  }, [sessionKey]);
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  function dismiss() {
    sessionStorage.setItem(sessionKey, "1");
    setVisible(false);
  }

  function goTo(next: number, dir: "forward" | "back") {
    if (animating) return;
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => {
      setStep(next);
      setAnimating(false);
    }, 220);
  }

  if (!visible) return null;

  const isLast = step === slides.length - 1;
  const isFirst = step === 0;
  const slide = slides[step];

  if (!slide) return null;

  const slideClasses = animating
    ? direction === "forward"
      ? "opacity-0 -translate-x-4"
      : "opacity-0 translate-x-4"
    : "opacity-100 translate-x-0";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={dismiss}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-zinc-900"
          role="dialog"
          aria-modal="true"
          aria-label={String(slides[0]?.headline ?? "Welcome")}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Skip button */}
          {!isLast && (
            <div className="flex justify-end px-6 pt-4">
              <button
                onClick={dismiss}
                className="text-xs text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                Skip
              </button>
            </div>
          )}

          {/* Slide content */}
          <div
            className={`px-8 pb-2 transition-all duration-200 ease-in-out ${slideClasses} ${isLast ? "pt-8" : "pt-2"}`}
          >
            {slide.visual}
            <h2 className="mt-5 text-center text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {slide.headline}
            </h2>
            <div className="mt-2.5 text-center text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {slide.body}
            </div>
          </div>

          {/* Dot indicators */}
          <div className="mt-6 flex justify-center gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i, i > step ? "forward" : "back")}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === step
                    ? "w-5 bg-zinc-800 dark:bg-zinc-200"
                    : "w-1.5 bg-zinc-300 dark:bg-zinc-600 hover:bg-zinc-400 dark:hover:bg-zinc-500"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between px-8 py-6">
            <button
              onClick={() => goTo(step - 1, "back")}
              disabled={isFirst}
              className="text-sm text-zinc-400 transition-colors hover:text-zinc-700 disabled:pointer-events-none disabled:opacity-0 dark:hover:text-zinc-300"
            >
              ← Back
            </button>

            {isLast ? (
              <button
                onClick={dismiss}
                className="rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
              >
                Let&apos;s go
              </button>
            ) : (
              <button
                onClick={() => goTo(step + 1, "forward")}
                className="rounded-full bg-zinc-900 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
