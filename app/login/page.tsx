"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ShieldCheck,
  LockKey,
  IdentificationBadge,
  QrCode,
  ArrowRight,
  WarningCircle,
  Spinner,
  CaretRight,
  Info,
} from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";

interface EventMatch {
  id: string;
  slug: string;
  title: string;
  venue: string;
  city: string;
  scanner_pin?: string;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL parameters for 1-Click WhatsApp Dispatch links:
  // e.g. /login?event=rohtas-dandiya-mahotsav-2026&staff=BOUNCER-01&pin=9988
  const urlEvent = searchParams.get("event") || searchParams.get("id") || "";
  const urlStaff = searchParams.get("staff") || searchParams.get("staff_id") || "";
  const urlPin = searchParams.get("pin") || "";

  // Form states
  const [eventQuery, setEventQuery] = useState(urlEvent);
  const [staffId, setStaffId] = useState(urlStaff);
  const [pinDigits, setPinDigits] = useState<string[]>(
    urlPin && urlPin.length === 4 ? urlPin.split("") : ["", "", "", ""]
  );

  const [activeEvents, setActiveEvents] = useState<EventMatch[]>([]);
  const [showEventDropdown, setShowEventDropdown] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoLoggingIn, setAutoLoggingIn] = useState(false);

  // References for the 4 PIN inputs (fancycomponents.dev segmented pattern)
  const pinInputRefs = [
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
    useRef<HTMLInputElement | null>(null),
  ];

  // Fetch active events list for quick selection / fallback
  useEffect(() => {
    async function fetchEvents() {
      try {
        const { data, error: fetchErr } = await supabase
          .from("events")
          .select("id, slug, title, venue, city, scanner_pin")
          .order("event_date", { ascending: true });

        if (!fetchErr && data) {
          setActiveEvents(data);
        }
      } catch (err) {
        console.error("Error loading events:", err);
      }
    }
    fetchEvents();
  }, []);

  // Handle segmented PIN input change
  const handlePinChange = (index: number, val: string) => {
    // Only allow single digit
    const digit = val.replace(/\D/g, "").slice(-1);
    const newDigits = [...pinDigits];
    newDigits[index] = digit;
    setPinDigits(newDigits);

    // Jump to next box if digit entered
    if (digit && index < 3) {
      pinInputRefs[index + 1].current?.focus();
    }
  };

  // Handle backspace navigation between PIN boxes
  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
      pinInputRefs[index - 1].current?.focus();
    }
  };

  // Handle pasting 4-digit PIN
  const handlePinPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (pasted.length > 0) {
      const newDigits = ["", "", "", ""];
      for (let i = 0; i < pasted.length; i++) {
        newDigits[i] = pasted[i];
      }
      setPinDigits(newDigits);
      const nextFocus = Math.min(pasted.length, 3);
      pinInputRefs[nextFocus].current?.focus();
    }
  };

  // 1-Click WhatsApp Dispatch auto-login
  useEffect(() => {
    async function attemptAutoLogin() {
      if (urlEvent && urlStaff && urlPin && urlPin.length === 4 && activeEvents.length > 0 && !autoLoggingIn) {
        setAutoLoggingIn(true);
        const match = activeEvents.find(
          (e) =>
            e.id.toLowerCase() === urlEvent.toLowerCase() ||
            e.slug.toLowerCase() === urlEvent.toLowerCase()
        );

        if (match && match.scanner_pin === urlPin) {
          sessionStorage.setItem(`scanner_auth_${match.id}`, urlPin);
          sessionStorage.setItem("scanner_staff_id", urlStaff.toUpperCase());
          sessionStorage.setItem("scanner_event_title", match.title);
          router.push(`/scan/${match.id}`);
        } else {
          setAutoLoggingIn(false);
        }
      }
    }
    attemptAutoLogin();
  }, [urlEvent, urlStaff, urlPin, activeEvents, router, autoLoggingIn]);

  // Form submission validation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const cleanEventQuery = eventQuery.trim();
    const cleanStaff = staffId.trim().toUpperCase();
    const fullPin = pinDigits.join("");

    if (!cleanEventQuery) {
      setError("Please enter the Event Code or Slug.");
      return;
    }

    if (!cleanStaff) {
      setError("Please enter your Official Gate Staff ID (e.g. STAFF-G1).");
      return;
    }

    if (fullPin.length !== 4) {
      setError("Please enter the complete 4-digit Security PIN.");
      pinInputRefs[0].current?.focus();
      return;
    }

    setIsSubmitting(true);

    try {
      // Find event in database by ID or Slug
      let matchedEvent = activeEvents.find(
        (ev) =>
          ev.id.toLowerCase() === cleanEventQuery.toLowerCase() ||
          ev.slug.toLowerCase() === cleanEventQuery.toLowerCase()
      );

      // If not in local pre-fetched list, query Supabase directly
      if (!matchedEvent) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanEventQuery);
        const query = supabase
          .from("events")
          .select("id, slug, title, venue, city, scanner_pin");

        const { data: directData } = isUUID
          ? await query.eq("id", cleanEventQuery).maybeSingle()
          : await query.eq("slug", cleanEventQuery).maybeSingle();

        if (directData) {
          matchedEvent = directData;
        }
      }

      if (!matchedEvent) {
        setError("Event not found. Verify the Event Code or Slug with your organizer.");
        setIsSubmitting(false);
        return;
      }

      // Check PIN match
      if (matchedEvent.scanner_pin && matchedEvent.scanner_pin !== fullPin) {
        setError("Invalid 4-digit Security PIN for this event.");
        setIsSubmitting(false);
        return;
      }

      // Persist authorization in session storage
      sessionStorage.setItem(`scanner_auth_${matchedEvent.id}`, fullPin);
      sessionStorage.setItem("scanner_staff_id", cleanStaff);
      sessionStorage.setItem("scanner_event_title", matchedEvent.title);

      router.push(`/scan/${matchedEvent.id}`);
    } catch (err) {
      console.error("Login verification failed:", err);
      setError("Connection error. Please check your internet connection.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#07090E] flex flex-col justify-between p-4 sm:p-6 overflow-hidden select-none">
      {/* Background Cyberpunk Ambient Glow (lightswind.com) */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-64 h-64 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Header HUD */}
      <header className="relative z-10 max-w-md mx-auto w-full flex items-center justify-between border-b border-white/10 pb-4 pt-2">
        <div className="flex items-center gap-2.5">
          <Image
            src="/brand/logos/wordmark-white.svg"
            alt="GetMyShow"
            width={124}
            height={32}
            className="h-6 w-auto object-contain"
          />
          <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-black uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>TERMINAL v2.0</span>
          </span>
        </div>

        <Link
          href="https://getmyshow-nine.vercel.app"
          className="text-xs text-slate-400 hover:text-white transition flex items-center gap-1 font-medium"
        >
          <span>Main Site</span>
          <CaretRight size={12} />
        </Link>
      </header>

      {/* Main Terminal Card (ui.unlumen.com + fancycomponents.dev) */}
      <main className="relative z-10 my-auto py-6 max-w-md mx-auto w-full">
        {/* Card Chassis with Corner Crosshairs */}
        <div className="relative bg-[#0C1019]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* 4 Corner Crosshairs */}
          <div className="absolute top-2 left-2 text-indigo-400/50 font-mono text-xs select-none">+</div>
          <div className="absolute top-2 right-2 text-indigo-400/50 font-mono text-xs select-none">+</div>
          <div className="absolute bottom-2 left-2 text-indigo-400/50 font-mono text-xs select-none">+</div>
          <div className="absolute bottom-2 right-2 text-indigo-400/50 font-mono text-xs select-none">+</div>

          {/* Title & Telemetry Header */}
          <div className="space-y-1.5 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <ShieldCheck size={26} weight="duotone" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight pt-1">
              Gate Staff Authentication
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              Enter the 3 organizer-issued gate credentials to unlock the camera scanner.
            </p>
          </div>

          {/* Auto-Logging In Notice */}
          {autoLoggingIn && (
            <div className="p-3 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs flex items-center justify-center gap-2 animate-pulse">
              <Spinner size={16} className="animate-spin" />
              <span>Verifying 1-Click WhatsApp credentials...</span>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs flex items-center gap-2 animate-in fade-in">
              <WarningCircle size={18} weight="bold" className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 1. Event Code / Slug */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <QrCode size={14} className="text-indigo-400" />
                  <span>1. Event Code or Slug</span>
                </label>
                {activeEvents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowEventDropdown(!showEventDropdown)}
                    className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition"
                  >
                    {showEventDropdown ? "Type Manually" : "Browse Active Events"}
                  </button>
                )}
              </div>

              {showEventDropdown ? (
                <select
                  value={eventQuery}
                  onChange={(e) => {
                    setEventQuery(e.target.value);
                    setShowEventDropdown(false);
                  }}
                  className="w-full h-12 rounded-xl bg-black/40 border border-white/15 px-3.5 text-xs font-semibold text-white outline-none focus:border-indigo-500"
                >
                  <option value="">Select an event...</option>
                  {activeEvents.map((ev) => (
                    <option key={ev.id} value={ev.slug} className="bg-[#0C1019] text-white">
                      {ev.title} ({ev.city})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={eventQuery}
                  onChange={(e) => setEventQuery(e.target.value)}
                  placeholder="e.g. rohtas-dandiya-mahotsav-2026"
                  className="w-full h-12 rounded-xl bg-black/40 border border-white/15 px-4 text-xs font-mono text-white placeholder:text-slate-500 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition"
                  autoComplete="off"
                />
              )}
            </div>

            {/* 2. Official Staff ID */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <IdentificationBadge size={14} className="text-indigo-400" />
                  <span>2. Official Staff / Gate ID</span>
                </label>
                <span className="text-[10px] font-mono text-slate-400 uppercase bg-white/5 px-2 py-0.5 rounded">
                  Audit Stamped
                </span>
              </div>
              <input
                type="text"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value.toUpperCase())}
                placeholder="e.g. STAFF-G1 or BOUNCER-01"
                className="w-full h-12 rounded-xl bg-black/40 border border-white/15 px-4 text-xs font-mono font-bold text-white placeholder:text-slate-500 uppercase outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition"
                autoComplete="off"
              />
            </div>

            {/* 3. 4-Digit Monospace PIN (fancycomponents.dev) */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <LockKey size={14} className="text-indigo-400" />
                  <span>3. 4-Digit Security PIN</span>
                </label>
                <span className="text-[10px] text-slate-400">Set by Organizer</span>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                {pinDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={pinInputRefs[index]}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handlePinChange(index, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(index, e)}
                    onPaste={index === 0 ? handlePinPaste : undefined}
                    className="w-14 h-16 rounded-2xl bg-black/50 border border-white/20 text-center text-3xl font-mono font-black text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40 transition shadow-inner"
                  />
                ))}
              </div>
            </div>

            {/* Submit Action */}
            <button
              type="submit"
              disabled={isSubmitting || autoLoggingIn}
              className="w-full h-13 mt-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-transform active:scale-98 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Spinner size={18} className="animate-spin" />
                  <span>Unlocking Scanner...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={18} weight="bold" />
                  <span>Launch Camera Scanner</span>
                  <ArrowRight size={16} weight="bold" />
                </>
              )}
            </button>
          </form>

          {/* Quick Help Tip */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-[11px] text-slate-400 flex items-start gap-2 leading-relaxed">
            <Info size={16} className="text-indigo-400 shrink-0 mt-0.5" />
            <span>
              If you received a 1-click WhatsApp gate link from the organizer, open it on this phone to automatically unlock without typing.
            </span>
          </div>
        </div>
      </main>

      {/* Footer Trust Seal */}
      <footer className="relative z-10 max-w-md mx-auto w-full pt-4 border-t border-white/10 text-center text-[10px] text-slate-500 font-mono">
        GetMyShow Cryptographic Terminal v2.0 • Offline Resilient • Bihar Gate Operations
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#07090E] flex items-center justify-center text-white text-xs font-mono">
          Initializing Terminal...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
