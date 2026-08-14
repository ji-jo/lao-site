"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type TriggerGroupContext = {
  activeId: symbol | null;
  setActiveId: (id: symbol) => void;
};

const TriggerContext = createContext<TriggerGroupContext | null>(null);

function ScrollObserver({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className}>{children}</div>;
}

function TriggerGroup({ className, children }: { className?: string; children: ReactNode }) {
  const [activeId, setActiveId] = useState<symbol | null>(null);
  return (
    <TriggerContext.Provider value={{ activeId, setActiveId }}>
      <div className={className}>{children}</div>
    </TriggerContext.Provider>
  );
}

function Trigger({
  className,
  children,
}: {
  className?: string;
  children: (isActive: boolean) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef(Symbol("scroll-observer-trigger"));
  const group = useContext(TriggerContext);
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsIntersecting(entry?.isIntersecting ?? false),
      { rootMargin: "0px 0px -24% 0px", threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isIntersecting) group?.setActiveId(idRef.current);
  }, [group, isIntersecting]);

  const isActive = group ? group.activeId === idRef.current : isIntersecting;
  return (
    <div ref={ref} className={className}>
      {children(isActive)}
    </div>
  );
}

ScrollObserver.TriggerGroup = TriggerGroup;
ScrollObserver.Trigger = Trigger;

export { ScrollObserver };
