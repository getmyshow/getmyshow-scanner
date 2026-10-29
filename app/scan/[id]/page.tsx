"use client";

import React, { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  WarningCircle,
  SpeakerHigh,
  SpeakerSlash,
  Flashlight,
  ArrowsClockwise,
  Keyboard,
  SignOut,
  Spinner,
  Ticket,
  UsersThree,
  IdentificationBadge,
  LockKey,
} from "@phosphor-icons/react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/lib/supabase";
import { gateAudio } from "@/lib/audio";

interface ScanResultData {
  status: "VALID" | "ALREADY_SCANNED" | "INVALID";
  attendee_name?: string;
  quantity?: number;
  ticket_number?: string;
  scanned_at?: string;
  message?: string;
}

interface EventData {
  id: string;
  slug: string;
  title: string;
  venue: string;
  city: string;
  scanner_pin?: string;
}

export default function ScannerTerminalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = use(params);
  const router = useRouter();

  const [event, setEvent] = useState<EventData | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [staffId, setStaffId] = useState("STAFF-G1");
  const [authPin, setAuthPin] = useState("");
  const [authError, setAuthError] = useState("");
  const [isInitializing, setIsInitializing] = useState(true);

  // Scanner state
  const [scanResult, setScanResult] = useState<ScanResultData | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [scannedTally, setScannedTally] = useState(0);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualTicketInput, setManualTicketInput] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isProcessingRef = useRef(false);

  // 1. Check PIN Authorization & Event Info
  useEffect(() => {
    async function checkAuth() {
      try {
        const { data, error } = await supabase
          .from("events")
          .select("id, slug, title, venue, city, scanner_pin")
          .eq("id", eventId)
          .single();

        if (error || !data) {
          router.push("/login");
          return;
        }

        setEvent(data);

        // Retrieve stored staff ID
        const storedStaff = sessionStorage.getItem("scanner_staff_id");
        if (storedStaff) setStaffId(storedStaff);

        // Check session authorization
        const savedPin = sessionStorage.getItem(`scanner_auth_${eventId}`);
        if (savedPin && (!data.scanner_pin || savedPin === data.scanner_pin)) {
          setIsAuthorized(true);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
      } finally {
        setIsInitializing(false);
      }
    }
    checkAuth();
  }, [eventId, router]);

  // Load check-in count
  useEffect(() => {
    if (isAuthorized) {
      supabase
        .from("tickets")
        .select("id", { count: "exact" })
        .eq("event_id", eventId)
        .eq("scanned", true)
        .then(({ count }) => {
          if (count !== null) setScannedTally(count);
        });
    }
  }, [isAuthorized, eventId]);

  // 2. Start Camera Scanner
  useEffect(() => {
    if (!isAuthorized) return;

    let html5QrCode: Html5Qrcode;

    async function startScanner() {
      try {
        html5QrCode = new Html5Qrcode("qr-reader");
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 20,
            qrbox: { width: 280, height: 280 },
            aspectRatio: 1.0,
          },
          onScanSuccess,
          () => {} // Ignore scan failure frames
        );
        setIsScanning(true);
      } catch (err) {
        console.error("Failed to start camera:", err);
        setIsScanning(false);
      }
    }

    startScanner();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).finally(() => {
          scannerRef.current = null;
        });
      }
    };
  }, [isAuthorized]);

  // 3. Process Scanned QR Token
  const onScanSuccess = async (decodedText: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const pin = sessionStorage.getItem(`scanner_auth_${eventId}`) || "";
      const currentStaff = sessionStorage.getItem("scanner_staff_id") || staffId;

      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_token: decodedText,
          event_id: eventId,
          pin,
          staff_name: currentStaff,
        }),
      });

      const data: ScanResultData = await res.json();
      setScanResult(data);

      if (data.status === "VALID") {
        if (soundEnabled) gateAudio.playValidBeep();
        setScannedTally((prev) => prev + (data.quantity || 1));
      } else {
        if (soundEnabled) gateAudio.playInvalidBuzz();
      }

      // Auto dismiss flash after 3.2 seconds
      setTimeout(() => {
        setScanResult(null);
        isProcessingRef.current = false;
      }, 3200);
    } catch (err) {
      console.error("Verification failed:", err);
      setScanResult({
        status: "INVALID",
        message: "Network Error: Could not connect to verification server.",
      });
      if (soundEnabled) gateAudio.playInvalidBuzz();
      setTimeout(() => {
        setScanResult(null);
        isProcessingRef.current = false;
      }, 3000);
    }
  };

  // Toggle Hardware Torch (Flashlight)
  const toggleTorch = async () => {
    try {
      if (scannerRef.current) {
        const track = (scannerRef.current as unknown as { getRunningTrackCapabilities?: () => { torch?: boolean } }).getRunningTrackCapabilities?.();
        if (track && track.torch) {
          await (scannerRef.current as unknown as { applyVideoConstraints: (c: Record<string, unknown>) => Promise<void> }).applyVideoConstraints({
            advanced: [{ torch: !isTorchOn }],
          });
          setIsTorchOn(!isTorchOn);
        }
      }
    } catch (err) {
      console.warn("Torch not supported on this device/browser:", err);
    }
  };

  // Manual PIN submission if not authorized
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (event?.scanner_pin && authPin !== event.scanner_pin) {
      setAuthError("Incorrect PIN");
      return;
    }
    sessionStorage.setItem(`scanner_auth_${eventId}`, authPin);
    setIsAuthorized(true);
  };

  // Manual Ticket ID check-in fallback
  const handleManualCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTicketInput.trim()) return;

    setManualSubmitting(true);
    await onScanSuccess(manualTicketInput.trim().toUpperCase());
    setManualSubmitting(false);
    setShowManualModal(false);
    setManualTicketInput("");
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#07090E] flex flex-col items-center justify-center text-white space-y-3 font-mono">
        <Spinner size={32} className="animate-spin text-emerald-400" />
        <span className="text-xs uppercase tracking-widest text-slate-400">
          Mounting Scanner Terminal...
        </span>
      </div>
    );
  }

  // If not authorized yet, show tactical PIN unlock screen
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#07090E] flex flex-col justify-center items-center p-6 max-w-sm mx-auto w-full text-center space-y-6 select-none">
        <div className="w-16 h-16 rounded-3xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-xl shadow-indigo-600/20">
          <LockKey size={32} weight="duotone" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-black text-white tracking-tight">Security PIN Required</h2>
          <p className="text-xs text-slate-400 line-clamp-1">{event?.title}</p>
        </div>

        {authError && (
          <div className="w-full p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold flex items-center justify-center gap-1.5 animate-shake">
            <WarningCircle size={16} weight="bold" />
            <span>{authError}</span>
          </div>
        )}

        <form onSubmit={handlePinSubmit} className="w-full space-y-4">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={authPin}
            onChange={(e) => setAuthPin(e.target.value)}
            placeholder="Enter 4-Digit PIN"
            className="w-full h-14 rounded-2xl bg-black/60 border border-white/20 text-center text-3xl font-mono font-black text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
            autoFocus
          />
          <button
            type="submit"
            className="w-full h-13 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 font-bold text-sm text-white shadow-lg shadow-indigo-600/30 transition-transform active:scale-98"
          >
            Unlock Gate Scanner
          </button>
        </form>

        <Link href="/login" className="text-xs text-slate-500 hover:text-slate-300 font-mono">
          ← Return to Gate Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] bg-black flex flex-col justify-between overflow-hidden select-none">
      {/* 1. TOP TACTICAL HUD (ui.unlumen.com + ui.watermelon.sh) */}
      <header className="relative z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/95 via-black/80 to-transparent border-b border-white/5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xs font-black text-white truncate max-w-[170px] sm:max-w-xs uppercase tracking-tight">
              {event?.title || "Gate Terminal"}
            </h1>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
              <span className="text-emerald-400 font-bold">{staffId}</span>
              <span>•</span>
              <span className="truncate">{event?.city || "Sasaram"}</span>
            </div>
          </div>
        </div>

        {/* Sensory Hardware Toggles (ui.watermelon.sh) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Torch Switch */}
          <button
            type="button"
            onClick={toggleTorch}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all active:scale-90 ${
              isTorchOn
                ? "bg-amber-400 text-black shadow-lg shadow-amber-400/40 ring-2 ring-amber-300"
                : "bg-white/10 hover:bg-white/15 text-slate-300 backdrop-blur-md border border-white/10"
            }`}
            aria-label="Toggle Flashlight Torch"
          >
            <Flashlight size={19} weight={isTorchOn ? "fill" : "regular"} />
          </button>

          {/* Sound Switch */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all active:scale-90 ${
              soundEnabled
                ? "bg-white/10 hover:bg-white/15 text-emerald-400 backdrop-blur-md border border-white/10"
                : "bg-red-500/20 text-red-400 border border-red-500/30"
            }`}
            aria-label="Toggle Audio Sound"
          >
            {soundEnabled ? (
              <SpeakerHigh size={19} weight="bold" />
            ) : (
              <SpeakerSlash size={19} weight="bold" />
            )}
          </button>

          {/* Exit Terminal */}
          <Link
            href="/login"
            className="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/15 text-slate-400 hover:text-white backdrop-blur-md border border-white/10 flex items-center justify-center transition-all active:scale-90"
            aria-label="Exit Terminal"
          >
            <SignOut size={19} />
          </Link>
        </div>
      </header>

      {/* 2. CAMERA RETICLE & LASER BEAM (raylight.app + ui.unlumen.com) */}
      <main className="relative flex-1 flex flex-col items-center justify-center">
        {/* html5-qrcode video element */}
        <div id="qr-reader" className="w-full h-full max-h-[65vh] flex items-center justify-center overflow-hidden" />

        {/* Viewfinder Target Frame with Laser Beam */}
        <div className="absolute pointer-events-none w-72 h-72 rounded-3xl flex items-center justify-center">
          {/* Subtle Outer Dim Box */}
          <div className="absolute inset-0 rounded-3xl border border-white/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />

          {/* 4 Glowing Corner Accents (ui.unlumen.com) */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-emerald-400 rounded-tl-2xl shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-emerald-400 rounded-tr-2xl shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-emerald-400 rounded-bl-2xl shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-emerald-400 rounded-br-2xl shadow-[0_0_12px_rgba(16,185,129,0.5)]" />

          {/* Oscillating Cyberpunk Laser Scanning Beam (raylight.app) */}
          <div className="laser-beam" />

          {/* Center Target Crosshair */}
          <div className="text-emerald-400/40 text-xl font-mono select-none pointer-events-none">+</div>

          {/* Top/Bottom Micro Labels */}
          <div className="absolute -top-7 text-[10px] font-mono tracking-widest text-emerald-400/80 bg-black/60 backdrop-blur-sm px-2.5 py-0.5 rounded-full border border-emerald-500/30 uppercase">
            Point at QR Code
          </div>
        </div>
      </main>

      {/* 3. SHIFT STATS BENTO & CONTROLS (uiarc.dev) */}
      <footer className="relative z-30 p-4 bg-gradient-to-t from-black via-black/90 to-transparent space-y-3">
        {/* 3-Column Micro-Bento */}
        <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
          {/* Card 1: Checked In Count */}
          <div className="bg-[#0C1019]/90 backdrop-blur-md border border-white/10 rounded-2xl p-2.5 text-center">
            <span className="text-[9px] uppercase font-mono tracking-wider text-slate-400 block">
              Checked In
            </span>
            <span className="text-lg font-black font-mono text-emerald-400 leading-tight">
              {scannedTally}
            </span>
          </div>

          {/* Card 2: Staff Duty Badge */}
          <div className="bg-[#0C1019]/90 backdrop-blur-md border border-white/10 rounded-2xl p-2.5 text-center">
            <span className="text-[9px] uppercase font-mono tracking-wider text-slate-400 block">
              Gate Staff
            </span>
            <span className="text-xs font-bold font-mono text-white leading-tight truncate block mt-0.5">
              {staffId}
            </span>
          </div>

          {/* Card 3: Camera Status */}
          <div className="bg-[#0C1019]/90 backdrop-blur-md border border-white/10 rounded-2xl p-2.5 text-center">
            <span className="text-[9px] uppercase font-mono tracking-wider text-slate-400 block">
              Sensor
            </span>
            <span className="text-xs font-bold font-mono text-indigo-400 leading-tight block mt-0.5">
              20 FPS • AUTO
            </span>
          </div>
        </div>

        {/* Manual Keyboard Fallback Button */}
        <div className="max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setShowManualModal(true)}
            className="w-full h-11 rounded-2xl bg-white/10 hover:bg-white/15 backdrop-blur-md text-white text-xs font-bold font-mono flex items-center justify-center gap-2 border border-white/10 transition active:scale-98"
          >
            <Keyboard size={18} weight="bold" />
            <span>Manual Ticket ID Entry</span>
          </button>
        </div>
      </footer>

      {/* 4. FULL-SCREEN SCAN VERDICT FLASHES (affectui.com) */}
      {scanResult && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-150 select-none ${
            scanResult.status === "VALID"
              ? "bg-[#10B981] text-white"
              : scanResult.status === "ALREADY_SCANNED"
              ? "bg-[#EF4444] text-white animate-shake"
              : "bg-[#DC2626] text-white animate-shake"
          }`}
          onClick={() => setScanResult(null)}
        >
          {scanResult.status === "VALID" ? (
            <div className="space-y-4 max-w-sm">
              <CheckCircle size={96} weight="fill" className="mx-auto drop-shadow-xl animate-bounce" />
              <div className="space-y-1.5">
                <span className="text-xs uppercase font-mono font-black tracking-widest bg-white/20 px-3.5 py-1 rounded-full inline-block">
                  ✓ PASS VALIDATED
                </span>
                <h2 className="text-3xl font-black tracking-tight">
                  {scanResult.attendee_name || "Verified Guest"}
                </h2>
                <div className="text-xl font-extrabold bg-black/15 py-1 px-4 rounded-xl inline-block mt-1">
                  Admit {scanResult.quantity || 1} Person{(scanResult.quantity || 1) > 1 ? "s" : ""}
                </div>
              </div>
              <div className="text-xs font-mono opacity-80 pt-2 bg-black/20 p-2 rounded-xl">
                PASS: {scanResult.ticket_number}
              </div>
            </div>
          ) : scanResult.status === "ALREADY_SCANNED" ? (
            <div className="space-y-4 max-w-sm">
              <XCircle size={96} weight="fill" className="mx-auto drop-shadow-xl" />
              <div className="space-y-1.5">
                <span className="text-xs uppercase font-mono font-black tracking-widest bg-black/35 px-3.5 py-1 rounded-full inline-block">
                  ⚠️ ALREADY USED AT GATE!
                </span>
                <h2 className="text-3xl font-black tracking-tight">Duplicate Pass</h2>
                <p className="text-sm font-bold opacity-95 text-red-100">
                  This pass was already scanned. DO NOT permit entry.
                </p>
              </div>
              <div className="text-xs font-mono bg-black/30 p-3 rounded-2xl space-y-1 text-left">
                <div>Attendee: <span className="font-bold">{scanResult.attendee_name}</span></div>
                <div>First Scanned: <span className="font-bold">{new Date(scanResult.scanned_at || "").toLocaleTimeString()}</span></div>
                <div>Ticket: <span className="font-bold">{scanResult.ticket_number}</span></div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-sm">
              <WarningCircle size={96} weight="fill" className="mx-auto drop-shadow-xl" />
              <div className="space-y-1.5">
                <span className="text-xs uppercase font-mono font-black tracking-widest bg-black/35 px-3.5 py-1 rounded-full inline-block">
                  ⛔ INVALID PASS
                </span>
                <h2 className="text-3xl font-black tracking-tight">Entry Denied</h2>
                <p className="text-sm font-semibold opacity-95 text-red-100">
                  {scanResult.message || "Pass not recognized for this event."}
                </p>
              </div>
            </div>
          )}

          <div className="absolute bottom-8 text-[11px] font-mono opacity-80 font-bold bg-black/25 px-3 py-1 rounded-full">
            Tap screen to dismiss
          </div>
        </div>
      )}

      {/* 5. MANUAL ENTRY SLIDE-UP SHEET */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#0C1019] border border-white/15 rounded-t-3xl sm:rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Ticket size={20} className="text-emerald-400" />
                <span>Manual Ticket ID Check-In</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold font-mono px-2 py-1 rounded-lg hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              For cracked or low-brightness screens: Enter the 10-character Pass ID printed on the attendee&apos;s ticket.
            </p>

            <form onSubmit={handleManualCheckIn} className="space-y-3">
              <input
                type="text"
                placeholder="e.g. GMS-ROH-9482"
                value={manualTicketInput}
                onChange={(e) => setManualTicketInput(e.target.value.toUpperCase())}
                className="w-full h-13 rounded-2xl bg-black/50 border border-white/20 px-4 font-mono font-bold text-center text-base text-white placeholder:text-slate-600 outline-none focus:border-emerald-400"
                autoFocus
              />

              <button
                type="submit"
                disabled={manualSubmitting || !manualTicketInput.trim()}
                className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold font-mono flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/30 disabled:opacity-50 transition active:scale-98"
              >
                {manualSubmitting ? (
                  <Spinner size={18} className="animate-spin" />
                ) : (
                  <span>Verify Ticket ID</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
