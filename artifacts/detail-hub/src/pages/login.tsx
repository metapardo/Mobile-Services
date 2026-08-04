import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import logoSrc from '@assets/logo_1785854923476.png';

export default function Login() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Gradient orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-[20%] -left-[15%] w-[70vw] h-[70vw] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(54,84,255,0.45) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute -bottom-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.4) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute top-[40%] left-[50%] w-[40vw] h-[40vw] rounded-full -translate-x-1/2 -translate-y-1/2"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.18) 0%, transparent 70%)', filter: 'blur(50px)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="text-center flex flex-col items-center"
      >
        {/* Glass card wrapper */}
        <div className="glass rounded-3xl px-10 py-12 flex flex-col items-center" style={{ minWidth: 280 }}>
          <img
            src={logoSrc}
            alt="DetailHub logo"
            className="w-40 h-40 mb-4 object-contain"
            data-testid="img-logo"
          />
          <h1 className="text-5xl md:text-6xl font-bold mb-10 tracking-tight text-white">
            DetailHub
          </h1>
          <Button
            onClick={() => setLocation('/home')}
            size="lg"
            className="min-h-[48px] px-10 w-full gradient-btn"
            data-testid="button-continue"
          >
            Continue as Admin
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
