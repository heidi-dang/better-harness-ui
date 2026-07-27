import React, { useEffect, useRef } from "react";
import { AlertTriangle, Info, AlertOctagon, RefreshCw, X } from "lucide-react";

export interface HarnessConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  isLoading?: boolean;
}

export function HarnessConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "warning",
  isLoading = false,
}: HarnessConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape" && !isLoading) {
        onClose();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const iconMap = {
    danger: <AlertOctagon className="w-6 h-6 text-rose-400" />,
    warning: <AlertTriangle className="w-6 h-6 text-amber-400" />,
    info: <Info className="w-6 h-6 text-sky-400" />,
  };

  const bgIconMap = {
    danger: "bg-rose-500/10 border-rose-500/30",
    warning: "bg-amber-500/10 border-amber-500/30",
    info: "bg-sky-500/10 border-sky-500/30",
  };

  const confirmBtnMap = {
    danger: "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/40",
    warning: "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/40",
    info: "bg-sky-600 hover:bg-sky-500 text-white shadow-sky-950/40",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-dialog-title"
      aria-describedby="confirmation-dialog-description"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
      style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 0px))", paddingRight: "max(1rem, env(safe-area-inset-right, 0px))", paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))", paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))" }}
      onClick={() => {
        if (!isLoading) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md bg-[#16181d] border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 relative max-h-[90vh] overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-3 right-3 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close modal"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 sm:gap-4">
          <div
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl border flex items-center justify-center flex-shrink-0 ${bgIconMap[variant]}`}
          >
            {iconMap[variant]}
          </div>

          <div className="space-y-1 pr-6">
            <h2 id="confirmation-dialog-title" className="text-base font-bold text-white tracking-tight">
              {title}
            </h2>
            <div id="confirmation-dialog-description" className="text-xs text-slate-300 leading-relaxed">
              {description}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 pt-3 border-t border-slate-800/80">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition-colors flex items-center justify-center min-h-[44px]"
          >
            {cancelText}
          </button>

          <button
            ref={confirmBtnRef}
            type="button"
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
            disabled={isLoading}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 min-h-[44px] ${confirmBtnMap[variant]}`}
          >
            {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
