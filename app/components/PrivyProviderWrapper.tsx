'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { base } from 'viem/chains';

export default function PrivyProviderWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Privy's social link methods (linkTwitter, linkInstagram, etc.) are full-page
  // redirects, not popups. By default they bounce the user back to the app root.
  // We point them back to the current page (e.g. /profile or /onboarding) so the
  // user doesn't lose context after authenticating with the provider.
  const customOAuthRedirectUrl = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    return `${window.location.origin}${pathname || '/'}`;
  }, [pathname]);

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ['email', 'sms', 'google', 'wallet'],
        customOAuthRedirectUrl,
        appearance: {
          // Match the site's dark-first look — the light modal read as the
          // whole site "switching to light mode" during login.
          theme: 'dark',
          accentColor: '#e4fe52',
          logo: '/favicon.ico',
          walletList: ['coinbase_wallet', 'metamask'],
        },
        defaultChain: base,
        supportedChains: [base],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
