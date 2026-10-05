'use client';

import React from 'react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center justify-between rounded-xl p-4 shadow-lg border text-sm transition-all animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/90 dark:border-emerald-800 dark:text-emerald-200'
              : toast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/90 dark:border-rose-800 dark:text-rose-200'
              : 'bg-neutral-50 border-neutral-200 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-200'
          }`}
        >
          <div className="flex items-center gap-3">
            {toast.type === 'success' && (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
                ✓
              </span>
            )}
            {toast.type === 'error' && (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white text-xs font-bold">
                ✕
              </span>
            )}
            <p className="font-medium leading-tight">{toast.message}</p>
          </div>
          <button
            onClick={() => onDismiss(toast.id)}
            className="ml-3 shrink-0 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            aria-label="Close notification"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
