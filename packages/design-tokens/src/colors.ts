/**
 * VoiceAssist Design Tokens - Colors
 * Medical-themed color palette with blues, teals, and grays
 * Designed to evoke trust, professionalism, and clarity
 */

export const colors = {
  // Primary colors - Medical Blue
  primary: {
    50: '#E6F2FF',
    100: '#CCE5FF',
    200: '#99CBFF',
    300: '#66B2FF',
    400: '#3399FF',
    500: '#0080FF',  // Primary brand color
    600: '#0066CC',
    700: '#004D99',
    800: '#003366',
    900: '#001A33',
  },

  // Secondary colors - Medical Teal
  secondary: {
    50: '#E6F7F7',
    100: '#CCEFEF',
    200: '#99DFDF',
    300: '#66CFCF',
    400: '#33BFBF',
    500: '#00AFAF',  // Secondary brand color
    600: '#008C8C',
    700: '#006969',
    800: '#004646',
    900: '#002323',
  },

  // Neutral colors - Professional Grays
  neutral: {
    50: '#F8F9FA',
    100: '#F1F3F5',
    200: '#E9ECEF',
    300: '#DEE2E6',
    400: '#CED4DA',
    500: '#ADB5BD',
    600: '#868E96',
    700: '#495057',
    800: '#343A40',
    900: '#212529',
  },

  // Semantic colors
  success: {
    50: '#E6F9F0',
    100: '#CCF3E1',
    200: '#99E7C3',
    300: '#66DBA5',
    400: '#33CF87',
    500: '#00C369',  // Success green
    600: '#009C54',
    700: '#00753F',
    800: '#004E2A',
    900: '#002715',
  },

  error: {
    50: '#FFE6E6',
    100: '#FFCCCC',
    200: '#FF9999',
    300: '#FF6666',
    400: '#FF3333',
    500: '#FF0000',  // Error red
    600: '#CC0000',
    700: '#990000',
    800: '#660000',
    900: '#330000',
  },

  warning: {
    50: '#FFF8E6',
    100: '#FFF1CC',
    200: '#FFE399',
    300: '#FFD566',
    400: '#FFC733',
    500: '#FFB900',  // Warning amber
    600: '#CC9400',
    700: '#996F00',
    800: '#664A00',
    900: '#332500',
  },

  info: {
    50: '#E6F2FF',
    100: '#CCE5FF',
    200: '#99CBFF',
    300: '#66B2FF',
    400: '#3399FF',
    500: '#0080FF',  // Info blue
    600: '#0066CC',
    700: '#004D99',
    800: '#003366',
    900: '#001A33',
  },

  // Background colors
  background: {
    primary: '#FFFFFF',
    secondary: '#F8F9FA',
    tertiary: '#F1F3F5',
    elevated: '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.5)',
  },

  // Text colors
  text: {
    primary: '#212529',
    secondary: '#495057',
    tertiary: '#868E96',
    disabled: '#ADB5BD',
    inverse: '#FFFFFF',
    link: '#0080FF',
    linkHover: '#0066CC',
  },

  // Border colors
  border: {
    primary: '#DEE2E6',
    secondary: '#E9ECEF',
    focus: '#0080FF',
    error: '#FF0000',
  },
} as const;

export type ColorToken = typeof colors;
export type ColorCategory = keyof ColorToken;
