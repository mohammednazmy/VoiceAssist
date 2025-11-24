/**
 * Avatar Component
 * Display user profile images or initials
 *
 * Features:
 * - Multiple sizes: xs, sm, md, lg, xl
 * - Image with fallback to initials
 * - Status indicator (online, offline, busy, away)
 * - Accessible with alt text
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const avatarVariants = cva(
  'relative inline-flex items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
  {
    variants: {
      size: {
        xs: 'h-6 w-6 text-xs',
        sm: 'h-8 w-8 text-sm',
        md: 'h-10 w-10 text-base',
        lg: 'h-12 w-12 text-lg',
        xl: 'h-16 w-16 text-xl',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

const statusVariants = cva(
  'absolute bottom-0 right-0 block rounded-full ring-2 ring-background-primary',
  {
    variants: {
      size: {
        xs: 'h-1.5 w-1.5',
        sm: 'h-2 w-2',
        md: 'h-2.5 w-2.5',
        lg: 'h-3 w-3',
        xl: 'h-4 w-4',
      },
      status: {
        online: 'bg-success-500',
        offline: 'bg-neutral-400',
        busy: 'bg-error-500',
        away: 'bg-warning-500',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

export interface AvatarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof avatarVariants> {
  /**
   * Image source URL
   */
  src?: string;

  /**
   * Alt text for the image
   */
  alt?: string;

  /**
   * Initials to display as fallback
   */
  initials?: string;

  /**
   * Status indicator
   */
  status?: 'online' | 'offline' | 'busy' | 'away';
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  (
    { className, size, src, alt, initials, status, ...props },
    ref
  ) => {
    const [imageError, setImageError] = React.useState(false);

    // Generate initials from alt text if not provided
    const displayInitials = React.useMemo(() => {
      if (initials) return initials;
      if (alt) {
        return alt
          .split(' ')
          .map((word) => word[0])
          .join('')
          .substring(0, 2)
          .toUpperCase();
      }
      return '?';
    }, [initials, alt]);

    return (
      <div
        ref={ref}
        className={cn(avatarVariants({ size, className }))}
        {...props}
      >
        {src && !imageError ? (
          <img
            src={src}
            alt={alt || 'Avatar'}
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="font-medium select-none">{displayInitials}</span>
        )}

        {status && (
          <span
            className={cn(statusVariants({ size, status }))}
            aria-label={`Status: ${status}`}
          />
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';

/**
 * Avatar Group - Display multiple avatars with overlap
 */
export interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Maximum number of avatars to display
   */
  max?: number;

  /**
   * Size of the avatars
   */
  size?: AvatarProps['size'];

  children: React.ReactNode;
}

const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ className, max = 5, size = 'md', children, ...props }, ref) => {
    const childrenArray = React.Children.toArray(children);
    const displayChildren = max ? childrenArray.slice(0, max) : childrenArray;
    const remaining = max ? childrenArray.length - max : 0;

    return (
      <div
        ref={ref}
        className={cn('flex items-center -space-x-2', className)}
        {...props}
      >
        {displayChildren.map((child, index) =>
          React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<any>, {
                size,
                key: index,
                className: cn(
                  child.props.className,
                  'ring-2 ring-background-primary'
                ),
              })
            : null
        )}

        {remaining > 0 && (
          <div
            className={cn(
              avatarVariants({ size }),
              'ring-2 ring-background-primary bg-neutral-300 dark:bg-neutral-600'
            )}
          >
            <span className="font-medium text-neutral-700 dark:text-neutral-200">
              +{remaining}
            </span>
          </div>
        )}
      </div>
    );
  }
);

AvatarGroup.displayName = 'AvatarGroup';

export { Avatar, AvatarGroup, avatarVariants };
