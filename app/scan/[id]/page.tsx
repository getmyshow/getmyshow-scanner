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

  // 1. Check PIN Authorization
  useEffect(() => {
    async function checkAuth() {
      try {
        const { data, error } = await supabase
          .from("events")
          .select("id, title, venue, city, scanner_pin")
          .eq("id", eventId)
          .single();

        if (error || !data) {
          router.push("/login");
          return;
        }

        setEvent(data);

        // Check session storage
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
            fps: 15,
            qrbox: { width: 260, height: 260 },
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
      const staffName = sessionStorage.getItem("scanner_staff_name") || "Gate Staff";

      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qr_token: decodedText,
          event_id: eventId,
          pin,
          staff_name: staffName,
        }),
      });

      const data: ScanResultData = await res.json();
      setScanResult(data);

      if (data.status === "VALID") {
        if (soundEnabled) gateAudio.playValidBeep();
        setScannedTally((prev) => prev + 1);
      } else {
        if (soundEnabled) gateAudio.playInvalidBuzz();
      }

      // Auto dismiss flash after 3 seconds
      setTimeout(() => {
        setScanResult(null);
        isProcessingRef.current = false;
      }, 3000);
    } catch (err) {
      console.error("Verification failed:", err);
      setScanResult({
        status: "INVALID",
        message: "Network Error: Could not reach verification API",
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
      <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center text-white text-xs">
        <Spinner size={24} className="animate-spin mr-2 text-indigo-400" />
        Initializing Scanner...
      </div>
    );
  }

  // If not authorized yet, show PIN lock
  if (!isAuthorized) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center p-6 max-w-sm mx-auto w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-xl">
          <ShieldCheck size={36} weight="duotone" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white">Security PIN Required</h2>
          <p className="text-xs text-slate-400">{event?.title}</p>
        </div>
        {authError && (
          <div className="text-xs text-red-400 font-bold">{authError}</div>
        )}
        <form onSubmit={handlePinSubmit} className="w-full space-y-3">
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={authPin}
            onChange={(e) => setAuthPin(e.target.value)}
            placeholder="Enter PIN"
            className="w-full h-12 rounded-xl bg-white/5 border border-white/20 text-center text-2xl font-mono text-white outline-none focus:border-indigo-500"
            autoFocus
          />
          <button
            type="submit"
            className="w-full h-12 rounded-xl bg-indigo-600 font-bold text-sm text-white"
          >
            Unlock Gate Scanner
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col justify-between bg-black overflow-hidden select-none">
      {/* 1. TOP BAR HUD */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/90 to-transparent">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <div className="min-w-0">
            <h1 className="text-xs font-bold text-white truncate max-w-[180px] sm:max-w-xs">
              {event?.title || "Gate Scanner"}
            </h1>
            <span className="text-[10px] text-slate-400 block font-mono">
              Gate Staff Active • {event?.city}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white"
            aria-label="Toggle Audio"
          >
            {soundEnabled ? <SpeakerHigh size={18} /> : <SpeakerSlash size={18} className="text-red-400" />}
          </button>

          {/* Torch Toggle */}
          <button
            type="button"
            onClick={toggleTorch}
            className={`w-9 h-9 rounded-full flex items-center justify-center text-white ${
              isTorchOn ? "bg-amber-400 text-black" : "bg-white/10 backdrop-blur-md"
            }`}
            aria-label="Toggle Torch"
          >
            <Flashlight size={18} weight={isTorchOn ? "fill" : "regular"} />
          </button>

          {/* Exit */}
          <Link
            href="/login"
            className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-slate-300 hover:text-white"
            aria-label="Exit Scanner"
          >
            <SignOut size={18} />
          </Link>
        </div>
      </header>

      {/* 2. CAMERA VIEWER RETICLE */}
      <div className="flex-1 flex flex-col items-center justify-center relative">
        {/* html5-qrcode camera mounting target */}
        <div id="qr-reader" className="w-full h-full max-h-[75vh]" />

        {/* Framing Overlay Box */}
        <div className="absolute pointer-events-none w-64 h-64 border-2 border-dashed border-indigo-400/60 rounded-3xl flex items-center justify-center">
          <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-indigo-500 rounded-tl-xl" />
          <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-indigo-500 rounded-tr-xl" />
          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-indigo-500 rounded-bl-xl" />
          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-indigo-500 rounded-br-xl" />
          <span className="text-[11px] font-bold text-white/70 bg-black/40 backdrop-blur-xs px-2.5 py-1 rounded-full">
            Point at QR Pass
          </span>
        </div>
      </div>

      {/* 3. FULL-SCREEN FLASH FEEDBACK OVERLAYS */}
      {scanResult && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-150 ${
            scanResult.status === "VALID"
              ? "bg-[#10B981] text-white"
              : scanResult.status === "ALREADY_SCANNED"
              ? "bg-[#EF4444] text-white"
              : "bg-[#DC2626] text-white"
          }`}
          onClick={() => setScanResult(null)}
        >
          {scanResult.status === "VALID" ? (
            <div className="space-y-4 max-w-sm">
              <CheckCircle size={88} weight="fill" className="mx-auto drop-shadow-md animate-bounce" />
              <div className="space-y-1">
                <span className="text-xs uppercase font-black tracking-widest bg-white/20 px-3 py-1 rounded-full">
                  PASS VALIDATED
                </span>
                <h2 className="text-3xl font-black">{scanResult.attendee_name || "Guest Pass"}</h2>
                <p className="text-lg font-bold opacity-90">
                  Admit {scanResult.quantity || 1} Person{(scanResult.quantity || 1) > 1 ? "s" : ""}
                </p>
              </div>
              <div className="text-xs font-mono opacity-80 pt-2">
                ID: {scanResult.ticket_number}
              </div>
            </div>
          ) : scanResult.status === "ALREADY_SCANNED" ? (
            <div className="space-y-4 max-w-sm">
              <XCircle size={88} weight="fill" className="mx-auto drop-shadow-md" />
              <div className="space-y-1">
                <span className="text-xs uppercase font-black tracking-widest bg-black/30 px-3 py-1 rounded-full">
                  ALREADY SCANNED!
                </span>
                <h2 className="text-2xl font-black">Duplicate Pass</h2>
                <p className="text-sm opacity-90">
                  This pass was already used at gate. Do NOT permit entry.
                </p>
              </div>
              <div className="text-xs font-mono bg-black/20 p-2.5 rounded-xl space-y-1">
                <div>Attendee: {scanResult.attendee_name}</div>
                <div>First Scanned: {new Date(scanResult.scanned_at || "").toLocaleTimeString()}</div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-sm">
              <WarningCircle size={88} weight="fill" className="mx-auto drop-shadow-md" />
              <div className="space-y-1">
                <span className="text-xs uppercase font-black tracking-widest bg-black/30 px-3 py-1 rounded-full">
                  INVALID PASS
                </span>
                <h2 className="text-2xl font-black">Entry Denied</h2>
                <p className="text-sm opacity-90">{scanResult.message || "Pass not recognized for this event."}</p>
              </div>
            </div>
          )}

          <div className="absolute bottom-10 text-[11px] opacity-75 font-semibold">
            Tap anywhere to dismiss
          </div>
        </div>
      )}

      {/* 4. BOTTOM ACTION HUD */}
      <footer className="z-30 p-4 bg-gradient-to-t from-black/95 to-transparent flex items-center justify-between gap-3">
        {/* Tally Badge */}
        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-xl text-white">
          <UsersThree size={18} className="text-[#10B981]" weight="bold" />
          <div className="text-left">
            <span className="text-[10px] text-slate-400 block leading-none">Checked In</span>
            <span className="text-sm font-black font-mono leading-none">{scannedTally}</span>
          </div>
        </div>

        {/* Manual Code Entry Button */}
        <button
          type="button"
          onClick={() => setShowManualModal(true)}
          className="flex-1 h-11 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur-md text-white text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
        >
          <Keyboard size={16} weight="bold" />
          <span>Manual Entry</span>
        </button>
      </footer>

      {/* 5. MANUAL ENTRY MODAL */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111622] border border-white/15 rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Ticket size={18} className="text-[#4F46E5]" />
                <span>Manual Pass Number</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-slate-400">
              For cracked or wet phone screens: Enter the 10-character Pass ID printed on the attendee&apos;s ticket.
            </p>

            <form onSubmit={handleManualCheckIn} className="space-y-3">
              <input
                type="text"
                placeholder="e.g. GMS-ROH-9482"
                value={manualTicketInput}
                onChange={(e) => setManualTicketInput(e.target.value)}
                className="w-full h-12 rounded-xl bg-white/5 border border-white/20 px-3.5 font-mono text-center text-sm font-bold text-white outline-none focus:border-[#4F46E5]"
                autoFocus
              />

              <button
                type="submit"
                disabled={manualSubmitting || !manualTicketInput.trim()}
                className="w-full h-11 rounded-xl bg-[#4F46E5] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {manualSubmitting ? (
                  <Spinner size={16} className="animate-spin" />
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
