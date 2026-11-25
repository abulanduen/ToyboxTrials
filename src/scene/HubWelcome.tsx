/**
 * Welcoming players in the Hub: Pipwick the mascot (and his tour), the machine greeters and the
 * Jukebox. Mounted by Village.tsx; each part lives in its own module.
 */
import { Greeters } from './Greeters';
import { Jukebox } from './Jukebox';
import { Pipwick } from './Pipwick';

export function HubWelcome() {
  return (
    <>
      <Pipwick />
      <Greeters />
      <Jukebox />
    </>
  );
}
