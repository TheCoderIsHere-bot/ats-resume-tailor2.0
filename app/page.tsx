'use client';

import dynamic from 'next/dynamic';

const AppClient = dynamic(() => import('./AppClient'), {
  ssr: false,
  loading: () => null,
});

export default function Page() {
  return <AppClient />;
}
