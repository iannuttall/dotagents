import React from 'react';
import { Box, useStdout } from 'ink';

export function Screen({ children }: { children: React.ReactNode }) {
  const { stdout } = useStdout();
  const height = stdout?.rows;
  return (
    <Box flexDirection="column" height={height}>
      {children}
    </Box>
  );
}
