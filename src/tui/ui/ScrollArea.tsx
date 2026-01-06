import React, { useEffect, useReducer, useRef } from 'react';
import { Box, measureElement, useInput, useStdout } from 'ink';
import type { DOMElement } from 'ink';

type State = { innerHeight: number; height: number; scrollTop: number };

type Action =
  | { type: 'SET_INNER'; h: number }
  | { type: 'SET_HEIGHT'; h: number }
  | { type: 'SCROLL'; delta: number }
  | { type: 'TOP' }
  | { type: 'BOTTOM' };

const reducer = (s: State, a: Action): State => {
  switch (a.type) {
    case 'SET_INNER': {
      const max = Math.max(0, a.h - s.height);
      const nextScrollTop = Math.min(s.scrollTop, max);
      if (s.innerHeight === a.h && nextScrollTop === s.scrollTop) return s;
      return { ...s, innerHeight: a.h, scrollTop: nextScrollTop };
    }
    case 'SET_HEIGHT': {
      const max = Math.max(0, s.innerHeight - a.h);
      const nextScrollTop = Math.min(s.scrollTop, max);
      if (s.height === a.h && nextScrollTop === s.scrollTop) return s;
      return { ...s, height: a.h, scrollTop: nextScrollTop };
    }
    case 'SCROLL': {
      const max = Math.max(0, s.innerHeight - s.height);
      const nextScrollTop = Math.max(0, Math.min(max, s.scrollTop + a.delta));
      if (nextScrollTop === s.scrollTop) return s;
      return { ...s, scrollTop: nextScrollTop };
    }
    case 'TOP': {
      if (s.scrollTop === 0) return s;
      return { ...s, scrollTop: 0 };
    }
    case 'BOTTOM': {
      const max = Math.max(0, s.innerHeight - s.height);
      if (s.scrollTop === max) return s;
      return { ...s, scrollTop: max };
    }
    default:
      return s;
  }
};

export function ScrollArea({ height, children }: { height: number; children: React.ReactNode }) {
  const innerRef = useRef<DOMElement>(null);
  const { stdout } = useStdout();
  const [state, dispatch] = useReducer(reducer, { innerHeight: 0, height, scrollTop: 0 });

  useEffect(() => { dispatch({ type: 'SET_HEIGHT', h: height }); }, [height]);

  useEffect(() => {
    if (!innerRef.current) return;
    const dim = measureElement(innerRef.current);
    dispatch({ type: 'SET_INNER', h: dim.height });
  });

  useEffect(() => {
    const onResize = () => dispatch({ type: 'SET_HEIGHT', h: stdout.rows });
    return () => void onResize();
  }, [stdout]);

  useInput((input, key) => {
    if (key.pageDown || (key.downArrow && key.meta)) dispatch({ type: 'SCROLL', delta: Math.max(1, Math.floor(state.height * 0.8)) });
    if (key.pageUp || (key.upArrow && key.meta)) dispatch({ type: 'SCROLL', delta: -Math.max(1, Math.floor(state.height * 0.8)) });
    if (input === 'g') dispatch({ type: 'TOP' });
    if (input === 'G') dispatch({ type: 'BOTTOM' });
  });

  return (
    <Box height={height} flexDirection="column" overflow="hidden">
      <Box ref={innerRef} flexShrink={0} flexDirection="column" marginTop={-state.scrollTop}>
        {children}
      </Box>
    </Box>
  );
}
