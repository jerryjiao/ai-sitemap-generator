import * as React from 'react';

interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
}

function Collapsible({ defaultOpen = false, className = '', children, ...props }: CollapsibleProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className={['border border-border rounded-lg', className].join(' ')} {...props}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement<CollapsibleTriggerProps | CollapsibleContentProps>(child)) {
          if (child.type === CollapsibleTrigger) {
            return React.cloneElement(child as React.ReactElement<CollapsibleTriggerProps>, {
              isOpen,
              onToggle: () => setIsOpen((prev) => !prev),
            });
          }
          if (child.type === CollapsibleContent) {
            return React.cloneElement(child as React.ReactElement<CollapsibleContentProps>, {
              isOpen,
            });
          }
        }
        return child;
      })}
    </div>
  );
}

interface CollapsibleTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isOpen?: boolean;
  onToggle?: () => void;
}

function CollapsibleTrigger({ isOpen, onToggle, className = '', children, ...props }: CollapsibleTriggerProps) {
  return (
    <button
      type="button"
      className={[
        'flex w-full items-center justify-between p-4 text-left',
        'text-foreground font-medium text-sm',
        'hover:bg-secondary/50 transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      ].join(' ')}
      onClick={onToggle}
      aria-expanded={isOpen}
      {...props}
    >
      <span>{children}</span>
      <span
        className={[
          'ml-2 text-muted-foreground transition-transform duration-200',
          isOpen ? 'rotate-180' : '',
        ].join(' ')}
      >
        &#9660;
      </span>
    </button>
  );
}

interface CollapsibleContentProps extends React.HTMLAttributes<HTMLDivElement> {
  isOpen?: boolean;
}

function CollapsibleContent({ isOpen, className = '', children, ...props }: CollapsibleContentProps) {
  if (!isOpen) return null;

  return (
    <div
      className={['border-t border-border p-4', className].join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
