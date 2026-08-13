import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { animate as motionAnimate, motion, useReducedMotion } from "framer-motion";
import { GooeyInput } from "./ui/gooey-input";
import { GradientHoverButton } from "./ui/GradientHoverButton";
import planeDisplayUrl from "../icons/waitlist/plane-display.png?url";
import waitlistDisplayUrl from "../icons/waitlist/waitlist-display.png?url";
import planeCtaUrl from "../icons/waitlist/plane-cta.png?url";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => value * value * (3 - 2 * value);

type Position = { x: number; y: number; progress: number };
type LockupTransform = { x: number; y: number; rotation: number };
type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "error";
type ReservationState = { stage: "pending" | "confirmed"; username: string; email?: string } | null;

const LOCAL_RESERVED_USERNAMES = new Set([
  "admin", "administrator", "api", "billing", "contact", "cursor", "diana", "help",
  "jijo", "joji", "lao", "lao_so", "login", "moderator", "nik", "oni", "official",
  "root", "security", "staff", "support", "system", "team", "waitlist", "www",
]);
const LOCAL_BLOCKED_USERNAME_TERMS = [
  "abuse", "aryan", "bastard", "bigot", "chink", "cracker", "cunt", "dyke",
  "faggot", "gook", "hate", "heil", "hitler", "homo", "jihad", "kkk", "kike",
  "lynch", "nazi", "negro", "pedo", "racist", "rape", "rapist", "retard",
  "slut", "spic", "terrorist", "tranny", "whore",
];

