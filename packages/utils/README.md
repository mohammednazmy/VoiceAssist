# @voiceassist/utils

Shared utility functions for VoiceAssist applications.

## Installation

```bash
pnpm add @voiceassist/utils
```

## Features

- String manipulation utilities
- Date/time formatting
- Array helpers
- Object utilities
- Validation functions
- PHI detection for HIPAA compliance
- Debounce and throttle

## Utilities

### String Utilities

```typescript
import { capitalize, truncate, kebabCase, camelCase } from "@voiceassist/utils";

capitalize("hello"); // 'Hello'
truncate("Long text here", 8); // 'Long ...'
kebabCase("myVariable"); // 'my-variable'
camelCase("my-variable"); // 'myVariable'
```

### Date/Time Utilities

```typescript
import { formatDate, relativeTime } from "@voiceassist/utils";

formatDate(new Date(), "short"); // '11/27/2025'
formatDate(new Date(), "long"); // 'November 27, 2025, 10:30 AM'

relativeTime(new Date(Date.now() - 3600000)); // '1 hour ago'
relativeTime(new Date(Date.now() - 120000)); // '2 minutes ago'
```

### Array Utilities

```typescript
import { chunk, unique, shuffle } from "@voiceassist/utils";

chunk([1, 2, 3, 4, 5], 2); // [[1, 2], [3, 4], [5]]
unique([1, 2, 2, 3, 3, 3]); // [1, 2, 3]
shuffle([1, 2, 3, 4, 5]); // Random order
```

### Object Utilities

```typescript
import { deepClone, pick, omit } from "@voiceassist/utils";

const obj = { a: 1, b: 2, c: 3 };

deepClone(obj); // New object with same values
pick(obj, ["a", "b"]); // { a: 1, b: 2 }
omit(obj, ["c"]); // { a: 1, b: 2 }
```

### Validation Utilities

```typescript
import { isValidEmail, isValidUrl, isEmpty } from "@voiceassist/utils";

isValidEmail("user@example.com"); // true
isValidUrl("https://asimo.io"); // true

isEmpty(null); // true
isEmpty(""); // true
isEmpty([]); // true
isEmpty({}); // true
isEmpty("hello"); // false
```

### Formatting Utilities

```typescript
import { formatBytes, formatNumber } from "@voiceassist/utils";

formatBytes(1024); // '1 KB'
formatBytes(1048576); // '1 MB'
formatBytes(1073741824); // '1 GB'

formatNumber(1234567); // '1,234,567'
```

### Debounce & Throttle

```typescript
import { debounce, throttle } from "@voiceassist/utils";

// Debounce - wait 300ms after last call
const debouncedSearch = debounce((query: string) => {
  fetchResults(query);
}, 300);

// Throttle - max once per 100ms
const throttledScroll = throttle(() => {
  updateScrollPosition();
}, 100);
```

### PHI Detection (HIPAA Compliance)

```typescript
import { containsPHI, redactPHI } from "@voiceassist/utils";

// Check if text contains potential PHI
containsPHI("SSN: 123-45-6789"); // true
containsPHI("Hello world"); // false

// Redact PHI from text
redactPHI("Call me at 555-123-4567");
// 'Call me at [REDACTED_PHONE]'

redactPHI("SSN: 123-45-6789, DOB: 01/15/1990");
// 'SSN: [REDACTED_SSN], DOB: [REDACTED_DOB]'
```

Detected PHI patterns:

- Social Security Numbers (SSN)
- Phone numbers
- Email addresses
- Medical Record Numbers (MRN)
- Dates of birth (DOB)

## API Reference

### String Functions

| Function                   | Description             |
| -------------------------- | ----------------------- |
| `capitalize(str)`          | Capitalize first letter |
| `truncate(str, maxLength)` | Truncate with ellipsis  |
| `kebabCase(str)`           | Convert to kebab-case   |
| `camelCase(str)`           | Convert to camelCase    |

### Date Functions

| Function                   | Description                     |
| -------------------------- | ------------------------------- |
| `formatDate(date, format)` | Format date ('short' or 'long') |
| `relativeTime(date)`       | Relative time string            |

### Array Functions

| Function             | Description       |
| -------------------- | ----------------- |
| `chunk(array, size)` | Split into chunks |
| `unique(array)`      | Remove duplicates |
| `shuffle(array)`     | Random shuffle    |

### Object Functions

| Function          | Description        |
| ----------------- | ------------------ |
| `deepClone(obj)`  | Deep clone object  |
| `pick(obj, keys)` | Pick specific keys |
| `omit(obj, keys)` | Omit specific keys |

### Validation Functions

| Function              | Description           |
| --------------------- | --------------------- |
| `isValidEmail(email)` | Validate email format |
| `isValidUrl(url)`     | Validate URL format   |
| `isEmpty(value)`      | Check if empty        |

### Formatting Functions

| Function             | Description              |
| -------------------- | ------------------------ |
| `formatBytes(bytes)` | Human-readable file size |
| `formatNumber(num)`  | Number with separators   |

### Rate Limiting

| Function              | Description             |
| --------------------- | ----------------------- |
| `debounce(fn, wait)`  | Debounce function calls |
| `throttle(fn, limit)` | Throttle function calls |

### PHI Functions

| Function            | Description          |
| ------------------- | -------------------- |
| `containsPHI(text)` | Check for PHI        |
| `redactPHI(text)`   | Redact PHI from text |

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev

# Type check
pnpm type-check

# Run tests
pnpm test
```
