/**
 * Tailwind Configuration for UI Package
 * Extends shared configuration from @voiceassist/config
 */

const sharedConfig = require('@voiceassist/config/tailwind.js');

/** @type {import('tailwindcss').Config} */
module.exports = {
  ...sharedConfig,
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './.storybook/**/*.{js,jsx,ts,tsx}',
  ],
};
