import { createContext, useCallback, useContext, useState } from 'react';
import { Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ToastCtx {
  showToast: (msg: string) => void;
}

const ToastContext = createContext<ToastCtx>({ showToast: () => {} });

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [message, setMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <AnimatePresence>
        {message && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-white text-zinc-900 text-sm font-medium rounded-xl shadow-2xl border border-zinc-200"
          >
            <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
              <Check className="w-3 h-3 text-white" strokeWidth={3} />
            </span>
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  );
};
