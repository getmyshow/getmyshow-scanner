"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  LockKey,
  ShieldCheck,
  ArrowRight,
  CaretRight,
  CalendarBlank,
  MapPin,
  WarningCircle,
  Spinner,
} from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";

interface EventListItem {
  id: string;
  title: string;
  venue: string;
  city: string;
  event_date: string;
  scanner_pin?: string;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const prefilledEvent = searchParams.get("event") || searchParams.get("id") || "";
  const prefilledPin = searchParams.get("pin") || "";

  const [events, setEvents] = useState<EventListItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState(prefilledEvent);
  const [pin, setPin] = useState(prefilledPin);
  const [staffName, setStaffName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadEvents() {
      try {
        const { data, error: fetchErr } = await supabase
          .from("events")
          .select("id, title, venue, city, event_date, scanner_pin")
          .order("event_date", { ascending: true });

        if (!fetchErr && data) {
          setEvents(data);
          if (!selectedEventId && data.length > 0) {
            setSelectedEventId(data[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load events:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadEvents();
  }, [selectedEventId]);

  // Handle automatic login if prefilled from WhatsApp dispatch link
  useEffect(() => {
    if (prefilledEvent && prefilledPin && events.length > 0) {
      const match = events.find((e) => e.id === prefilledEvent);
      if (match && match.scanner_pin === prefilledPin) {
        sessionStorage.setItem(`scanner_auth_${prefilledEvent}`, prefilledPin);
        router.push(`/scan/${prefilledEvent}`);
      }
    }
  }, [prefilledEvent, prefilledPin, events, router]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedEventId) {
      setError("Please select an event.");
      return;
    }

    if (!pin || pin.length < 4) {
      setError("Please enter the 4-digit gate security PIN.");
      return;
    }

    setIsSubmitting(true);

    const eventMatch = events.find((ev) => ev.id === selectedEventId);
    if (eventMatch && eventMatch.scanner_pin && eventMatch.scanner_pin !== pin) {
      setError("Invalid PIN for this event. Check with the event organizer.");
      setIsSubmitting(false);
      return;
    }

    // Save auth to session
    sessionStorage.setItem(`scanner_auth_${selectedEventId}`, pin);
    if (staffName) {
      sessionStorage.setItem("scanner_staff_name", staffName);
    }

    router.push(`/scan/${selectedEventId}`);
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 max-w-md mx-auto w-full">
      {/* Top Header */}
      <div className="pt-4 flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <Image
            src="/brand/logos/wordmark-white.svg"
            alt="GetMyShow"
            width={130}
            height={34}
            className="h-7 w-auto object-contain"
          />
          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-[#F97316] text-white">
            Staff Gate
          </span>
        </div>

        <Link
          href="/"
          className="text-xs text-slate-400 hover:text-white transition flex items-center gap-1"
        >
          <span>Help</span>
          <CaretRight size={12} />
        </Link>
      </div>

      {/* Main Login Form */}
      <div className="my-auto py-6 space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <LockKey size={24} className="text-[#4F46E5]" weight="bold" />
            <span>Gate Staff Sign In</span>
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Enter the 4-digit Security PIN set by the event organizer to unlock the high-speed camera scanner.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs flex items-center gap-2 animate-in fade-in">
            <WarningCircle size={16} weight="bold" className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          {/* Event Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              Assigned Event
            </label>
            {isLoading ? (
              <div className="h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs text-slate-400">
                <Spinner size={16} className="animate-spin mr-2" />
                Loading events...
              </div>
            ) : (
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="w-full h-12 rounded-xl bg-white/5 border border-white/15 px-3.5 text-xs font-semibold text-white outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id} className="bg-[#0F172A] text-white">
                    {ev.title} ({ev.city})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 4-Digit PIN Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              4-Digit Security PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="e.g. 2026"
              className="w-full h-13 rounded-xl bg-white/5 border border-white/15 px-4 text-center text-2xl font-mono tracking-widest font-black text-white outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/30"
              autoFocus
            />
          </div>

          {/* Volunteer / Bouncer Name (Optional for logs) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              Bouncer / Staff Name <span className="text-slate-500">(Optional)</span>
            </label>
            <input
              type="text"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="e.g. Amit Kumar (Gate 1)"
              className="w-full h-11 rounded-xl bg-white/5 border border-white/15 px-3.5 text-xs font-medium text-white outline-none focus:border-[#4F46E5]"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-13 mt-2 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-transform active:scale-98 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Spinner size={18} className="animate-spin" />
                <span>Unlocking Camera...</span>
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
      </div>

      {/* Trust Strip */}
      <div className="pt-4 border-t border-white/10 text-center text-[10px] text-slate-500">
        GetMyShow Cryptographic Gate Scanner v2.0 • Zero Duplicate Scans
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0D14] flex items-center justify-center text-white text-xs">Loading Scanner...</div>}>
      <LoginForm />
    </Suspense>
  );
}
