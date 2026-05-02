import React, { useEffect, useState } from "react";
import { CheckCircle, AlertCircle, Info, X, XCircle } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

interface ToastContainerProps {
    toasts: Toast[];
    onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
    return (
        <div className="toast-container">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const duration = toast.duration || 5000;
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(() => onDismiss(toast.id), 300);
        }, duration);

        return () => clearTimeout(timer);
    }, [toast, onDismiss]);

    const icons = {
        success: <CheckCircle size={20} />,
        error: <XCircle size={20} />,
        info: <Info size={20} />,
        warning: <AlertCircle size={20} />,
    };

    return (
        <div className={`toast toast-${toast.type} ${isExiting ? "toast-exit" : ""}`}>
            <div className="toast-icon">{icons[toast.type]}</div>
            <div className="toast-message">{toast.message}</div>
            <button
                type="button"
                className="toast-close"
                onClick={() => {
                    setIsExiting(true);
                    setTimeout(() => onDismiss(toast.id), 300);
                }}
            >
                <X size={16} />
            </button>
        </div>
    );
}

export function useToast() {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = (type: ToastType, message: string, duration?: number) => {
        const id = `toast-${Date.now()}-${Math.random()}`;
        setToasts((prev) => [...prev, { id, type, message, duration }]);
    };

    const dismissToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return {
        toasts,
        success: (message: string, duration?: number) => addToast("success", message, duration),
        error: (message: string, duration?: number) => addToast("error", message, duration),
        info: (message: string, duration?: number) => addToast("info", message, duration),
        warning: (message: string, duration?: number) => addToast("warning", message, duration),
        dismiss: dismissToast,
    };
}
