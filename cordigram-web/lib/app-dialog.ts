export type AppAlertOptions = {
  title?: string;
  message: string;
  okLabel?: string;
};

export type AppConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
};

export type AppPromptOptions = {
  title: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type AppDialogHandlers = {
  alert: (options: AppAlertOptions) => void;
  confirm: (options: AppConfirmOptions) => Promise<boolean>;
  prompt: (options: AppPromptOptions) => Promise<string | null>;
};

let handlers: AppDialogHandlers | null = null;

export function bindAppDialog(next: AppDialogHandlers | null) {
  handlers = next;
}

/** Replaces browser `alert()` — no more "www.cordigram.com says". */
export function appAlert(message: string, options?: Partial<AppAlertOptions>) {
  handlers?.alert({ message, ...options });
}

/** Replaces browser `confirm()`. */
export function appConfirm(
  titleOrOptions: string | AppConfirmOptions,
): Promise<boolean> {
  const options =
    typeof titleOrOptions === "string"
      ? { title: titleOrOptions }
      : titleOrOptions;
  return handlers?.confirm(options) ?? Promise.resolve(false);
}

/** Replaces browser `prompt()`. */
export function appPrompt(
  titleOrOptions: string | AppPromptOptions,
  defaultValue?: string,
): Promise<string | null> {
  const options =
    typeof titleOrOptions === "string"
      ? { title: titleOrOptions, defaultValue }
      : titleOrOptions;
  return handlers?.prompt(options) ?? Promise.resolve(null);
}
