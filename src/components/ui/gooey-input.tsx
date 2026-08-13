"use client";

import {
  useState,
  useRef,
  useEffect,
  useId,
  useMemo,
  useCallback,
  type ChangeEvent,
  type FocusEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UsernameIcon, EmailIcon, AnimationIcon } from "../icons/GooeyIcons";
import { cn } from "@/lib/utils";

function GooeyFilter({
  filterId,
  blur,
}: {
  filterId: string;
  blur: number;
}) {
  return (
    <svg className="absolute hidden h-0 w-0" aria-hidden>
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}

function SearchIcon({ layoutId }: { layoutId: string }) {
  return (
    <motion.svg
      layoutId={layoutId}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      className="size-4 shrink-0"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </motion.svg>
  );
}

const transition = {
  duration: 0.4,
  type: "spring" as const,
  bounce: 0.25,
};

const iconBubbleVariants = {
  collapsed: { scale: 0, opacity: 0 },
  expanded: { scale: 1, opacity: 1 },
};

export interface GooeyInputClassNames {
  root?: string;
  filterWrap?: string;
  buttonRow?: string;
  trigger?: string;
  input?: string;
  bubble?: string;
  bubbleSurface?: string;
}

export interface GooeyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "className"> {
  placeholder?: string;
  className?: string;
  classNames?: GooeyInputClassNames;
  /** Collapsed control width in px */
  collapsedWidth?: number | string;
  /** Expanded control width in px */
  expandedWidth?: number | string;
  /** Horizontal offset when expanded (px), aligns detached bubble */
  expandedOffset?: number;
  /** Gaussian blur amount for the gooey SVG filter */
  gooeyBlur?: number;
  /** Skip the SVG gooey filter for transform-heavy surfaces. */
  disableGooey?: boolean;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconName?: "username" | "email" | "animation";
  showPlaceholderWhenCollapsed?: boolean;
}

export function GooeyInput({
  placeholder = "Type to search...",
  className,
  classNames,
  collapsedWidth = 115,
  expandedWidth = 200,
  expandedOffset = 64,
  gooeyBlur = 5,
  disableGooey = false,
  value: valueProp,
  defaultValue = "",
  onValueChange,
  onOpenChange,
  disabled = false,
  icon,
  iconName,
  showPlaceholderWhenCollapsed = false,
  onBlur,
  ...inputProps
}: GooeyInputProps) {
  const reactId = useId();
  const safeId = reactId.replace(/:/g, "");
  const filterId = `gooey-filter-${safeId}`;
  const iconLayoutId = `gooey-input-icon-${safeId}`;
  const inputLayoutId = `gooey-input-field-${safeId}`;

  const renderIcon = () => {
    if (icon) return icon;
    if (iconName === "username") return <UsernameIcon />;
    if (iconName === "email") return <EmailIcon />;
    if (iconName === "animation") return <AnimationIcon />;
    return <SearchIcon layoutId={iconLayoutId} />;
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const prevExpandedRef = useRef(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);

  const isControlled = valueProp !== undefined;
  const searchText = isControlled ? valueProp : uncontrolledValue;

  const setSearchText = useCallback(
    (next: string) => {
      if (!isControlled) {
        setUncontrolledValue(next);
      }
      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );

  // Parent callbacks often change identity after validation state updates.
  // Keep the latest setter without treating that as a reason to focus this
  // field again; otherwise moving from Username to Email gets focus stolen.
  const setSearchTextRef = useRef(setSearchText);
  useEffect(() => {
    setSearchTextRef.current = setSearchText;
  }, [setSearchText]);

  const setExpanded = useCallback(
    (next: boolean) => {
      setIsExpanded(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (isExpanded) {
      inputRef.current?.focus();
    } else if (prevExpandedRef.current) {
      setSearchTextRef.current("");
    }
    prevExpandedRef.current = isExpanded;
  }, [isExpanded]);

  const buttonVariants = useMemo(
    () => ({
      collapsed: { marginLeft: 0 },
      expanded: { marginLeft: expandedOffset },
    }),
    [expandedOffset],
  );

  const handleExpand = useCallback(() => {
    if (!disabled) setExpanded(true);
  }, [disabled, setExpanded]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setSearchText(e.target.value);
    },
    [setSearchText],
  );

  const handleBlur = useCallback((event: FocusEvent<HTMLInputElement>) => {
    onBlur?.(event);
    if (!searchText) setExpanded(false);
  }, [onBlur, searchText, setExpanded]);

  const surfaceClass =
    "bg-ink-700 text-text-hi shadow-[inset_0_1px_0_rgba(42,58,86,.55)] transition-colors duration-200 hover:bg-[#1d1d1d] focus-within:bg-[#1d1d1d]";

  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center",
        className,
        classNames?.root,
      )}
    >
      {!disableGooey && <GooeyFilter filterId={filterId} blur={gooeyBlur} />}

      <div
        className={cn(
          "relative flex h-[54px] w-full items-center justify-start",
          classNames?.filterWrap,
        )}
        style={disableGooey ? undefined : { filter: `url(#${filterId})` }}
      >
        <motion.div
          layout
          className={cn("flex h-[54px] flex-1 items-center justify-start", classNames?.buttonRow)}
          variants={buttonVariants}
          initial="collapsed"
          animate={isExpanded ? "expanded" : "collapsed"}
          transition={transition}
        >
          <button
            type="button"
            disabled={disabled}
            onClick={handleExpand}
            className={cn(
              "flex h-[54px] w-full cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-[color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
              surfaceClass,
              classNames?.trigger,
            )}
          >
            <AnimatePresence mode="popLayout">
              {!isExpanded && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    "flex size-full items-center text-text-hi [&_svg]:size-[1.25em]",
                    showPlaceholderWhenCollapsed ? "justify-start gap-3 px-2" : "justify-center",
                  )}
                >
                  {icon || iconName ? (
                    <motion.span
                      layoutId={iconLayoutId}
                      className="flex shrink-0 items-center justify-center"
                    >
                      {renderIcon()}
                    </motion.span>
                  ) : (
                    renderIcon()
                  )}
                  {showPlaceholderWhenCollapsed && (
                    <span className="truncate text-left text-sm font-normal text-text-low">{placeholder}</span>
                  )}
                </motion.div>
              )}
              {isExpanded && (
                <motion.input
                  initial={{ opacity: 0, filter: "blur(4px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: "blur(4px)" }}
                  transition={{ duration: 0.2, delay: 0.1 }}
                  layoutId={inputLayoutId}
                  ref={inputRef}
                  {...inputProps}
                  value={searchText}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={disabled || !isExpanded}
                  placeholder={placeholder}
                  className={cn(
                    "h-full min-w-0 flex-1 bg-transparent text-sm text-text-hi outline-none placeholder:text-text-low",
                    classNames?.input,
                  )}
                />
              )}
            </AnimatePresence>
          </button>
        </motion.div>

        <motion.div
          className={cn(
            "absolute top-1/2 left-0 flex size-[54px] -translate-y-1/2 items-center justify-center",
            classNames?.bubble,
          )}
          variants={iconBubbleVariants}
          initial="collapsed"
          animate={isExpanded ? "expanded" : "collapsed"}
          transition={transition}
        >
          <div
            className={cn(
              "flex size-[54px] items-center justify-center rounded-full",
              surfaceClass,
              classNames?.bubbleSurface,
            )}
          >
            {icon || iconName ? (
              <motion.div layoutId={iconLayoutId} className="flex size-full items-center justify-center text-text-hi [&_svg]:size-[1.25em]">
                {renderIcon()}
              </motion.div>
            ) : (
              <SearchIcon layoutId={iconLayoutId} />
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
