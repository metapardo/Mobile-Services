import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import logoSrc from '@assets/Group_3038_1785336419342.png';

export default function Login() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: 'var(--surface-inverse)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="text-center flex flex-col items-center"
      >
        <img
          src={logoSrc}
          alt="DetailHub logo"
          className="w-48 h-48 mb-2 object-contain"
          data-testid="img-logo"
        />
        <h1
          className="text-5xl md:text-6xl font-bold mb-12 tracking-tight"
          style={{ color: 'var(--ink-inverse)' }}
        >
          DetailHub
        </h1>
        <Button
          onClick={() => setLocation('/home')}
          size="lg"
          className="min-h-[44px] px-8"
          data-testid="button-continue"
        >
          Continue as Admin
        </Button>
      </motion.div>
    </div>
  );
}
