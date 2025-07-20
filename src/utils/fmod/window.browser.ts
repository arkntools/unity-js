const noop = () => {};

export const windowForFMOD = new Proxy(window, {
  get: (target, p, receiver) =>
    p === 'addEventListener' || p === 'removeEventListener'
      ? noop
      : Reflect.get(target, p, receiver),
});
