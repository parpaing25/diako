import { useEffect, useRef } from 'react';

/**
 * Fonenako — Rafraîchissement au focus (anti-egress)
 *
 * Remplace les abonnements Realtime Supabase sur les composants NON critiques
 * (dashboards admin, widgets de la barre latérale, profils, etc.). Au lieu de
 * maintenir un channel WebSocket permanent (heartbeats + données), on recharge
 * les données uniquement quand l'utilisateur revient sur l'onglet/fenêtre,
 * avec un intervalle minimal pour éviter les rechargements en rafale.
 *
 * Le Realtime reste réservé au chat et aux notifications.
 *
 * @param onRefresh     callback de rechargement des données
 * @param minIntervalMs intervalle minimal entre deux refresh (défaut 60 s)
 */
export function useRefreshOnFocus(onRefresh: () => void, minIntervalMs = 60_000) {
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh;

  const lastRunRef = useRef(Date.now());

  useEffect(() => {
    const maybeRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRunRef.current < minIntervalMs) return;
      lastRunRef.current = now;
      callbackRef.current();
    };

    window.addEventListener('focus', maybeRefresh);
    document.addEventListener('visibilitychange', maybeRefresh);

    return () => {
      window.removeEventListener('focus', maybeRefresh);
      document.removeEventListener('visibilitychange', maybeRefresh);
    };
  }, [minIntervalMs]);
}
