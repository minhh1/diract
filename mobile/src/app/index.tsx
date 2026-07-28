import { Redirect } from 'expo-router';

import { useSession } from '@/lib/session';

// The root "/" route itself isn't inside either Stack.Protected block in
// _layout.tsx (neither "(app)" nor "sign-in" matches the bare path) -- this
// screen exists purely to redirect "/" to whichever of those two the
// current session state actually allows, immediately, with nothing
// rendered in between.
export default function Index() {
  const { session } = useSession();
  return <Redirect href={session ? '/matters' : '/sign-in'} />;
}
