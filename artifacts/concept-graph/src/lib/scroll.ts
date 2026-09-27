export const getScrollPos = (id: string) => {
  try {
    const v = sessionStorage.getItem(scroll_ + id);
    return v ? parseInt(v, 10) : undefined;
  } catch (e) {
    return undefined;
  }
};

const scrollTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

export const setScrollPos = (id: string, top: number) => {
  try {
    if (scrollTimeouts.has(id)) {
      clearTimeout(scrollTimeouts.get(id));
    }
    const timeout = setTimeout(() => {
      sessionStorage.setItem(scroll_ + id, top.toString());
      scrollTimeouts.delete(id);
    }, 150);
    scrollTimeouts.set(id, timeout);
  } catch (e) {}
};
