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
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return "Use 3â€“20 letters, numbers, or underscores.";
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
        {confirmed ? "Itâ€™s yours." : "Check your inbox."}
      </h2>
      <p className="mx-auto mb-7 mt-4 max-w-[510px] text-pretty text-[17px] leading-[1.6] text-[#3E4A5C]">
        {confirmed
          ? `@${reservation.username} is locked. Youâ€™re on the LAO waitlist. Iâ€™ll email you when early access is ready.`
          : `Iâ€™m holding @${reservation.username} for 24 hours. Confirm ${reservation.email || "your email"} to lock it and join the waitlist.`}
      </p>

      {confirmed && (
        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-[#171717] px-7 font-mono text-[12px] uppercase tracking-[.09em] text-white transition-colors hover:bg-[#303030] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <span aria-hidden="true" className="text-base">ð•</span>
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
  const returnWaitlistToSide = useCallback(() => requestClose(true), [requestClose]);

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
    setUsernameMessage("Checkingâ€¦");
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
      setUsernameMessage(result.message || "That username isnâ€™t available.");
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
        : "That confirmation link isnâ€™t valid.");
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
    const safeRight = Math.max(0, Number.parseFloat(getComputedStyle(doÛ½µ¶‰žËkºwµçU¹Ð¹±¥•¹Ñ]¥‘Ñ ì4(€€€€€‘½Õµ•¹Ð¹‘½Õµ•¹Ñ±•µ•¹Ð¹ÍÑå±”¹½Ù•É™±½Ü€ô€‰¡¥‘‘•¸ˆì4(€€€€€‘½Õµ•¹Ð¹‰½‘ä¹ÍÑå±”¹Á…‘‘¥¹%¹±¥¹•¹€ôÍÉ½±±‰…É]¥‘Ñ €ø€À€ü€‘íÍÉ½±±‰…É]¥‘Ñ¡õÁá€€è€ˆˆì4(€€€€€™½Éµ½¹Ñ•¹Ð¹¥¹•ÉÐ€ô™…±Í”ì4(€€€€€Í•ÑA••­¥¹œ¡™…±Í”¤ì4(4(€€€€€½¹ÍÐ…É‘]¥‘Ñ €ô…É¹½™™Í•Ñ]¥‘Ñ ì4(€€€€€½¹ÍÐÙ¥ÍÕ…±!•¥¡Ð€ô5…Ñ ¹µ¥¸¡…É¹ÍÉ½±±!•¥¡Ð°Ý¥¹‘½Ü¹¥¹¹•É!•¥¡Ð€´€ÌÈ¤ì4(€€€€€½¹ÍÐà€ô5…Ñ ¹µ…à ÄØ°€¡Ý¥¹‘½Ü¹¥¹¹•É]¥‘Ñ €´…É‘]¥‘Ñ ¤€¼€È¤ì4(€€€€€½¹ÍÐä€ô5…Ñ ¹µ…à ÄØ°€¡Ý¥¹‘½Ü¹¥¹¹•É!•¥¡Ð€´Ù¥ÍÕ…±!•¥¡Ð¤€¼€È¤ì4(€€€€€½¹ÍÐ±½­ÕÁQ…É•Ð€ô•Ñ1½­ÕÁQÉ…¹Í™½É´ Ä¤ì4(€€€€€½¹ÍÐ‘ÕÉ…Ñ¥½¸€ôÉ•‘Õ•€ü€À€è€À¸ÐÈì4(€€€€€Í…À¹Í•Ð¡™½Éµ½¹Ñ•¹Ð°ìÉ½Ñ…Ñ¥½¸è€À°…ÕÑ½±Á¡„è€Àô¤ì4(€€€€€½¹ÍÐ…É‘¹¥µ…Ñ¥½¸€ôµ½Ñ¥½¹¹¥µ…Ñ”¡…É°ì4(€€€€€€€à°4(€€€€€€€ä°4(€€€€€€€É½Ñ…Ñ”è€À°4(€€€€€€€Í…±•`è€Ä°4(€€€€€€€Í…±•dè€Ä°4(€€€€€€€Í­•Ýdè€À°4(€€€€€ô°ì4(€€€€€€€‘ÕÉ…Ñ¥½¸°4(€€€€€€€•…Í”èlÀ¸ÈÈ°€Ä°€À¸ÌØ°€Åt°4(€€€€€ô¤ì4(€€€€€½¹ÍÐ±½­ÕÁ¹¥µ…Ñ¥½¸€ôµ½Ñ¥½¹¹¥µ…Ñ”¡±½­ÕÀ°ì4(€€€€€€€àè±½­ÕÁQ…É•Ð¹à°4(€€€€€€€äè±½­ÕÁQ…É•Ð¹ä°4(€€€€€€€É½Ñ…Ñ”è±½­ÕÁQ…É•Ð¹É½Ñ…Ñ¥½¸°4(€€€€€ô°ì4(€€€€€€€‘ÕÉ…Ñ¥½¸°4(€€€€€€€•…Í”èlÀ¸ÈÈ°€Ä°€À¸ÌØ°€Åt°4(€€€€€ô¤ì4(€€€€€½¹ÍÐ±…‰•±¹¥µ…Ñ¥½¸€ôµ½Ñ¥½¹¹¥µ…Ñ”¡½Á•¹1…‰•°°ì4(€€€€€€€½Á…¥Ñäè€À°4(€€€€€ô°ì4(€€€€€€€‘ÕÉ…Ñ¥½¸èÉ•‘Õ•€ü€À€è€À¸ÄØ°4(€€€€€€€•…Í”è€‰•…Í•=ÕÐˆ°4(€€€€€ô¤ì4(€€€€€…Ñ¥Ù•¹¥µ…Ñ¥½¹ÍI•˜¹ÕÉÉ•¹Ð€ôm…É‘¹¥µ…Ñ¥½¸°±½­ÕÁ¹¥µ…Ñ¥½¸°±…‰•±¹¥µ…Ñ¥½¹tì4(€€€€€Ù½¥…É‘¹¥µ…Ñ¥½¸¹Ñ¡•¸  ¤€ôøì4(€€€€€€€¥˜€¡ÑÉ…¹Í¥Ñ¥½¹%‘I•˜¹ÕÉÉ•¹Ð€„ôôÑÉ…¹Í¥Ñ¥½¹%ñð€…½Á•¹I•˜¹ÕÉÉ•¹Ð¤É•ÑÕÉ¸ì4(€€€€€€€ÑÉ…¹Í¥Ñ¥½¹¥¹I•˜¹ÕÉÉ•¹Ð€ô™…±Í”ì4(€€€€€€€Í•Ñ5½Ù¥¹MÑ…Ñ”¡™…±Í”¤ì4(€€€€€€€Í•Ñ¥…±½MÉ½±±…‰±”¡ÑÉÕ”¤ì4(€€€€€€€Í…À¹Í•Ð¡™½Éµ½¹Ñ•¹Ð°ì…ÕÑ½±Á¡„è€Äô¤ì4(€€€€€€€…Ñ¥Ù•¹¥µ…Ñ¥½¹ÍI•˜¹ÕÉÉ•¹Ð€ômtì4(€€€€€ô¤ì4(€€€€€É•ÅÕ•ÍÑ¹¥µ…Ñ¥½¹É…µ”  ¤€ôø…É¹™½ÕÌ¡ìÁÉ•Ù•¹ÑMÉ½±°èÑÉÕ”ô¤¤ì4(€€€ô•±Í”ì4(€€€€€ÑÉ…¹Í¥Ñ¥½¹¥¹I•˜¹ÕÉÉ•¹Ð€ôÑÉÕ”ì4(€€€€€Í•Ñ¥…±½MÉ½±±…‰±”¡™…±Í”¤ì4(€€€€€‘½Õµ•¹Ð¹‘½Õµ•¹Ñ±•µ•¹Ð¹ÍÑå±”¹½Ù•É™±½Ü€ô€ˆˆì4(€€€€€‘½Õµ•¹Ð¹‰½‘ä¹ÍÑå±”¹Á…‘‘¥¹%¹±¥¹•¹€ô€ˆˆì4(€€€€€½¹ÍÐÑ…É•Ð€ô•Ñ±½Í•‘A½Í¥Ñ¥½¸¡™½É•A••­I•˜¹ÕÉÉ•¹Ð¤ì4(€€€€€½¹ÍÐÁ••­M…±”€ô€À¸ÐÈì4(€€€€€½¹ÍÐÑ…É•ÑM…±”€ôÍ…À¹ÕÑ¥±Ì¹¥¹Ñ•ÉÁ½±…Ñ”¡Á••­M…±”°€Ä°Ñ…É•Ð¹ÁÉ½É•ÍÌ¤ì4(€€€€€½¹ÍÐÑ…É•ÑI•Ù•…°€ôÍµ½½Ñ¡ÍÑ•À¡±…µÀÀÄ ¡Ñ…É•Ð¹ÁÉ½É•ÍÌ€´€À¸Ôà¤€¼€À¸ÌØ¤¤ì4(€€€€€½¹ÍÐ±½­ÕÁQ…É•Ð€ô•Ñ1½­ÕÁQÉ…¹Í™½É´¡Ñ…É•Ð¹ÁÉ½É•ÍÌ¤ì4(€€€€€½¹ÍÐ‘ÕÉ…Ñ¥½¸€ôÉ•‘Õ•€ü€À€è€À¸Ðì4(€€€€€Á½Í¥Ñ¥½¹I•˜¹ÕÉÉ•¹Ð€ôÑ…É•Ðì4(€€€€€Í…À¹Í•Ð¡™½Éµ½¹Ñ•¹Ð°ìÉ½Ñ…Ñ¥½¸è€À°…ÕÑ½±Á¡„è€Àô¤ì4(€€€€€½¹ÍÐ…É‘¹¥µ…Ñ¥½¸€ôµ½Ñ¥½¹¹¥µ…Ñ”¡…É°ì4(€€€€€€€àèÑ…É•Ð¹à°4(€€€€€€€äèÑ…É•Ð¹ä°4(€€€€€€€É½Ñ…Ñ”èÍ…À¹ÕÑ¥±Ì¹¥¹Ñ•ÉÁ½±…Ñ” ´ÐÔ°€À°Ñ…É•Ð¹ÁÉ½É•ÍÌ¤°4(€€€€€€€Í…±•`èÑ…É•ÑM…±”°4(€€€€€€€Í…±•dèÑ…É•ÑM…±”°4(€€€€€€€Í­•Ýdè€À°4(€€€€€ô°ì4(€€€€€€€‘ÕÉ…Ñ¥½¸°4(€€€€€€€•…Í”èlÀ¸Ð°€À°€À¸È°€Åt°4(€€€€€ô¤ì4(€€€€€½¹ÍÐ±½­ÕÁ¹¥µ…Ñ¥½¸€ôµ½Ñ¥½¹¹¥µ…Ñ”¡±½­ÕÀ°ì4(€€€€€€€àè±½­ÕÁQ…É•Ð¹à°4(€€€€€€€äè±½­ÕÁQ…É•Ð¹ä°4(€€€€€€€É½Ñ…Ñ”è±½­ÕÁQ…É•Ð¹É½Ñ…Ñ¥½¸°4(€€€€€ô°ì4(€€€€€€€‘ÕÉ…Ñ¥½¸°4(€€€€€€€•…Í”èlÀ¸Ð°€À°€À¸È°€Åt°4(€€€€€ô¤ì4(€€€€€½¹ÍÐ±…‰•±¹¥µ…Ñ¥½¸€ôµ½Ñ¥½¹¹¥µ…Ñ”¡½Á•¹1…‰•°°ì4(€€€€€€€½Á…¥ÑäèÑ…É•Ð¹ÁÉ½É•ÍÌ€ð€À¸äàÔ€ü€Ä€è€À°4(€€€€€ô°ì4(€€€€€€€‘ÕÉ…Ñ¥½¸èÉ•‘Õ•€ü€À€è€À¸Äà°4(€€€€€€€‘•±…äèÉ•‘Õ•€ü€À€è€À¸Àà°4(€€€€€€€•…Í”è€‰•…Í•=ÕÐˆ°4(€€€€€ô¤ì4(€€€€€…Ñ¥Ù•¹¥µ…Ñ¥½¹ÍI•˜¹ÕÉÉ•¹Ð€ôm…É‘¹¥µ…Ñ¥½¸°±½­ÕÁ¹¥µ…Ñ¥½¸°±…‰•±¹¥µ…Ñ¥½¹tì4(€€€€€Ù½¥…É‘¹¥µ…Ñ¥½¸¹Ñ¡•¸  ¤€ôøì4(€€€€€€€¥˜€¡ÑÉ…¹Í¥Ñ¥½¹%‘I•˜¹ÕÉÉ•¹Ð€„ôôÑÉ…¹Í¥Ñ¥½¹%ñð½Á•¹I•˜¹ÕÉÉ•¹Ð¤É•ÑÕÉ¸ì4(€€€€€€€ÑÉ…¹Í¥Ñ¥½¹¥¹I•˜¹ÕÉÉ•¹Ð€ô™…±Í”ì4(€€€€€€€Í•Ñ5½Ù¥¹MÑ…Ñ”¡Ñ…É•Ð¹ÁÉ½É•ÍÌ€ø€À¸ÀÄÔ€˜˜Ñ…É•Ð¹ÁÉ½É•ÍÌ€ð€À¸äàÔ¤ì4(€€€€€€€Í•ÑA••­¥¹œ¡Ñ…É•Ð¹ÁÉ½É•ÍÌ€ð€À¸äàÔ¤ì4(€€€€€€€¥˜€¡Ñ…É•ÑI•Ù•…°€ø€À¤ì4(€€€€€€€€€Í…À¹Í•Ð¡™½Éµ½¹Ñ•¹Ð°ì…ÕÑ½±Á¡„èÑ…É•ÑI•Ù•…°ô¤ì4(€€€€€€€€€…Ñ¥Ù•¹¥µ…Ñ¥½¹ÍI•˜¹ÕÉÉ•¹Ð€ômtì4(€€€€€€€ô•±Í”ì4(€€€€€€€€€…Ñ¥Ù•¹¥µ…Ñ¥½¹ÍI•˜¹ÕÉÉ•¹Ð€ômtì4(€€€€€€€ô4(€€€€€€€É•¹‘•ÉI•˜¹ÕÉÉ•¹Ð ¤ì4(€€€€€ô¤ì4(€€€ô4(4(€€€É•ÑÕÉ¸€ ¤€ôøì4(€€€€€ÍÑ½ÁÑ¥Ù•¹¥µ…Ñ¥½¹Ì ¤ì4(€€€€€‘½Õµ•¹Ð¹‘½Õµ•¹Ñ±•µ•¹Ð¹ÍÑå±”¹½Ù•É™±½Ü€ô€ˆˆì4(€€€€€‘½Õµ•¹Ð¹‰½‘ä¹ÍÑå±”¹Á…‘‘¥¹%¹±¥¹•¹€ô€ˆˆì4(€€€ôì4(€ô°m•Ñ±½Í•‘A½Í¥Ñ¥½¸°•Ñ1½­ÕÁQÉ…¹Í™½É´°µ½Õ¹Ñ•°½Á•¸°Í•Ñ5½Ù¥¹MÑ…Ñ”°Í•ÑA••­¥¹œ°ÍÑ½ÁÑ¥Ù•¹¥µ…Ñ¥½¹Ít¤ì4(4(€ÕÍ•™™•Ð  ¤€ôøì4(€€€¥˜€ …½Á•¸¤É•ÑÕÉ¸ì4(€€€½¹ÍÐ½¹-•å½Ý¸€ô€¡•Ù•¹Ðè-•å‰½…É‘Ù•¹Ð¤€ôøì4(€€€€€¥˜€¡•Ù•¹Ð¹­•ä€ôôô€‰Í…Á”ˆ¤±½Í•]…¥Ñ±¥ÍÐ ¤ì4(€€€ôì4(€€€½¹ÍÐ½¹MÉ½±±%¹Ñ•¹Ð€ô€ ¤€ôøÉ•ÑÕÉ¹]…¥Ñ±¥ÍÑQ½M¥‘” ¤ì4(€€€Ý¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰­•å‘½Ý¸ˆ°½¹-•å½Ý¸¤ì4(€€€Ý¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰Ý¡••°ˆ°½¹MÉ½±±%¹Ñ•¹Ð°ìÁ…ÍÍ¥Ù”èÑÉÕ”ô¤ì4(€€€Ý¥¹‘½Ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰Ñ½Õ¡µ½Ù”ˆ°½¹MÉ½±±%¹Ñ•¹Ð°ìÁ…ÍÍ¥Ù”èÑÉÕ”ô¤ì4(€€€É•ÑÕÉ¸€ ¤€ôøì4(€€€€€Ý¥¹‘½Ü¹É•µ½Ù•Ù•¹Ñ1¥ÍÑ•¹•È ‰­•å‘½Ý¸ˆ°½¹-•å½Ý¸¤ì4(€€€€€Ý¥¹‘½Ü¹É•µ½Ù•Ù•¹Ñ1¥ÍÑ•¹•È ‰Ý¡••°ˆ°½¹MÉ½±±%¹Ñ•¹Ð¤ì4(€€€€€Ý¥¹‘½Ü¹É•µ½Ù•Ù•¹Ñ1¥ÍÑ•¹•È ‰Ñ½Õ¡µ½Ù”ˆ°½¹MÉ½±±%¹Ñ•¹Ð¤ì4(€€€ôì4(€ô°m±½Í•]…¥Ñ±¥ÍÐ°½Á•¸°É•ÑÕÉ¹]…¥Ñ±¥ÍÑQ½M¥‘•t¤ì4(4(€É•ÑÕÉ¸€ 4(€€€€ðø4(€€€€€€ñ‘¥Ø4(€€€€€€€É•˜õíÍ±½ÑI•™ô4(€€€€€€€…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ4(€€€€€€€±…ÍÍ9…µ”ô‰µàµ…ÕÑ¼Üµ™Õ±°ˆ4(€€€€€€€ÍÑå±”õíì¡•¥¡ÐèÍ±½Ñ!•¥¡Ðõô4(€€€€€€¼ø4(4(€€€€€íµ½Õ¹Ñ•€˜˜É•…Ñ•A½ÉÑ…° ðø4(€€€€€€ñ‰ÕÑÑ½¸4(€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ4(€€€€€€€±…ÍÍ9…µ”õí™¥á•¥¹Í•Ð´ÀèµlÄÄÁtÑ½Õ µ¹½¹”‰œµ‰±…¬¼ÜÀÑÉ…¹Í¥Ñ¥½¸µ½Á…¥Ñä‘ÕÉ…Ñ¥½¸´ÈÀÀ€‘í½Á•¸€ü€‰Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ…ÕÑ¼½Á…¥Ñä´ÄÀÀˆ€è€‰Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”½Á…¥Ñä´À‰õô4(€€€€€€€…É¥„µ±…‰•°ô‰±½Í”Ý…¥Ñ±¥ÍÐˆ4(€€€€€€€Ñ…‰%¹‘•àõí½Á•¸€ü€À€è€´Åô4(€€€€€€€½¹A½¥¹Ñ•É½Ý¸õí±½Í•]…¥Ñ±¥ÍÑô4(€€€€€€€½¹±¥¬õí±½Í•]…¥Ñ±¥ÍÑô4(€€€€€€¼ø4(4(€€€€€€ñ‘¥Ø4(€€€€€€€É•˜õí…É‘I•™ô4(€€€€€€€É½±”õí½Á•¸€ü€‰‘¥…±½œˆ€èÕ¹‘•™¥¹•‘ô4(€€€€€€€…É¥„µµ½‘…°õí½Á•¸€ü€‰ÑÉÕ”ˆ€èÕ¹‘•™¥¹•‘ô4(€€€€€€€…É¥„µ±…‰•±±•‘‰äô‰Ý…¥Ñ±¥ÍÐµÑ¥Ñ±”ˆ4(€€€€€€€Ñ…‰%¹‘•àõí½Á•¸€ü€´Ä€èÕ¹‘•™¥¹•‘ô4(€€€€€€€±…ÍÍ9…µ”õíÝ…¥Ñ±¥ÍÐµ™±½…Ð™¥á•±•™Ð´ÀÑ½À´ÀèµlÄÈÁtÉ½Õ¹‘•µlÈáÁát‰œµÁ…Á•È½ÕÑ±¥¹”µ¹½¹”Ý¥±°µ¡…¹”µÑÉ…¹Í™½É´m‰…­™…”µÙ¥Í¥‰¥±¥Ñäé¡¥‘‘•¹tµéÉ½Õ¹‘•µlÔåÁát€‘íµ½Ù¥¹œ€ü€‰Í¡…‘½Üµ¹½¹”ˆ€è€‰Í¡…‘½ÜµlÁ|ÈáÁá|äÁÁá}É‰„ À°À°À°¸Ðà¥t‰ô€‘í½Á•¸€üµ…àµ µm…±Œ ÄÀÁ‘Ù ´ÌÉÁà¥t€‘í‘¥…±½MÉ½±±…‰±”€ü€‰½Ù•É™±½Üµäµ…ÕÑ¼½Ù•ÉÍÉ½±°µ½¹Ñ…¥¸ˆ€è€‰½Ù•É™±½Üµ¡¥‘‘•¸‰õ€€è€‰½Ù•É™±½ÜµÙ¥Í¥‰±”‰ô€‘íÉ•…‘ä€ü€‰Ù¥Í¥‰±”ˆ€è€‰¥¹Ù¥Í¥‰±”‰õô4(€€€€€€ø4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”…‰Í½±ÕÑ”¥¹Í•Ð´Àè´À½Ù•É™±½Üµ¡¥‘‘•¸É½Õ¹‘•µm¥¹¡•É¥Ñtm½¹Ñ…¥¸éÁ…¥¹Ñtˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆø(€€€€€€€€€ì…µ½Ù¥¹œ€˜˜€ñ‘¥Ø±…ÍÍ9…µ”ô‰Ý…¥Ñ±¥ÍÐµÁ…Á•ÈµÑ•áÑÕÉ” µ™Õ±°Üµ™Õ±°½Á…¥Ñä´ÐÔµ¥àµ‰±•¹µµÕ±Ñ¥Á±äˆ€¼ùô(€€€€€€€€ð½‘¥Øø(4(€€€€€€€€ñ‰ÕÑÑ½¸4(€€€€€€€€€É•˜õíÁ••­	ÕÑÑ½¹I•™ô4(€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ4(€€€€€€€€€…É¥„µ±…‰•°ô‰=Á•¸Ñ¡”Ý…¥Ñ±¥ÍÐˆ4(€€€€€€€€€±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”±•™Ð´ÀÑ½À´Àè´ÌÀ µmµ¥¸ ÌÐ”°ÄäÁÁà¥tÜµlÈà•tÕÉÍ½ÈµÁ½¥¹Ñ•ÈÉ½Õ¹‘•µÑ°µm¥¹¡•É¥Ñt™½ÕÌµÙ¥Í¥‰±”é½ÕÑ±¥¹”´È™½ÕÌµÙ¥Í¥‰±”é½ÕÑ±¥¹”µ…•¹Ð™½ÕÌµÙ¥Í¥‰±”é½ÕÑ±¥¹”µ½™™Í•Ð´Ðˆ4(€€€€€€€€€½¹±¥¬õí½Á•¹]…¥Ñ±¥ÍÑô4(€€€€€€€€¼ø4(4(€€€€€€€€ñ‘¥Ø4(€€€€€€€€€…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ4(€€€€€€€€€±…ÍÍ9…µ”õíÁ½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”…‰Í½±ÕÑ”±•™Ð´ÀÑ½À´Àè´ÄÀ µmµ¥¸ ÌÐ”°ÄäÁÁà¥tÜµlÈà•tÉ½Õ¹‘•µÑ°µm¥¹¡•É¥Ñt‰œµÁ…Á•È¼ØÔÑÉ…¹Í¥Ñ¥½¸µ½Á…¥Ñä‘ÕÉ…Ñ¥½¸´ÌÀÀ€‘íÁ••­¥¹œ€˜˜€…½Á•¸€ü€‰½Á…¥Ñä´ÄÀÀˆ€è€‰½Á…¥Ñä´À‰õô4(€€€€€€€€¼ø4(4(€€€€€€€€ñ‘¥Ø4(€€€€€€€€€É•˜õí±½­ÕÁI•™ô4(€€€€€€€€€…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ4(€€€€€€€€€±…ÍÍ9…µ”ô‰Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”…‰Í½±ÕÑ”±•™Ð´ÀÑ½À´Àè´ÈÀÝ¥±°µ¡…¹”µÑÉ…¹Í™½É´m‰…­™…”µÙ¥Í¥‰¥±¥Ñäé¡¥‘‘•¹tˆ4(€€€€€€€€ø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à™±•àµ½°¥Ñ•µÌµ•¹Ñ•È…À´Ðˆø4(€€€€€€€€€€€€ñ¥µœÍÉŒõíÁ±…¹•¥ÍÁ±…åUÉ±ô…±Ðôˆˆ±…ÍÍ9…µ”ô‰ µ…ÕÑ¼ÜµlÄÔÁÁát½Á…¥Ñä´ÜÀµ¥¸µlØÀÁÁátéÜµlÄØÑÁátµéÜµlÄàÉÁátˆ€¼ø4(€€€€€€€€€€€€ñ¥µœÍÉŒõíÝ…¥Ñ±¥ÍÑ¥ÍÁ±…åUÉ±ô…±Ðôˆˆ±…ÍÍ9…µ”ô‰ µ…ÕÑ¼ÜµlÄÔÁÁát½Á…¥Ñä´àÀµ¥¸µlØÀÁÁátéÜµlÄØÑÁátµéÜµlÄàÉÁátˆ€¼ø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€ñÍÁ…¸É•˜õí½Á•¹1…‰•±I•™ô±…ÍÍ9…µ”ô‰µÐ´Ä‰±½¬Ñ•áÐµ•¹Ñ•È™½¹Ðµµ½¹¼Ñ•áÐµlÈÁÁátÕÁÁ•É…Í”ÑÉ…­¥¹œµlÀ¸ÄÑ•µtÑ•áÐµlŒÑ„Ñ„Ñ…tÍ´éÑ•áÐµlÈÉÁátˆù=Á•¸ð½ÍÁ…¸ø(€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€ñ‘¥ØÉ•˜õí™½Éµ½¹Ñ•¹ÑI•™ô±…ÍÍ9…µ”ô‰É•±…Ñ¥Ù”èµlÅtÁàµlÈÉÁátÁäµlÐÑÁátÑ•áÐµ•¹Ñ•ÈÝ¥±°µ¡…¹”µm½Á…¥ÑåtµéÁàµlÐáÁátµéÁäµlÔÉÁátˆø4(€€€€€€€€€€ñ‘¥Ø…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ±…ÍÍ9…µ”ô‰ µlÈÈÁÁátˆ€¼ø4(4(€€€€€€€€€íÉ•Í•ÉÙ…Ñ¥½¸€ü€ 4(€€€€€€€€€€€€ñI•Í•ÉÙ…Ñ¥½¹A…¹•°É•Í•ÉÙ…Ñ¥½¸õíÉ•Í•ÉÙ…Ñ¥½¹ôÉ•‘Õ•5½Ñ¥½¸õí	½½±•…¸¡É•‘Õ•5½Ñ¥½¸¥ô€¼ø4(€€€€€€€€€€¤€è€ 4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µàµ…ÕÑ¼µ…àµÜµlÔØÁÁátˆø4(€€€€€€€€€€€€ñ È¥ô‰Ý…¥Ñ±¥ÍÐµÑ¥Ñ±”ˆ±…ÍÍ9…µ”ô‰Í¥Ñ”µ¡•…‘¥¹œ´´ÀÑ•áÐµ¥¹¬´àÀÀˆø4(€€€€€€€€€€€€€•Ð¥¸•…É±ä¸Q…­”„½½ÕÍ•É¹…µ”¸4(€€€€€€€€€€€€ð½ Èø4(€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µàµ…ÕÑ¼µˆµlÌÑÁátµÐµlÄÙÁátµ…àµÜµlÔÈÁÁátÑ•áÐµÁÉ•ÑÑäÑ•áÐµlÄÝÁát±•…‘¥¹œµlÄ¸ÙtÑ•áÐµlŒÍÑÕtˆø4(€€€€€€€€€€€€€…É±ä…•ÍÌ½•Ì½ÕÐ¥¸Ý…Ù•Ì¸Q•±°µ”Ý¡…Ðå½×Še…¹¥µ…Ñ”…¹å½×Še±°‰”¥¸…¸•…É±¥•È½¹”¸4(€€€€€€€€€€€€ð½Àø4(4(€€€€€€€€€€€€ñ™½É´µ•Ñ¡½ô‰A=MPˆ…Ñ¥½¸ôˆ½…Á¤½Ý…¥Ñ±¥ÍÐˆ½¹MÕ‰µ¥ÐõíÍÕ‰µ¥Ñ]…¥Ñ±¥ÍÑô¹½Y…±¥‘…Ñ”±…ÍÍ9…µ”ô‰™±•à™±•àµ½°…ÀµlÈÉÁátÑ•áÐµ±•™Ðˆø4(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É•±…Ñ¥Ù”™±•à™±•àµ½°…À´Èˆø4(€€€€€€€€€€€€€€€€ñ±…‰•°¡Ñµ±½Èô‰±…¼µÕÍ•É¹…µ”ˆ±…ÍÍ9…µ”ô‰ÍÈµ½¹±äˆùUÍ•É¹…µ”ð½±…‰•°ø4(€€€€€€€€€€€€€€€€ñ½½•å%¹ÁÕÐ4(€€€€€€€€€€€€€€€€€¥ô‰±…¼µÕÍ•É¹…µ”ˆ4(€€€€€€€€€€€€€€€€€¹…µ”ô‰ÕÍ•É¹…µ”ˆ4(€€€€€€€€€€€€€€€€€É•ÅÕ¥É•4(€€€€€€€€€€€€€€€€€…ÕÑ½½µÁ±•Ñ”ô‰½™˜ˆ4(€€€€€€€€€€€€€€€€€Á±…•¡½±‘•Èô‰UÍ•É¹…µ”ˆ4(€€€€€€€€€€€€€€€€€Í¡½ÝA±…•¡½±‘•É]¡•¹½±±…ÁÍ•4(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Üµ™Õ±°©ÕÍÑ¥™äµÍÑ…ÉÐˆ4(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ•Ìõíì¥¹ÁÕÐè€‰ÁÈ´ÌÈÑ•áÐµlÄÙÁátÍ´éÑ•áÐµÍ´ˆõô4(€€€€€€€€€€€€€€€€€½±±…ÁÍ•‘]¥‘Ñ ôˆÄÀÀ”ˆ4(€€€€€€€€€€€€€€€€€•áÁ…¹‘•‘]¥‘Ñ ô‰…±Œ ÄÀÀ”€´€ØÑÁà¤ˆ4(€€€€€€€€€€€€€€€€€¥½¹9…µ”ô‰ÕÍ•É¹…µ”ˆ4(€€€€€€€€€€€€€€€€€‘¥Í…‰±•½½•ä4(€€€€€€€€€€€€€€€€€Ù…±Õ”õíÕÍ•É¹…µ•ô4(€€€€€€€€€€€€€€€€€½¹Y…±Õ•¡…¹”õì¡Ù…±Õ”¤€ôøì4(€€€€€€€€€€€€€€€€€€€Í•ÑUÍ•É¹…µ”¡Ù…±Õ”¤ì4(€€€€€€€€€€€€€€€€€€€Í•ÑUÍ•É¹…µ•MÑ…ÑÕÌ ‰¥‘±”ˆ¤ì4(€€€€€€€€€€€€€€€€€€€Í•ÑUÍ•É¹…µ•5•ÍÍ…” ˆˆ¤ì4(€€€€€€€€€€€€€€€€€€€Í•Ñ¡•­•‘UÍ•É¹…µ” ˆˆ¤ì4(€€€€€€€€€€€€€€€€€õô4(€€€€€€€€€€€€€€€€€½¹	±ÕÈõì ¤€ôøÙ½¥¡•­UÍ•É¹…µ” ¥ô4(€€€€€€€€€€€€€€€€€…É¥„µ‘•ÍÉ¥‰•‘‰äõíÕÍ•É¹…µ•5•ÍÍ…”€ü€‰±…¼µÕÍ•É¹…µ”µÍÑ…ÑÕÌˆ€èÕ¹‘•™¥¹•‘ô4(€€€€€€€€€€€€€€€€€…É¥„µ¥¹Ù…±¥õíÕÍ•É¹…µ•MÑ…ÑÕÌ€ôôô€‰Ñ…­•¸ˆñðÕÍ•É¹…µ•MÑ…ÑÕÌ€ôôô€‰¥¹Ù…±¥‰ô4(€€€€€€€€€€€€€€€€€‘¥Í…‰±•õíÍÕ‰µ¥ÑÑ¥¹ô4(€€€€€€€€€€€€€€€€¼ø4(€€€€€€€€€€€€€€€íÕÍ•É¹…µ•5•ÍÍ…”€˜˜€ 4(€€€€€€€€€€€€€€€€€€ñÍÁ…¸4(€€€€€€€€€€€€€€€€€€€¥ô‰±…¼µÕÍ•É¹…µ”µÍÑ…ÑÕÌˆ4(€€€€€€€€€€€€€€€€€€€É½±”ô‰ÍÑ…ÑÕÌˆ4(€€€€€€€€€€€€€€€€€€€…É¥„µ±¥Ù”ô‰Á½±¥Ñ”ˆ4(€€€€€€€€€€€€€€€€€€€Ñ¥Ñ±”õíÕÍ•É¹…µ•5•ÍÍ…•ô4(€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”õíÁ½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”…‰Í½±ÕÑ”É¥¡Ð´ÔÑ½ÀµlÄÝÁátè´ÄÀµ…àµÜµlÐÈ•tÑÉÕ¹…Ñ”É½Õ¹‘•µ™Õ±°Áà´ÈÁä´À¸ÔÑ•áÐµlÄÁÁát™½¹Ðµµ½¹¼ÕÁÁ•É…Í”ÑÉ…­¥¹œµl¸ÀÑ•µt€‘íÕÍ•É¹…µ•MÑ…ÑÕÌ€ôôô€‰…Ù…¥±…‰±”ˆ€ü€‰‰œµl‘•‰‘tÑ•áÐµlŒÐÈÙˆÐÕtˆ€èÕÍ•É¹…µ•MÑ…ÑÕÌ€ôôô€‰¡•­¥¹œˆ€ü€‰‰œµl”Í”Ý•tÑ•áÐµlŒÔàØÐÜÍtˆ€è€‰‰œµl˜Í‘ÝtÑ•áÐµlŒäàÍˆÌÉt‰õô4(€€€€€€€€€€€€€€€€€€ø4(€€€€€€€€€€€€€€€€€€€íÕÍ•É¹…µ•MÑ…ÑÕÍ1…‰•°¡ÕÍ•É¹…µ•MÑ…ÑÕÌ°ÕÍ•É¹…µ•5•ÍÍ…”¥ô4(€€€€€€€€€€€€€€€€€€ð½ÍÁ…¸ø4(€€€€€€€€€€€€€€€€¥ô4(€€€€€€€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à™±•àµ½°…À´Èˆø4(€€€€€€€€€€€€€€€€ñ±…‰•°¡Ñµ±½Èô‰±…¼µ•µ…¥°ˆ±…ÍÍ9…µ”ô‰ÍÈµ½¹±äˆùµ…¥°ð½±…‰•°ø4(€€€€€€€€€€€€€€€€ñ½½•å%¹ÁÕÐ4(€€€€€€€€€€€€€€€€€¥ô‰±…¼µ•µ…¥°ˆ4(€€€€€€€€€€€€€€€€€¹…µ”ô‰•µ…¥°ˆ4(€€€€€€€€€€€€€€€€€ÑåÁ”ô‰•µ…¥°ˆ4(€€€€€€€€€€€€€€€€€É•ÅÕ¥É•4(€€€€€€€€€€€€€€€€€…ÕÑ½½µÁ±•Ñ”ô‰•µ…¥°ˆ4(€€€€€€€€€€€€€€€€€Á±…•¡½±‘•Èô‰µ…¥°ˆ4(€€€€€€€€€€€€€€€€€Í¡½ÝA±…•¡½±‘•É]¡•¹½±±…ÁÍ•4(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Üµ™Õ±°©ÕÍÑ¥™äµÍÑ…ÉÐˆ4(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ•Ìõíì¥¹ÁÕÐè€‰Ñ•áÐµlÄÙÁátÍ´éÑ•áÐµÍ´ˆõô4(€€€€€€€€€€€€€€€€€½±±…ÁÍ•‘]¥‘Ñ ôˆÄÀÀ”ˆ4(€€€€€€€€€€€€€€€€€•áÁ…¹‘•‘]¥‘Ñ ô‰…±Œ ÄÀÀ”€´€ØÑÁà¤ˆ4(€€€€€€€€€€€€€€€€€¥½¹9…µ”ô‰•µ…¥°ˆ4(€€€€€€€€€€€€€€€€€‘¥Í…‰±•½½•ä4(€€€€€€€€€€€€€€€€€Ù…±Õ”õí•µ…¥±ô4(€€€€€€€€€€€€€€€€€½¹Y…±Õ•¡…¹”õì¡Ù…±Õ”¤€ôøì4(€€€€€€€€€€€€€€€€€€€Í•Ñµ…¥°¡Ù…±Õ”¤ì4(€€€€€€€€€€€€€€€€€€€Í•Ñ½Éµ5•ÍÍ…” ˆˆ¤ì4(€€€€€€€€€€€€€€€€€õô4(€€€€€€€€€€€€€€€€€‘¥Í…‰±•õíÍÕ‰µ¥ÑÑ¥¹ô4(€€€€€€€€€€€€€€€€¼ø4(€€€€€€€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à™±•àµ½°…À´Èˆø4(€€€€€€€€€€€€€€€€ñ±…‰•°¡Ñµ±½Èô‰±…¼µ™¥ÉÍÐˆ±…ÍÍ9…µ”ô‰ÍÈµ½¹±äˆù]¡…ÐÝ½Õ±å½Ô…¹¥µ…Ñ”™¥ÉÍÐüð½±…‰•°ø4(€€€€€€€€€€€€€€€€ñ½½•å%¹ÁÕÐ4(€€€€€€€€€€€€€€€€€¥ô‰±…¼µ™¥ÉÍÐˆ4(€€€€€€€€€€€€€€€€€¹…µ”ô‰™¥ÉÍÑ}…¹¥µ…Ñ¥½¸ˆ4(€€€€€€€€€€€€€€€€€Á±…•¡½±‘•Èô‰]¡…ÐÝ½Õ±å½Ô…¹¥µ…Ñ”™¥ÉÍÐüˆ4(€€€€€€€€€€€€€€€€€Í¡½ÝA±…•¡½±‘•É]¡•¹½±±…ÁÍ•4(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Üµ™Õ±°©ÕÍÑ¥™äµÍÑ…ÉÐˆ4(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ•Ìõíì¥¹ÁÕÐè€‰Ñ•áÐµlÄÙÁátÍ´éÑ•áÐµÍ´ˆõô4(€€€€€€€€€€€€€€€€€½±±…ÁÍ•‘]¥‘Ñ ôˆÄÀÀ”ˆ4(€€€€€€€€€€€€€€€€€•áÁ…¹‘•‘]¥‘Ñ ô‰…±Œ ÄÀÀ”€´€ØÑÁà¤ˆ4(€€€€€€€€€€€€€€€€€¥½¹9…µ”ô‰…¹¥µ…Ñ¥½¸ˆ4(€€€€€€€€€€€€€€€€€‘¥Í…‰±•½½•ä4(€€€€€€€€€€€€€€€€€Ù…±Õ”õí‘•ÍÉ¥ÁÑ¥½¹ô4(€€€€€€€€€€€€€€€€€½¹Y…±Õ•¡…¹”õíÍ•Ñ•ÍÉ¥ÁÑ¥½¹ô4(€€€€€€€€€€€€€€€€€µ…á1•¹Ñ õìÈàÁô4(€€€€€€€€€€€€€€€€€‘¥Í…‰±•õíÍÕ‰µ¥ÑÑ¥¹ô4(€€€€€€€€€€€€€€€€¼ø4(€€€€€€€€€€€€€€ð½‘¥Øø4(4(€€€€€€€€€€€€€€ñ¥¹ÁÕÐÑåÁ”ô‰Ñ•áÐˆ¹…µ”ô‰½µÁ…¹äˆÑ…‰%¹‘•àõì´Åô…ÕÑ½½µÁ±•Ñ”ô‰½™˜ˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”±•™Ðµl´äääåÁát µÁàÜµÁà½Á…¥Ñä´Àˆ€¼ø4(4(€€€€€€€€€€€€€€ñÉ…‘¥•¹Ñ!½Ù•É	ÕÑÑ½¸4(€€€€€€€€€€€€€€€ÑåÁ”ô‰ÍÕ‰µ¥Ðˆ4(€€€€€€€€€€€€€€€‘¥Í…‰±•õíÍÕ‰µ¥ÑÑ¥¹œñðÕÍ•É¹…µ•MÑ…ÑÕÌ€ôôô€‰¡•­¥¹œ‰ô4(€€€€€€€€€€€€€€€‰…­É½Õ¹ô‰±¥¹•…ÈµÉ…‘¥•¹Ð¡¥¸½­±…ˆ€ÄàÁ‘•œ°½­±…ˆ À”€À€À¤€À”°½­±…ˆ Ðà¸Ô”€´À¸ÀÄà€´À¸ÀàÈ¤€ÄÀÀ”¤ˆ4(€€€€€€€€€€€€€€€¡½Ù•É	…­É½Õ¹ô‰±¥¹•…ÈµÉ…‘¥•¹Ð¡¥¸½­±…ˆ€ÄàÁ‘•œ°½­±…ˆ ÄÀ”€À€´À¸ÀÄ¤€À”°½­±…ˆ Ôà”€´À¸ÀÌ€´À¸ÄÌ¤€ÄÀÀ”¤ˆ4(€€€€€€€€€€€€€€€‰½É‘•É½±½ÈôˆŒÈäÉÉˆ4(€€€€€€€€€€€€€€€¡½Ù•É	½É‘•É½±½ÈôˆŒÌØÌØÌØˆ4(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰µÐµlÙÁát™±•àÜµ™Õ±°¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È…À´ÌÉ½Õ¹‘•µ™Õ±°À´Ð™½¹Ðµµ½¹¼Ñ•áÐµlÄÍÁátÕÁÁ•É…Í”ÑÉ…­¥¹œµlÀ¸Àá•µtÑ•áÐµÑ•áÐµ¡¤Í¡…‘½ÜµlÁ|ÑÁá|ÄÑÁá|Á}É‰„ À°À°À°À¸Ìä¥tˆ4(€€€€€€€€€€€€€€ø4(€€€€€€€€€€€€€€€€ñ¥µœÍÉŒõíÁ±…¹•Ñ…UÉ±ô…±Ðôˆˆ…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ±…ÍÍ9…µ”ô‰ ´ÔÜµ…ÕÑ¼½‰©•Ðµ½¹Ñ…¥¸ˆ€¼ø4(€€€€€€€€€€€€€€€€ñÍÁ…¸ùíÍÕ‰µ¥ÑÑ¥¹œ€ü€‰!½±‘¥¹œå½ÕÈÕÍ•É¹…µ—Š˜ˆ€è€‰±…¥´µäÍÁ½Ð‰ôð½ÍÁ…¸ø4(€€€€€€€€€€€€€€ð½É…‘¥•¹Ñ!½Ù•É	ÕÑÑ½¸ø4(4(€€€€€€€€€€€€€í™½Éµ5•ÍÍ…”€˜˜€ñÀÉ½±”ô‰…±•ÉÐˆ±…ÍÍ9…µ”ô‰´´ÀÑ•áÐµ•¹Ñ•ÈÑ•áÐµlÄÑÁát±•…‘¥¹œµlÄ¸ÕtÑ•áÐµl„ÌÍˆÌÉtˆùí™½Éµ5•ÍÍ…•ôð½Àùô4(4(€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰´´ÀµÐµlÙÁátÑ•áÐµ•¹Ñ•ÈÑ•áÐµlÄÑÁát±•…‘¥¹œµlÄ¸ÙtÑ•áÐµlŒÔäØÈÜÁtˆø4(€€€€€€€€€€€€€€€9¼ÍÁ…´¸=¹”•µ…¥°Ý¡•¸¥ÓŠeÌÉ•…‘ä°…¹Ñ¡”½…Í¥½¹…°‰Õ¥±ÕÁ‘…Ñ”å½Ô…¸±•…Ù”…¹åÑ¥µ”¸4(€€€€€€€€€€€€€€ð½Àø4(€€€€€€€€€€€€ð½™½É´ø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€¥ô4(€€€€€€€€ð½‘¥Øø4(€€€€€€ð½‘¥Øø4(4(€€€€€í½Á•¸€˜˜€ 4(€€€€€€€€ñ‰ÕÑÑ½¸4(€€€€€€€€€É•˜õí±½Í•	ÕÑÑ½¹I•™ô4(€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ4(€€€€€€€€€…É¥„µ±…‰•°ô‰±½Í”Ý…¥Ñ±¥ÍÐˆ4(€€€€€€€€€½¹A½¥¹Ñ•É½Ý¸õí±½Í•]…¥Ñ±¥ÍÑô4(€€€€€€€€€½¹±¥¬õí±½Í•]…¥Ñ±¥ÍÑô4(€€€€€€€€€±…ÍÍ9…µ”ô‰É½ÕÀ™¥á•É¥¡Ðµmµ…à ÄÉÁà±•¹Ø¡Í…™”µ…É•„µ¥¹Í•ÐµÉ¥¡Ð¤¥tÑ½Àµmµ…à ÄÉÁà±•¹Ø¡Í…™”µ…É•„µ¥¹Í•ÐµÑ½À¤¥tèµlÄÌÁtÉ¥Í¥é”´ÄÈÑ½Õ µµ…¹¥ÁÕ±…Ñ¥½¸Á±…”µ¥Ñ•µÌµ•¹Ñ•ÈÉ½Õ¹‘•µ™Õ±°‰œµl˜Ñ˜Å•‰tÑ•áÐµlŒÍŒÍŒÍtÍ¡…‘½Üµá°ÑÉ…¹Í¥Ñ¥½¸µ½±½ÉÌ‘ÕÉ…Ñ¥½¸´ÄÔÀ¡½Ù•Èé‰œµl‘•å™t™½ÕÌµÙ¥Í¥‰±”é‰œµl‘•å™t™½ÕÌµÙ¥Í¥‰±”é½ÕÑ±¥¹”´È™½ÕÌµÙ¥Í¥‰±”é½ÕÑ±¥¹”µ…•¹Ð™½ÕÌµÙ¥Í¥‰±”é½ÕÑ±¥¹”µ½™™Í•Ð´Ìˆ4(€€€€€€€€ø4(€€€€€€€€€€ñÍÁ…¸…É¥„µ¡¥‘‘•¸ô‰ÑÉÕ”ˆ±…ÍÍ9…µ”ô‰É•±…Ñ¥Ù”‰±½¬Í¥é”´Ô‰•™½É”é…‰Í½±ÕÑ”‰•™½É”é±•™Ð´Ä¼È‰•™½É”éÑ½À´Ä¼È‰•™½É”é µlÉÁát‰•™½É”éÜ´Ô‰•™½É”èµÑÉ…¹Í±…Ñ”µà´Ä¼È‰•™½É”èµÑÉ…¹Í±…Ñ”µä´Ä¼È‰•™½É”éÉ½Ñ…Ñ”´ÐÔ‰•™½É”é‰œµÕÉÉ•¹Ð…™Ñ•Èé…‰Í½±ÕÑ”…™Ñ•Èé±•™Ð´Ä¼È…™Ñ•ÈéÑ½À´Ä¼È…™Ñ•Èé µlÉÁát…™Ñ•ÈéÜ´Ô…™Ñ•ÈèµÑÉ…¹Í±…Ñ”µà´Ä¼È…™Ñ•ÈèµÑÉ…¹Í±…Ñ”µä´Ä¼È…™Ñ•ÈèµÉ½Ñ…Ñ”´ÐÔ…™Ñ•Èé‰œµÕÉÉ•¹Ðˆ€¼ø4(€€€€€€€€ð½‰ÕÑÑ½¸ø4(€€€€€€¥ô4(€€€€€€ð¼ø°‘½Õµ•¹Ð¹‰½‘ä¥ô4(€€€€ð¼ø4(€€¤ì4)ô4