/**
 * Lightweight transient notifications. Used mainly to surface Git errors
 * (failed checkout, unmerged branch delete, etc.) so operations never fail
 * silently — Cyrex must reflect real Git outcomes (CLAUDE.md: Git-truthful).
 */

import { create } from 'zustand'

export type ToastKind = 'error' | 'success' | 'info'

export interface Toast {
  id: number
  message: string
  kind: ToastKind
}

interface ToastState {
  toasts: Toast[]
  push: (message: string, kind?: ToastKind) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, kind = 'info') =>
    set((s) => ({ toasts: [...s.toasts, { id: nextId++, message, kind }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
