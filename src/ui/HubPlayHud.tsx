/**
 * Hub play HUD: the pitch's score and the basket tally (shown on the trials table's pitch, or
 * while you hold the ball), and the throw meter while you charge a throw. The meter's fill is
 * written by the frame loop (src/scene/HubPlay.tsx), never through React state.
 */
import { useEffect, useRef } from 'react';
import { TEAMS } from '../game/hubPlay';
import { useHubPlay, meter } from '../hubplay/store';

export function HubPlayHud() {
  const score = useHubPlay((s) => s.score);
  const hoops = useHubPlay((s) => s.hoops);
  const mine = useHubPlay((s) => s.mine);
  const near = useHubPlay((s) => s.nearPitch);
  const holding = useHubPlay((s) => s.holding);
  const wrap = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  useEffect(() => {
    meter.wrap = wrap.current;
    meter.el = fill.current;
    return () => {
      meter.wrap = null;
      meter.el = null;
    };
  }, []);
  return (
    <>
      {(near || holding) && (
        <div className="hubplay-score" data-testid="hubplay-score" aria-label="Hub games score">
          <span className="hubplay-score__team hubplay-score__team--coral">{TEAMS[0]}</span>
          <strong data-testid="hubplay-goals">
            {score[0]} – {score[1]}
          </strong>
          <span className="hubplay-score__team hubplay-score__team--blue">{TEAMS[1]}</span>
          <span className="hubplay-score__sep" aria-hidden />
          <span data-testid="hubplay-baskets">
            Baskets {hoops}
            {mine ? <em> · you {mine}</em> : null}
          </span>
        </div>
      )}
      <div className="hubplay-meter" ref={wrap} style={{ display: 'none' }} data-testid="hubplay-meter" aria-hidden>
        <span className="hubplay-meter__label">Power</span>
        <div className="hubplay-meter__bar">
          <div className="hubplay-meter__fill" ref={fill} />
        </div>
      </div>
    </>
  );
}