function locallyValidateUsername(username: string) {
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return "Use 3–20 letters, numbers, or underscores.";
  if (LOCAL_RESERVED_USERNAMES.has(username)) return "That username is reserved. Try another.";
  const moderationKey = username.toLowerCase()
    .replace(/[01345@$!]/g, (character) => ({ "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "@": "a", "$": "s", "!": "i" })[character] || character)
    .replace(/[_-]/g, "");
  if (LOCAL_BLOCKED_USERNAME_TERMS.some((term) => moderationKey.includes(term))) return "Choose a different username.";
  return null;
}

function usernameStatusLabel(status: UsernameStatus, message: string) {
  if (status === "checking") return "Checking";
  if (status === "available") return "Available";
  if (status === "taken") return "Taken";
  if (status === "invalid") return message.startsWith("That username is reserved") ? "Reserved" : "Choose another";
  if (status === "error") return "Looks good";
  return "";
}

function ReservationPanel({ reservation, reduceMotion }: { reservation: NonNullable<ReservationState>; reduceMotion: boolean }) {
  const confirmed = reservation.stage === "confirmed";
  const shareText = encodeURIComponent(`I secured @${reservation.username} for LAO.`);
  const shareUrl = `https://x.com/intent/post?text=${shareText}&url=${encodeURIComponent("https://lao.lt")}`;

  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-center">
      <div className="mb-10 mt-1 h-[240px] w-full [perspective:1100px] sm:h-[270px]">
        <motion.div
          className="relative mx-auto h-full w-[min(86%,390px)] [transform-style:preserve-3d]"
          initial={{ rotateX: -5, rotateY: -35, rotateZ: -2 }}
          animate={reduceMotion ? { rotateX: 0, rotateY: 0, rotateZ: 0 } : { rotateX: [-5, 2, -5], rotateY: [-35, 35, 325], rotateZ: [-2, 1, -2] }}
          transition={reduceMotion ? { duration: 0 } : { duration: 11, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.8 }}
        >
          <div className="absolute inset-0 flex flex-col justify-between overflow-hidden rounded-[24px] border border-black/10 bg-[#e9e0cc] p-6 text-left shadow-[0_28px_55px_rgba(0,0,0,.22)] [backface-visibility:hidden] sm:p-8">
            <div className="flex items-start justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-[#57534d]">
              <span>LAO WAITLIST</span><span>{confirmed ? "LOCKED" : "HELD 24H"}</span>
            </div>
            <div>
              <p className="m-0 font-serif text-[42px] leading-none text-[#181818] sm:text-[54px]">@{reservation.username}</p>
              <div className="mt-6 flex justify-between border-t border-black/25 pt-3 font-mono text-[8px] uppercase tracking-[.12em] text-[#57534d]">
                <span>Position<br />reserved</span><span>Status<br />{confirmed ? "confirmed" : "email pending"}</span>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 grid place-items-center overflow-hidden rounded-[24px] border border-black/10 bg-[#e9e0cc] shadow-[0_28px_55px_rgba(0,0,0,.22)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <div className="flex flex-col items-center gap-3 opacity-75">
              <img src={planeDisplayUrl} alt="" className="h-auto w-[126px]" />
              <img src={waitlistDisplayUrl} alt="" className="h-auto w-[126px]" />
            </div>
          </div>
        </motion.div>
      </div>

      <h2 id="waitlist-title" className="site-heading m-0 text-ink-800">
        {confirmed ? "It’s yours." : "Check your inbox."}
      </h2>
      <p className="mx-auto mb-7 mt-4 max-w-[510px] text-pretty text-[17px] leading-[1.6] text-[#3E4A5C]">
        {confirmed
          ? `@${reservation.username} is locked. You’re on the LAO waitlist. I’ll email you when early access is ready.`
          : `I’m holding @${reservation.username} for 24 hours. Confirm ${reservation.email || "your email"} to lock it and join the waitlist.`}
      </p>

      {confirmed && (
        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-[#171717] px-7 font-mono text-[12px] uppercase tracking-[.09em] text-white transition-colors hover:bg-[#303030] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <span aria-hidden="true" className="text-base">𝕏</span>
          Share on X
        </a>
      )}
      {!confirmed && <p className="m-0 font-mono text-[11px] uppercase tracking-[.09em] text-[#687080]">The link expires after 24 hours.</p>}
    </div>
  );
}

export default function FloatingWaitlist() {
  const reduceMotion = useReducedMotion();
  const slotRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const formContentRef = useRef<HTMLDivElement>(null);
  const lockupRef = useRef<HTMLDivElement>(null);
  const openLabelRef = useRef<HTMLSpanElement>(null);
  const peekButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const positionRef = useRef<Position>({ x: 0, y: 0, progress: 0 });
  const renderRef = useRef<() => void>(() => undefined);
  const openRef = useRef(false);
  const peekingRef = useRef(true);
  const movingRef = useRef(false);
  const transitioningRef = useRef(false);
  const forcePeekRef = useRef(false);
  const transitionIdRef = useRef(0);
  const activeAnimationsRef = useRef<Array<{ stop: () => void }>>([]);
  const [slotHeight, setSlotHeight] = useState(720);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [dialogScrollable, setDialogScrollable] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [peeking, setPeekingState] = useState(true);
  const [moving, setMoving] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [checkedUsername, setCheckedUsername] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reservation, setReservation] = useState<ReservationState>(null);
  const lockupImageClassName = open
    ? "h-auto w-[86px] opacity-75 min-[600px]:w-[164px] md:w-[182px]"
    : "h-auto w-[112px] opacity-75 min-[600px]:w-[164px] md:w-[182px]";
  const formContentClassName = open
    ? "relative z-[1] px-3 py-4 text-center will-change-[opacity] sm:px-[22px] sm:py-[44px] md:px-[48px] md:py-[52px]"
    : "relative z-[1] px-4 py-6 text-center will-change-[opacity] sm:px-[22px] sm:py-[44px] md:px-[48px] md:py-[52px]";
  const lockupSpacerClassName = open
    ? "h-[116px] min-[600px]:h-[220px]"
    : "h-[164px] min-[600px]:h-[220px]";

  useEffect(() => setMounted(true), []);

  const setMovingState = useCallback((next: boolean) => {
    if (movingRef.current === next) return;
    movingRef.current = next;
    setMoving(next);
  }, []);

  const stopActiveAnimations = useCallback(() => {
    activeAnimationsRef.current.forEach((animation) => animation.stop());
    activeAnimationsRef.current = [];
  }, []);

  const openWaitlist = useCallback(() => {
    if (openRef.current) return;
    forcePeekRef.current = false;
    openRef.current = true;
    transitioningRef.current = true;
    setMovingState(true);
    setOpen(true);
  }, [setMovingState]);

  const requestClose = useCallback((forcePeek: boolean) => {
    if (!openRef.current) return;
    forcePeekRef.current = forcePeek;
    openRef.current = false;
    transitioningRef.current = true;
    setMovingState(true);
    setOpen(false);
  }, [setMovingState]);

  const closeWaitlist = useCallback(() => requestClose(false), [requestClose]);

  const checkUsername = useCallback(async (candidate = username) => {
    const normalized = candidate.trim().replace(/^@+/, "").toLowerCase();
    setUsername(normalized);
    setCheckedUsername("");
    const localValidationMessage = locallyValidateUsername(normalized);
    if (localValidationMessage) {
      setUsernameStatus("invalid");
      setUsernameMessage(localValidationMessage);
      return false;
    }

    setUsernameStatus("checking");
    setUsernameMessage("Checking…");
    try {
      const response = await fetch(`/api/username?username=${encodeURIComponent(normalized)}`, {
        headers: { Accept: "application/json" },
      });
      const result = await response.json() as { available?: boolean; message?: string };
      if (response.ok && result.available) {
        setUsernameStatus("available");
        setUsernameMessage(`@${normalized} is available.`);
        setCheckedUsername(normalized);
        return true;
      }
      if (response.status === 404 || response.status === 503) {
        // Astro's local preview does not run Pages Functions. The final submit
        // still checks the database after D1 is bound on Cloudflare.
        setUsernameStatus("available");
        setUsernameMessage("Looks good. Availability is confirmed when you reserve it.");
        setCheckedUsername(normalized);
        return true;
      }
      setUsernameStatus(response.status === 409 ? "taken" : "invalid");
      setUsernameMessage(result.message || "That username isn’t available.");
      return false;
    } catch {
      // Keep local previews usable when Pages Functions are not running.
      setUsernameStatus("available");
      setUsernameMessage("Looks good. Availability is confirmed when you reserve it.");
      setCheckedUsername(normalized);
      return true;
    }
  }, [username]);

  const submitWaitlist = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setFormMessage("");
    setSubmitting(true);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormMessage("Enter a valid email address.");
      setSubmitting(false);
      return;
    }

    const normalizedUsername = username.trim().replace(/^@+/, "").toLowerCase();
    const usernameIsReady = checkedUsername === normalizedUsername && usernameStatus === "available"
      ? true
      : await checkUsername(normalizedUsername);
    if (!usernameIsReady) {
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ username: normalizedUsername, email, first_animation: description, company: "" }),
      });
      const result = await response.json() as { message?: string; field?: string; username?: string; status?: string };
      if (!response.ok) {
        // Astro's local dev server renders the site but does not mount Pages
        // Functions. Let the interaction be previewed locally; Cloudflare D1
        // remains the authority for the actual reservation in production.
        if ((response.status === 404 || response.status === 503) && window.location.hostname === "127.0.0.1") {
          setReservation({ stage: "pending", username: normalizedUsername, email });
          return;
        }
        if (result.field === "username") {
          setUsernameStatus("taken");
          setUsernameMessage(result.message || "That username is taken. Try another.");
        } else {
          setFormMessage(result.message || "Something went wrong. Try again.");
        }
        return;
      }
      setReservation({ stage: "pending", username: result.username || normalizedUsername, email });
    } catch {
      if (window.location.hostname === "127.0.0.1") {
        setReservation({ stage: "pending", username: normalizedUsername, email });
      } else {
        setFormMessage("Unable to reach the waitlist. Check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [checkUsername, checkedUsername, description, email, submitting, username, usernameStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const waitlistState = params.get("waitlist");
    if (waitlistState === "confirmed") {
      const confirmedUsername = (params.get("username") || "").replace(/^@+/, "");
      if (confirmedUsername) {
        setReservation({ stage: "confirmed", username: confirmedUsername });
        requestAnimationFrame(openWaitlist);
      }
    } else if (waitlistState === "expired" || waitlistState === "invalid") {
      setFormMessage(waitlistState === "expired"
        ? "That confirmation link expired. Submit the form again to reclaim the username."
        : "That confirmation link isn’t valid.");
      requestAnimationFrame(openWaitlist);
    }
  }, [openWaitlist]);

  const getClosedPosition = useCallback((forcePeek = false): Position => {
    const slot = slotRef.current;
    const card = cardRef.current;
    if (!slot || !card) return positionRef.current;

    const slotRect = slot.getBoundingClientRect();
    const cardWidth = slotRect.width;
    const cardHeight = card.scrollHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const safeRight = Math.max(0, Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--waitlist-safe-right")) || 0);

    card.style.width = `${cardWidth}px`;

    // Match Feather's independent corner card: roughly one quarter of its
    // width remains on-screen, pinned to the top-right before the section.
    const peekVisibleFraction = viewportWidth < 640 ? 0.28 : 0.24;
    // On phones, keep the minimized card 20px farther right so it reads as a
    // corner tab instead of sitting over the page content.
    const mobilePeekOffset = viewportWidth < 640 ? 20 : 0;
    const peekX = viewportWidth - cardWidth * peekVisibleFraction - safeRight - (viewportWidth >= 640 ? 16 : 0) + mobilePeekOffset;
    const peekY = viewportWidth < 640 ? 16 : 24;

    // Begin the hand-off just below the viewport. Finish early enough that the
    // card is tracking its real slot before the form can be interacted with.
    const start = viewportHeight * 1.16;
    const end = Math.max(84, viewportHeight * 0.13);
    const rawEntryProgress = clamp01((start - slotRect.top) / (start - end));
    const entryProgress = smoothstep(clamp01(rawEntryProgress / 0.94));

    // The card is an independent corner object, not a permanently fixed
    // replacement for its slot. After its full-form moment has been visible,
    // hand it back to the original corner peek while the reader continues
    // down the page. Reversing the same progress when scrolling up keeps the
    // transition continuous in both directions.
    const exitStart = viewportHeight * 0.55;
    const exitEnd = -Math.min(cardHeight * 0.16, viewportHeight * 0.18);
    const exitProgress = smoothstep(clamp01((exitStart - slotRect.bottom) / (exitStart - exitEnd)));
    const progress = forcePeek ? 0 : entryProgress * (1 - exitProgress);

    return {
      x: gsap.utils.interpolate(
        peekX - cardWidth * peekVisibleFraction * 0.4,
        slotRect.left,
        progress,
      ),
      y: gsap.utils.interpolate(peekY - 240, slotRect.top, progress),
      progress,
    };
  }, []);

  const getLockupTransform = useCallback((progress: number): LockupTransform => {
    const card = cardRef.current;
    const lockup = lockupRef.current;
    if (!card || !lockup) return { x: 0, y: 0, rotation: 0 };

    const isMobile = window.innerWidth < 600;
    const isTablet = window.innerWidth >= 600 && window.innerWidth < 1024;
    // A +32 / +32 local offset becomes a clean horizontal shift once the
    // peeking card is rotated -45°, putting the entire lockup inside the
    // mobile paper triangle rather than straddling its diagonal edge.
    const mobileTriangleInset = isMobile ? 32 : 0;
    // Compensate for the card's -45° rotation so the mobile lockup moves
    // straight up by its established 48px, with no sideways drift.
    const mobileUpOffset = isMobile ? 48 / Math.SQRT2 : 0;
    // Tablet needs the same rotation-aware treatment: the original 24px lift
    // plus the requested additional 16px.
    const tabletUpOffset = isTablet ? 40 / Math.SQRT2 : 0;
    // Equal local X/Y movement maps to a straight rightward shift through the
    // card's -45° rotation, preserving the vertical placement.
    const tabletRightOffset = isTablet ? 24 / Math.SQRT2 : 0;
    const peekX = card.offsetWidth * 0.12 - lockup.offsetWidth / 2 + mobileTriangleInset + mobileUpOffset + tabletUpOffset + tabletRightOffset;
    const peekY = 120 - lockup.offsetHeight / 2 + mobileTriangleInset - mobileUpOffset - tabletUpOffset + tabletRightOffset;
    const formX = (card.offsetWidth - lockup.offsetWidth) / 2;
    const formY = isMobile ? 28 : 32;

    return {
      x: gsap.utils.interpolate(peekX, formX, progress),
      y: gsap.utils.interpolate(peekY, formY, progress),
      rotation: gsap.utils.interpolate(40, 0, progress),
    };
  }, []);

  const setPeeking = useCallback((peeking: boolean) => {
    const formContent = formContentRef.current as (HTMLDivElement & { inert?: boolean }) | null;
    const peekButton = peekButtonRef.current;
    if (formContent) formContent.inert = peeking;
    if (peekButton) {
      peekButton.style.pointerEvents = peeking ? "auto" : "none";
      peekButton.tabIndex = peeking ? 0 : -1;
      peekButton.setAttribute("aria-hidden", peeking ? "false" : "true");
    }
    if (peekingRef.current !== peeking) {
      peekingRef.current = peeking;
      setPeekingState(peeking);
    }
  }, []);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const slot = slotRef.current;
    if (!card || !slot) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let previousScroll = window.scrollY;
    let filteredVelocity = 0;

    const render = () => {
      frame = 0;
      if (openRef.current || transitioningRef.current) return;

      const next = getClosedPosition(forcePeekRef.current);
      const scrollDelta = window.scrollY - previousScroll;
      previousScroll = window.scrollY;
      filteredVelocity += (scrollDelta - filteredVelocity) * 0.22;

      const inTransfer = next.progress > 0.015 && next.progress < 0.985;
      const stretch = reduced || !inTransfer ? 0 : Math.min(0.055, Math.abs(filteredVelocity) * 0.0022);
      const direction = Math.sign(filteredVelocity || 1);
      const peekScale = 0.42;
      const baseScale = gsap.utils.interpolate(peekScale, 1, next.progress);
      const contentReveal = smoothstep(clamp01((next.progress - 0.58) / 0.36));
      const lockupTransform = getLockupTransform(next.progress);

      positionRef.current = next;
      setMovingState(inTransfer);
      setPeeking(next.progress < 0.985);
      gsap.set(card, {
        x: next.x,
        y: next.y,
        rotation: gsap.utils.interpolate(-45, 0, next.progress),
        scaleX: baseScale * (1 - stretch * 0.34),
        scaleY: baseScale * (1 + stretch),
        skewY: reduced ? 0 : -direction * stretch * 24,
        transformOrigin: "50% 50%",
      });
      gsap.set(formContentRef.current, {
        rotation: 0,
        autoAlpha: contentReveal,
      });
      gsap.set(lockupRef.current, {
        ...lockupTransform,
        transformOrigin: "50% 50%",
      });
      gsap.set(openLabelRef.current, {
        opacity: 1 - smoothstep(next.progress),
      });
      setReady(true);
    };

    const requestRender = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };

    renderRef.current = requestRender;
    const resizeObserver = new ResizeObserver(() => {
      if (!openRef.current) setSlotHeight(card.scrollHeight);
      requestRender();
    });
    resizeObserver.observe(card);
    resizeObserver.observe(slot);

    const onScroll = () => {
      forcePeekRef.current = false;
      requestRender();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", requestRender, { passive: true });
    render();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", requestRender);
      gsap.killTweensOf([card, formContentRef.current, lockupRef.current, openLabelRef.current]);
    };
  }, [getClosedPosition, getLockupTransform, mounted, setMovingState, setPeeking]);

  useEffect(() => {
    openRef.current = open;
    const card = cardRef.current;
    const formContent = formContentRef.current as (HTMLDivElement & { inert?: boolean }) | null;
    const lockup = lockupRef.current;
    const openLabel = openLabelRef.current;
    if (!card || !formContent || !lockup || !openLabel) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const transitionId = ++transitionIdRef.current;
    stopActiveAnimations();
    gsap.killTweensOf([card, formContent, lockup, openLabel]);

    if (open) {
      transitioningRef.current = true;
      setDialogScrollable(false);
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.documentElement.style.overflow = "hidden";
      document.body.style.paddingInlineEnd = scrollbarWidth > 0 ? `${scrollbarWidth}px` : "";
      formContent.inert = false;
      setPeeking(false);

      const cardWidth = card.offsetWidth;
      const safeInset = window.innerWidth < 640 ? 10 : 16;
      const visualHeight = Math.min(card.scrollHeight, window.innerHeight - safeInset * 2);
      const x = Math.max(safeInset, (window.innerWidth - cardWidth) / 2);
      const y = Math.max(safeInset, (window.innerHeight - visualHeight) / 2);
      const lockupTarget = getLockupTransform(1);
      const duration = reduced ? 0 : 0.42;
      gsap.set(formContent, { rotation: 0, autoAlpha: 0 });
      const cardAnimation = motionAnimate(card, {
        x,
        y,
        rotate: 0,
        scaleX: 1,
        scaleY: 1,
        skewY: 0,
      }, {
        duration,
        ease: [0.22, 1, 0.36, 1],
      });
      const lockupAnimation = motionAnimate(lockup, {
        x: lockupTarget.x,
        y: lockupTarget.y,
        rotate: lockupTarget.rotation,
      }, {
        duration,
        ease: [0.22, 1, 0.36, 1],
      });
      const labelAnimation = motionAnimate(openLabel, {
        opacity: 0,
      }, {
        duration: reduced ? 0 : 0.16,
        ease: "easeOut",
      });
      activeAnimationsRef.current = [cardAnimation, lockupAnimation, labelAnimation];
      void cardAnimation.then(() => {
        if (transitionIdRef.current !== transitionId || !openRef.current) return;
        transitioningRef.current = false;
        setMovingState(false);
        setDialogScrollable(true);
        gsap.set(formContent, { autoAlpha: 1 });
        activeAnimationsRef.current = [];
      });
      requestAnimationFrame(() => card.focus({ preventScroll: true }));
    } else {
      transitioningRef.current = true;
      setDialogScrollable(false);
      document.documentElement.style.overflow = "";
      document.body.style.paddingInlineEnd = "";
      const target = getClosedPosition(forcePeekRef.current);
      const peekScale = 0.42;
      const targetScale = gsap.utils.interpolate(peekScale, 1, target.progress);
      const targetReveal = smoothstep(clamp01((target.progress - 0.58) / 0.36));
      const lockupTarget = getLockupTransform(target.progress);
      const duration = reduced ? 0 : 0.4;
      positionRef.current = target;
      gsap.set(formContent, { rotation: 0, autoAlpha: 0 });
      const cardAnimation = motionAnimate(card, {
        x: target.x,
        y: target.y,
        rotate: gsap.utils.interpolate(-45, 0, target.progress),
        scaleX: targetScale,
        scaleY: targetScale,
        skewY: 0,
      }, {
        duration,
        ease: [0.4, 0, 0.2, 1],
      });
      const lockupAnimation = motionAnimate(lockup, {
        x: lockupTarget.x,
        y: lockupTarget.y,
        rotate: lockupTarget.rotation,
      }, {
        duration,
        ease: [0.4, 0, 0.2, 1],
      });
      const labelAnimation = motionAnimate(openLabel, {
        opacity: target.progress < 0.985 ? 1 : 0,
      }, {
        duration: reduced ? 0 : 0.18,
        delay: reduced ? 0 : 0.08,
        ease: "easeOut",
      });
      activeAnimationsRef.current = [cardAnimation, lockupAnimation, labelAnimation];
      void cardAnimation.then(() => {
        if (transitionIdRef.current !== transitionId || openRef.current) return;
        transitioningRef.current = false;
        setMovingState(target.progress > 0.015 && target.progress < 0.985);
        setPeeking(target.progress < 0.985);
        if (targetReveal > 0) {
          gsap.set(formContent, { autoAlpha: targetReveal });
          activeAnimationsRef.current = [];
        } else {
          activeAnimationsRef.current = [];
        }
        renderRef.current();
      });
    }

    return () => {
      stopActiveAnimations();
      document.documentElement.style.overflow = "";
      document.body.style.paddingInlineEnd = "";
    };
  }, [getClosedPosition, getLockupTransform, mounted, open, setMovingState, setPeeking, stopActiveAnimations]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeWaitlist();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeWaitlist, open]);

  return (
    <>
      <div
        ref={slotRef}
        aria-hidden="true"
        className="mx-auto w-full"
        style={{ height: slotHeight }}
      />

      {mounted && createPortal(<>
      <button
        type="button"
        className={`fixed inset-0 z-[110] touch-none bg-black/70 transition-opacity duration-200 ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
        aria-label="Close waitlist"
        tabIndex={open ? 0 : -1}
        onPointerDown={closeWaitlist}
        onClick={closeWaitlist}
      />

      <div
        ref={cardRef}
        role={open ? "dialog" : undefined}
        aria-modal={open ? "true" : undefined}
        aria-labelledby="waitlist-title"
        tabIndex={open ? -1 : undefined}
        className={`waitlist-float fixed left-0 top-0 z-[120] rounded-[28px] bg-paper outline-none will-change-transform [backface-visibility:hidden] md:rounded-[59px] ${moving ? "shadow-none" : "shadow-[0_28px_90px_rgba(0,0,0,.48)]"} ${open ? `max-h-[calc(100dvh-20px)] max-md:max-h-[calc(100dvh-12px)] ${dialogScrollable ? "overflow-y-auto overscroll-contain" : "overflow-hidden max-md:overflow-y-auto max-md:overscroll-contain"}` : "overflow-visible"} ${ready ? "visible" : "invisible"}`}
      >
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit] [contain:paint]" aria-hidden="true">
          {!moving && <div className="waitlist-paper-texture h-full w-full opacity-45 mix-blend-multiply" />}
        </div>

        <button
          ref={peekButtonRef}
          type="button"
          aria-label="Open the waitlist"
          className="absolute left-0 top-0 z-30 h-[min(34%,190px)] w-[28%] cursor-pointer rounded-tl-[inherit] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4"
          onClick={openWaitlist}
        />

        <div
          aria-hidden="true"
          className={`pointer-events-none absolute left-0 top-0 z-10 h-[min(34%,190px)] w-[28%] rounded-tl-[inherit] bg-paper/65 transition-opacity duration-300 ${peeking && !open ? "opacity-100" : "opacity-0"}`}
        />

        <div
          ref={lockupRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-20 will-change-transform [backface-visibility:hidden]"
        >
          <div className={`flex flex-col items-center ${open ? "gap-1.5 sm:gap-4" : "gap-2 sm:gap-4"}`}>
            <img src={planeDisplayUrl} alt="" className={lockupImageClassName} />
            <img src={waitlistDisplayUrl} alt="" className={lockupImageClassName} />
          </div>
          <span ref={openLabelRef} className="mt-1 block text-center font-mono text-[20px] uppercase tracking-[0.14em] text-[#4a4a4a] sm:text-[22px]">Open</span>
        </div>

        <div ref={formContentRef} className={formContentClassName}>
          <div aria-hidden="true" className={lockupSpacerClassName} />

          {reservation ? (
            <ReservationPanel reservation={reservation} reduceMotion={Boolean(reduceMotion)} />
          ) : (
          <div className="mx-auto max-w-[560px]">
            <h2 id="waitlist-title" className="site-heading m-0 text-ink-800">
              Get in early. Take a good username.
            </h2>
            <p className="mx-auto mb-5 mt-3 max-w-[520px] text-pretty text-[15px] leading-[1.45] text-[#3E4A5C] sm:mb-[34px] sm:mt-[16px] sm:text-[17px] sm:leading-[1.6]">
              Early access goes out in waves. Tell me what you’d animate and you’ll be in an earlier one.
            </p>

            <form method="POST" action="/api/waitlist" onSubmit={submitWaitlist} noValidate className={`${open ? "gap-3" : "gap-4"} flex flex-col text-left sm:gap-[22px]`}>
              <div className="relative flex flex-col gap-2">
                <label htmlFor="lao-username" className="sr-only">Username</label>
                <GooeyInput
                  id="lao-username"
                  name="username"
                  required
                  autoComplete="off"
                  placeholder="Username"
                  showPlaceholderWhenCollapsed
                  className="w-full justify-start"
                  classNames={{
                    input:
                      "min-w-0 pl-[68px] pr-[108px] text-[16px] sm:pr-32 sm:text-sm",
                  }}
                  collapsedWidth="100%"
                  expandedWidth="calc(100% - 64px)"
                  expandedOffset={0}
                  iconName="username"
                  disableGooey
                  value={username}
                  onValueChange={(value) => {
                    setUsername(value);
                    setUsernameStatus("idle");
                    setUsernameMessage("");
                    setCheckedUsername("");
                  }}
                  onBlur={() => void checkUsername()}
                  aria-describedby={usernameMessage ? "lao-username-status" : undefined}
                  aria-invalid={usernameStatus === "taken" || usernameStatus === "invalid"}
                  disabled={submitting}
                />
                {usernameMessage && (
                  <span
                    id="lao-username-status"
                    role="status"
                    aria-live="polite"
                    title={usernameMessage}
                    className={`pointer-events-none absolute right-5 top-[17px] z-10 max-w-[42%] truncate rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-[.04em] ${usernameStatus === "available" ? "bg-[#dcebdc] text-[#426b45]" : usernameStatus === "checking" ? "bg-[#e3e7ec] text-[#586473]" : "bg-[#f3dcd7] text-[#983b32]"}`}
                  >
                    {usernameStatusLabel(usernameStatus, usernameMessage)}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="lao-email" className="sr-only">Email</label>
                <GooeyInput
                  id="lao-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="Email"
                  showPlaceholderWhenCollapsed
                  className="w-full justify-start"
                  classNames={{
                    input: "min-w-0 pl-[68px] pr-4 text-[16px] sm:text-sm",
                  }}
                  collapsedWidth="100%"
                  expandedWidth="calc(100% - 64px)"
                  expandedOffset={0}
                  iconName="email"
                  disableGooey
                  value={email}
                  onValueChange={(value) => {
                    setEmail(value);
                    setFormMessage("");
                  }}
                  disabled={submitting}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="lao-first" className="sr-only">What would you animate first?</label>
                <GooeyInput
                  id="lao-first"
                  name="first_animation"
                  placeholder="What would you animate first?"
                  showPlaceholderWhenCollapsed
                  className="w-full justify-start"
                  classNames={{
                    input: "min-w-0 pl-[68px] pr-4 text-[16px] sm:text-sm",
                  }}
                  collapsedWidth="100%"
                  expandedWidth="calc(100% - 64px)"
                  expandedOffset={0}
                  iconName="animation"
                  disableGooey
                  value={description}
                  onValueChange={setDescription}
                  maxLength={280}
                  disabled={submitting}
                />
              </div>

              <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-px w-px opacity-0" />

              <GradientHoverButton
                type="submit"
                disabled={submitting || usernameStatus === "checking"}
                background="linear-gradient(in oklab 180deg, oklab(0% 0 0) 0%, oklab(48.5% -0.018 -0.082) 100%)"
                hoverBackground="linear-gradient(in oklab 180deg, oklab(10% 0 -0.01) 0%, oklab(58% -0.03 -0.13) 100%)"
                borderColor="#292A2A"
                hoverBorderColor="#363636"
                className={`${open ? "mt-0 p-3.5" : "mt-[6px] p-4"} flex w-full items-center justify-center gap-3 rounded-full font-mono text-[13px] uppercase tracking-[0.08em] text-text-hi shadow-[0_4px_14px_0_rgba(0,0,0,0.39)]`}
              >
                <img src={planeCtaUrl} alt="" aria-hidden="true" className="h-5 w-auto object-contain" />
                <span>{submitting ? "Holding your username…" : "Claim my spot"}</span>
              </GradientHoverButton>

              {formMessage && <p role="alert" className="m-0 text-center text-[14px] leading-[1.5] text-[#a33b32]">{formMessage}</p>}

              <p className="m-0 mt-[6px] text-center text-[14px] leading-[1.6] text-[#596270]">
                No spam. One email when it’s ready, and the occasional build update you can leave anytime.
              </p>
            </form>
          </div>
          )}
        </div>
      </div>

      {open && (
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close waitlist"
          onPointerDown={closeWaitlist}
          onClick={closeWaitlist}
          className="group fixed right-[max(12px,env(safe-area-inset-right))] top-[max(12px,env(safe-area-inset-top))] z-[130] grid size-12 touch-manipulation place-items-center rounded-full bg-[#f4f1eb] text-[#3c3c3c] shadow-xl transition-colors duration-150 hover:bg-[#ded9cf] focus-visible:bg-[#ded9cf] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-3"
        >
          <span aria-hidden="true" className="relative block size-5 before:absolute before:left-1/2 before:top-1/2 before:h-[2px] before:w-5 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:bg-current after:absolute after:left-1/2 after:top-1/2 after:h-[2px] after:w-5 after:-translate-x-1/2 after:-translate-y-1/2 after:-rotate-45 after:bg-current" />
        </button>
      )}
      </>, document.body)}
    </>
  );
}
