import { useEffect, useSyncExternalStore } from "react";
import { subscribe, getDialog, finishDialog } from "./dialogs";
export default function DialogHost() {
  const dialog = useSyncExternalStore(subscribe, getDialog);
  useEffect(() => {
    if (!dialog) return;
    const handler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finishDialog(dialog.confirm ? false : null);
      }
      if (e.key === "Tab") {
        const elements = [
          ...document.querySelectorAll(
            "[data-input-dialog] input,[data-input-dialog] button",
          ),
        ];
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [dialog]);
  if (!dialog) return null;
  return (
    <div className="modal-overlay input-dialog">
      <section
        data-input-dialog
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="input-dialog-title"
      >
        <h2 id="input-dialog-title">
          {dialog.confirm ? "Please confirm" : "Enter details"}
        </h2>
        <form
          key={dialog.id}
          onSubmit={(e) => {
            e.preventDefault();
            finishDialog(
              dialog.confirm
                ? true
                : String(new FormData(e.target).get("answer")),
            );
          }}
        >
          {dialog.confirm ? (
            <p className="dialog-message">{dialog.message}</p>
          ) : (
            <label className="field">
              <span>{dialog.message}</span>
              <input
                autoFocus
                autoComplete="off"
                name="answer"
                type={dialog.secret ? "password" : "text"}
                maxLength={512}
              />
            </label>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              onClick={() => finishDialog(dialog.confirm ? false : null)}
            >
              Cancel
            </button>
            <button
              autoFocus={dialog.confirm}
              className="primary"
              type="submit"
            >
              {dialog.confirm ? "Confirm" : "Continue"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
