import React from 'react';
import { Box, Text } from 'ink';

export function HelpBar({ text }: { text: string }) {
  return (
    <Box marginTop={1}>
      <Text dimColor>{text}</Text>
    </Box>
  );
}
