"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ConfirmActionOverlay from "@/ui/confirm-action-overlay/confirm-action-overlay";
import {
  bindAppDialog,
  type AppAlertOptions,
  type AppConfirmOptions,
  type AppPromptOptions,
} from "@/lib/app-dialog";
import styles from "@/ui/app-dialog/app-dialog.module.css";

type ConfirmState = AppConfirmOptions & {
  resolve: (value: boolean) => void;
};

type PromptState = AppPromptOptions & {
  resolve: (value: string | null) => void;
};

const AppDialogContext = createContext<{
  alert: (options: AppAlertOptions) => void;
} | null>(null);

export function useAppDialogAlert() {
  const ctx = useContext(AppDialogContext);
  return useCallback(
    (message: string, options?: Partial<AppAlertOptions>) => {
      ctx?.alert({ message, ...options });
    },
    [ctx],
  );
}

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [alertState, setAlertState] = useState<AppAlertOptions | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const promptInputRef = useRef<HTMLInputElement | null>(null);

  const alert = useCallback((options: AppAlertOptions) => {
    setAlertState(options);
  }, []);

  const confirm = useCallback((options: AppConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const prompt = useCallback((options: AppPromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setPromptValue(options.defaultValue ?? "");
      setPromptState({ ...options, resolve });
    });
  }, []);

  useEffect(() => {
    bindAppDialog({ alert, confirm, prompt });
    return () => bindAppDialog(null);
  }, [alert, confirm, prompt]);

  useEffect(() => {
    if (!promptState) return;
    const id = window.requestAnimationFrame(() => {
      promptInputRef.current?.focus();
      promptInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [promptState]);

  const ctx = useMemo(() => ({ alert }), [alert]);

  return (
    <AppDialogContext.Provider value={ctx}>
      {children}

      {alertState && (
        <div
          className={styles.backdrop}
          role="dialog"
          aria-modal="true"
          onClick={() => setAlertState(null)}
        >
          <div
            className={`${styles.card} ${styles.cardInfo}`}
            onClick={(e) => e.stopPropagation()}
          >
            {alertState.title ? (
              <h3 className={styles.title}>{alertState.title}</h3>
            ) : null}
            <p className={styles.body}>{alertState.message}</p>
            <div className={styles.actionsSingle}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => setAlertState(null)}
              >
                {alertState.okLabel ?? "Đóng"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmState && (
        <ConfirmActionOverlay
          open
          title={confirmState.title}
          body={confirmState.body}
          variant={confirmState.variant ?? "danger"}
          labelConfirm={confirmState.confirmLabel ?? "Xác nhận"}
          labelCancel={confirmState.cancelLabel ?? "Hủy"}
          onClose={() => {
            confirmState.resolve(false);
            setConfirmState(null);
          }}
          onConfirm={() => {
            confirmState.resolve(true);
            setConfirmState(null);
          }}
        />
      )}

      {promptState && (
        <div
          className={styles.backdrop}
          role="dialog"
          aria-modal="true"
          onClick={() => {
            promptState.resolve(null);
            setPromptState(null);
          }}
        >
          <div
            className={`${styles.card} ${styles.cardInfo}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.title}>{promptState.title}</h3>
            <input
              ref={promptInputRef}
              className={styles.input}
              value={promptValue}
              placeholder={promptState.placeholder}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  promptState.resolve(promptValue);
                  setPromptState(null);
                }
                if (e.key === "Escape") {
                  promptState.resolve(null);
                  setPromptState(null);
                }
              }}
            />
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => {
                  promptState.resolve(null);
                  setPromptState(null);
                }}
              >
                {promptState.cancelLabel ?? "Hủy"}
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  promptState.resolve(promptValue);
                  setPromptState(null);
                }}
              >
                {promptState.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppDialogContext.Provider>
  );
}
