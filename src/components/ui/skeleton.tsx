import * as React from 'react';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

function Skeleton({ className = '', ...props }: SkeletonProps) {
  return (
    <div
      className={[
        'animate-pulse rounded-md bg-muted',
        className,
      ].join(' ')}
      {...props}
    />
  );
}

export { Skeleton };
