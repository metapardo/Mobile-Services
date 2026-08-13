import { motion } from 'framer-motion';

/**
 * Shared full-screen background (gradient orbs) + centered glass-card shell used by
 * every unauthenticated/auth-adjacent screen: login, signup, and the session-gate states
 * (loading / error / "no organization") rendered by `AuthGate`. Factored out of the old
 * `login.tsx` (which used to inline this) so all of these screens look like one family
 * instead of drifting apart.
 */
export function AuthShell({
  children,
  showLogo = true,
}: {
  children: React.ReactNode;
  showLogo?: boolean;
}) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 relative overflow-hidden py-10">
      {/* Gradient orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute -top-[20%] -left-[15%] w-[70vw] h-[70vw] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(54,84,255,0.18) 0%, transparent 70%)', filter: 'blur(60px)' }}
        />
        <div
          className="absolute -bottom-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.14) 0%, transparent 70%)', filter: 'blur(60px)' }}
        />
        <div
          className="absolute top-[40%] left-[50%] w-[40vw] h-[40vw] rounded-full -translate-x-1/2 -translate-y-1/2"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 70%)', filter: 'blur(50px)' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="w-full flex flex-col items-center"
      >
        <div className="glass rounded-3xl px-8 py-10 sm:px-10 sm:py-12 flex flex-col items-center w-full max-w-[420px]">
          {showLogo && (
            <h1 className="text-3xl font-bold mb-8 tracking-tight text-foreground">RareAir</h1>
          )}
          {children}
        </div>
      </motion.div>
    </div>
  );
}
