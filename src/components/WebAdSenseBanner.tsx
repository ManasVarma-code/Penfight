import React, { useEffect, useRef } from 'react';
import { ensureAdSenseScriptLoaded, getWebAdSenseConfig } from '../game/ads/webAds';

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

interface WebAdSenseBannerProps {
  slotId?: string;
  format?: 'auto' | 'rectangle' | 'vertical' | 'horizontal';
  responsive?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Web-only Google AdSense display ad component.
 *
 * Strictly disabled by default until genuine publisher & slot IDs are supplied.
 * Returns null if ads are disabled or running on native Android, preventing empty boxes
 * and layout shift.
 */
export const WebAdSenseBanner: React.FC<WebAdSenseBannerProps> = ({
  slotId,
  format = 'auto',
  responsive = true,
  className = '',
  style,
}) => {
  const config = getWebAdSenseConfig();
  const adRef = useRef<HTMLModElement | null>(null);
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!config.enabled || !slotId) return;

    ensureAdSenseScriptLoaded(config.clientId);

    if (adRef.current && !pushedRef.current) {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        pushedRef.current = true;
      } catch {
        // Suppress AdSense push errors if ad blockers intercept
      }
    }
  }, [config.enabled, config.clientId, slotId]);

  // Do not render anything if ads are disabled or slot ID is missing
  if (!config.enabled || !slotId) {
    return null;
  }

  return (
    <div
      className={`web-adsense-container overflow-hidden text-center ${className}`}
      aria-label="Advertisement"
    >
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block', ...(style ?? {}) }}
        data-ad-client={config.clientId}
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive={responsive ? 'true' : 'false'}
      />
    </div>
  );
};
