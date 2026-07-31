/**
 * useScrollRestore v6 — simplified, bulletproof
 */
import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const KEY = (p: string) => `fn_scroll:${p}`;

const save = (pathname: string, y: number) => {
  if (y < 0) y = 0;
  try { sessionStorage.setItem(KEY(pathname), String(Math.round(y))); } catch {}
};

const load = (pathname: string): number => {
  try { return parseInt(sessionStorage.getItem(KEY(pathname)) || '0', 10); } catch { return 0; }
};

let _blocked = false;

export const useScrollRestore = () => {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const prevPath = useRef('');
  const mounted = useRef(false);

  // Disable browser's native scroll restoration
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // ── Save scroll on interaction + periodic scroll ──
  useEffect(() => {
    const doSave = () => {
      if (!_blocked && window.scrollY > 0) save(pathname, window.scrollY);
    };
    
    document.addEventListener('touchstart', doSave, { capture: true, passive: true });
    document.addEventListener('mousedown', doSave, { capture: true });
    
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; doSave(); }, 500);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      document.removeEventListener('touchstart', doSave, true);
      document.removeEventListener('mousedown', doSave, true);
      window.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [pathname]);

  // ── Route change handler ──
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      prevPath.current = pathname;
      return;
    }

    if (prevPath.current === pathname) return;

    _blocked = true;

    if (navType === 'POP') {
      // ── BACK: restore scroll ──
      const target = load(pathname);
      
      if (target > 0) {
        let attempts = 0;
        
        const tryRestore = () => {
          // Disable smooth scroll
          document.documentElement.style.scrollBehavior = 'auto';
          
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          
          if (maxScroll >= target - 100 || attempts >= 60) {
            window.scrollTo(0, target);
            
            // Double-check
            requestAnimationFrame(() => {
              window.scrollTo(0, target);
              setTimeout(() => {
                // One final check
                if (Math.abs(window.scrollY - target) > 50) {
                  window.scrollTo(0, target);
                }
                document.documentElement.style.scrollBehavior = '';
                _blocked = false;
              }, 200);
            });
          } else {
            attempts++;
            setTimeout(tryRestore, 80);
          }
        };
        
        requestAnimationFrame(() => requestAnimationFrame(tryRestore));
      } else {
        document.documentElement.style.scrollBehavior = '';
        _blocked = false;
      }
    } else {
      // ── PUSH: scroll to top ──
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
      setTimeout(() => {
        document.documentElement.style.scrollBehavior = '';
        _blocked = false;
      }, 300);
    }

    prevPath.current = pathname;
  }, [pathname, navType]);
};

export const getSavedScroll = load;
