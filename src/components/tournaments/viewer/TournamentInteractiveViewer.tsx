import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { Maximize2, Minimize2, ZoomIn, ZoomOut, MoveHorizontal, Expand, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared display shell for dense tournament views (pool matrix, Swiss progression, bracket, schedule board).
 * Display only: it never fetches or writes tournament data. Views pass ready-made content as children.
 */
export interface TournamentInteractiveViewerProps {
  title: string;
  children: ReactNode;
  /** Natural content size; measured from the content when omitted. */
  contentSize?: { width: number; height: number };
  toolbarExtras?: ReactNode;
  minZoom?: number;
  maxZoom?: number;
  defaultFit?: "width" | "screen" | "none";
  /** Inline frame height in px. */
  inlineHeight?: number;
  className?: string;
}

export const fitScale = (
  mode: "width" | "screen",
  frame: { width: number; height: number },
  content: { width: number; height: number },
  min = 0.25,
  max = 3,
) => {
  if (!content.width || !content.height || !frame.width || !frame.height) return 1;
  const w = frame.width / content.width;
  const s = mode === "width" ? w : Math.min(w, frame.height / content.height);
  return Math.min(max, Math.max(min, s));
};

export function TournamentInteractiveViewer({
  title, children, contentSize, toolbarExtras, minZoom = 0.25, maxZoom = 3, defaultFit = "width", inlineHeight = 480, className,
}: TournamentInteractiveViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [scale, setScale] = useState(1);
  const api = useRef<ReactZoomPanPinchRef | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const expandBtn = useRef<HTMLButtonElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement | null>(null);
  const [measured, setMeasured] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (contentSize || !contentRef.current) return;
    const el = contentRef.current;
    const read = () => setMeasured({ width: el.scrollWidth, height: el.scrollHeight });
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [contentSize, expanded]);

  const size = contentSize ?? measured;

  const applyFit = useCallback((mode: "width" | "screen") => {
    const f = frameRef.current; const a = api.current;
    if (!f || !a) return;
    const frame = { width: f.clientWidth, height: f.clientHeight };
    const s = fitScale(mode, frame, size, minZoom, maxZoom);
    const x = Math.max(0, (frame.width - size.width * s) / 2);
    const y = mode === "screen" ? Math.max(0, (frame.height - size.height * s) / 2) : 0;
    a.setTransform(x, y, s, 150);
  }, [size, minZoom, maxZoom]);

  const reset = useCallback(() => {
    if (defaultFit === "none") api.current?.setTransform(0, 0, 1, 150);
    else applyFit(defaultFit);
  }, [applyFit, defaultFit]);
  const actual = useCallback(() => api.current?.setTransform(0, 0, 1, 150), []);

  // Initial / mode-change fit once the size is known.
  useEffect(() => {
    if (!size.width || defaultFit === "none") return;
    const t = setTimeout(() => applyFit(defaultFit), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, size.width, size.height]);

  // Escape closes; focus moves into overlay and back to the Expand button.
  useEffect(() => {
    if (!expanded) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setExpanded(false); } };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      expandBtn.current?.focus();
    };
  }, [expanded]);

  const onFrameKey = (e: React.KeyboardEvent) => {
    const a = api.current; if (!a) return;
    if (e.key === "+" || e.key === "=") { e.preventDefault(); a.zoomIn(0.2, 150); }
    else if (e.key === "-") { e.preventDefault(); a.zoomOut(0.2, 150); }
    else if (e.key === "0") { e.preventDefault(); reset(); }
    else if (e.key.toLowerCase() === "f") { e.preventDefault(); applyFit("screen"); }
    else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const { positionX: x, positionY: y, scale: s } = a.instance.transformState;
      const d = 40;
      a.setTransform(x + (e.key === "ArrowLeft" ? d : e.key === "ArrowRight" ? -d : 0), y + (e.key === "ArrowUp" ? d : e.key === "ArrowDown" ? -d : 0), s, 100);
    }
  };

  const toolbar = (
    <div role="toolbar" aria-label={`${title} view controls`} className="flex flex-wrap items-center gap-1">
      <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Zoom out" onClick={() => api.current?.zoomOut(0.2, 150)}><ZoomOut className="h-4 w-4" /></Button>
      <span aria-live="polite" aria-label="Zoom level" className="min-w-[3.25rem] text-center text-xs tabular-nums">{Math.round(scale * 100)}%</span>
      <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Zoom in" onClick={() => api.current?.zoomIn(0.2, 150)}><ZoomIn className="h-4 w-4" /></Button>
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1" aria-label="Fit width" onClick={() => applyFit("width")}><MoveHorizontal className="h-4 w-4" />Width</Button>
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1" aria-label="Fit screen" onClick={() => applyFit("screen")}><Expand className="h-4 w-4" />Fit</Button>
      <Button type="button" size="sm" variant="outline" className="h-8" aria-label="Actual size 100%" onClick={actual}>100%</Button>
      <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label="Reset zoom" onClick={reset}><RotateCcw className="h-4 w-4" /></Button>
      {toolbarExtras}
      {expanded ? (
        <Button ref={closeBtn} type="button" size="sm" className="h-8 gap-1 ml-auto" aria-label="Close expanded view" onClick={() => setExpanded(false)}><Minimize2 className="h-4 w-4" />Close</Button>
      ) : (
        <Button ref={expandBtn} type="button" size="sm" className="h-8 gap-1 ml-auto" aria-label="Expand view" onClick={() => setExpanded(true)}><Maximize2 className="h-4 w-4" />Expand</Button>
      )}
    </div>
  );

  const body = (
    <div
      ref={frameRef}
      tabIndex={0}
      aria-label={`${title} — use plus, minus, 0 to reset, F to fit, arrows to pan`}
      onKeyDown={onFrameKey}
      className={cn("relative overflow-hidden rounded-md border border-border bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring", expanded ? "flex-1" : "")}
      style={expanded ? undefined : { height: inlineHeight }}
    >
      <TransformWrapper
        ref={api}
        minScale={minZoom}
        maxScale={maxZoom}
        limitToBounds={false}
        centerOnInit={false}
        wheel={{ activationKeys: ["Control", "Meta"], step: 0.08 }}
        pinch={{ step: 5 }}
        doubleClick={{ disabled: true }}
        panning={{ velocityDisabled: false, excluded: ["input", "select", "textarea", "button"] }}
        onTransformed={(_, s) => setScale(s.scale)}
      >
        <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ transformOrigin: "0 0" }}>
          <div ref={contentRef} style={contentSize ? { width: contentSize.width, height: contentSize.height } : { width: "max-content" }}>
            {children}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );

  if (expanded) {
    return createPortal(
      <div role="dialog" aria-modal="true" aria-label={`${title} expanded`} className="fixed inset-0 z-50 flex flex-col gap-2 bg-background p-3 text-foreground">
        <div className="flex items-center gap-2"><h2 className="text-sm font-semibold truncate">{title}</h2></div>
        {toolbar}
        {body}
      </div>,
      document.body,
    );
  }

  return (
    <section className={cn("space-y-2", className)} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{title}</h3></div>
      {toolbar}
      {body}
    </section>
  );
}
