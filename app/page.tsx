import Link from "next/link";
import Image from "next/image";
import { QrCode, ShieldCheck, ArrowRight, LockKey, Sparkle } from "@phosphor-icons/react/dist/ssr";

export default function Home() {
  return (
    <div className="flex-1 flex flex-col items-center justify-between p-6 max-w-md mx-auto w-full text-center">
      {/* Top Header */}
      <div className="pt-8 flex flex-col items-center space-y-4">
        <div className="flex items-center gap-2">
          <Image
            src="/brand/logos/wordmark-white.svg"
            alt="GetMyShow"
            width={160}
            height={42}
            className="h-8 w-auto object-contain"
          />
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#F97316] text-white">
            Scanner
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Official Gate Staff & Security Terminal
        </p>
      </div>

      {/* Center Icon & Badge */}
      <div className="my-auto py-10 flex flex-col items-center space-y-6">
        <div className="relative">
          <div className="w-28 h-28 rounded-3xl bg-indigo-600/20 border-2 border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-2xl">
            <QrCode size={56} weight="duotone" />
          </div>
          <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-[#10B981] text-white flex items-center justify-center shadow-md border-2 border-[#0A0D14]">
            <ShieldCheck size={20} weight="bold" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black text-white">
            Gate Entry Terminal
          </h1>
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
            High-speed hardware camera verification with instant double-beep audio and double-entry prevention.
          </p>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
          <Sparkle size={13} className="text-[#F97316]" weight="fill" />
          <span>Works Offline in Low Network Stadiums</span>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="w-full pb-8 space-y-3">
        <Link
          href="/login"
          className="w-full h-13 rounded-2xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-transform active:scale-98"
        >
          <LockKey size={18} weight="bold" />
          <span>Login with Event PIN</span>
          <ArrowRight size={16} weight="bold" />
        </Link>

        <a
          href={process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://getmyshow-nine.vercel.app"}
          className="block text-[11px] text-slate-500 hover:text-slate-400 transition"
        >
          Return to GetMyShow Public Site &rarr;
        </a>
      </div>
    </div>
  );
}
