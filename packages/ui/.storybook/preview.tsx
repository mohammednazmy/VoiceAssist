import type { Preview } from '@storybook/react';
import React, { useEffect } from 'react';
import { ThemeProvider } from '../src/providers/ThemeProvider';
import '../src/styles/globals.css';

/**
 * Decorator to wrap stories with ThemeProvider
 */
const withTheme = (Story: any, context: any) => {
  const theme = context.globals.theme || 'light';

  // Apply theme to document for proper styling
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, [theme]);

  return (
    <ThemeProvider forcedTheme={theme === 'dark' ? 'dark' : 'light'}>
      <div className="min-h-screen bg-background-primary text-text-primary p-4">
        <Story />
      </div>
    </ThemeProvider>
  );
};

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      disable: true, // Disable backgrounds as we use theme provider
    },
  },
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Global theme for components',
      defaultValue: 'light',
      toolbar: {
        icon: 'circlehollow',
        items: [
          { value: 'light', icon: 'sun', title: 'Light' },
          { value: 'dark', icon: 'moon', title: 'Dark' },
        ],
        showName: true,
        dynamicTitle: true,
      },
    },
  },
  decorators: [withTheme],
};

export default preview;
