import { useEffect, useRef } from 'react';

export function Toast({ text }: { text: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof element.showPopover === 'function') {
      if (text && !element.matches(':popover-open')) element.showPopover();
      if (!text && element.matches(':popover-open')) element.hidePopover();
    } else element.hidden = !text;
  }, [text]);
  return <div ref={ref} className="toast" popover="manual" role="status">{text}</div>;
}
