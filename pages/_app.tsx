import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { WalletUIProvider } from '@algoscan/use-wallet-ui';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WalletUIProvider providers={['pera', 'myalgo', 'defly']}>
      <Component {...pageProps} />
    </WalletUIProvider>
  );
}
