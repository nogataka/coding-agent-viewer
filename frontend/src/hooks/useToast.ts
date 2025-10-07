import { useState, useCallback } from 'react';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast = { ...toast, id };
    
    setToasts((prev) => [...prev, newToast]);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
    
    // For now, just log to console as a fallback
    if (toast.variant === 'destructive') {
      console.error(`[Toast Error] ${toast.title}:`, toast.description);
    } else {
      console.log(`[Toast] ${toast.title}:`, toast.description);
    }
  }, []);

  return { toast, toasts };
}