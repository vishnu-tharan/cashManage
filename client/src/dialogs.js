let queue = [];
const listeners = new Set();
const publish = () => listeners.forEach((fn) => fn());
export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const getDialog = () => queue[0] || null;
export function finishDialog(value) {
  const item = queue.shift();
  publish();
  item?.resolve(value);
  item?.focus?.focus();
}
export function ask(message) {
  return new Promise((resolve) => {
    queue.push({
      id: crypto.randomUUID(),
      message,
      confirm: false,
      resolve,
      focus: document.activeElement,
      secret: /password|passphrase|recovery key/i.test(message),
    });
    publish();
  });
}
export function confirmAction(message) {
  return new Promise((resolve) => {
    queue.push({
      id: crypto.randomUUID(),
      message,
      confirm: true,
      resolve,
      focus: document.activeElement,
    });
    publish();
  });
}
