import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { WalletUIProvider } from '@algoscan/use-wallet-ui';
import { reconnectProviders, initializeProviders, WalletProvider, PROVIDER_ID } from '@txnlab/use-wallet';
import { useEffect } from 'react';

const walletProviders = initializeProviders(
  [PROVIDER_ID.ALGOSIGNER, PROVIDER_ID.PERA, PROVIDER_ID.DEFLY, PROVIDER_ID.MYALGO],
  {
    network: 'devmodenet',
    nodeServer: 'https://testnet-algorand.api.purestake.io/ps2',
    // nodeToken: { 'X-API-KEY': '6EbKQ0TN6n6QyFOKJxWb5aoQGe4J0t5660qg3PSE' },
    nodePort: '',
  },
);

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    reconnectProviders(walletProviders);
  }, []);
  return (
    <WalletUIProvider providers={['pera', 'myalgo', 'defly', 'algosigner']}>
      <WalletProvider value={walletProviders}>
        <Component {...pageProps} />
      </WalletProvider>
    </WalletUIProvider>
  );
}
