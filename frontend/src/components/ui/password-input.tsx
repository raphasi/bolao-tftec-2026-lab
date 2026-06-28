import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from './input';
import { cn } from '@/lib/utils';

export type PasswordInputProps = Omit<InputProps, 'type'>;

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, disabled, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    return (
      <div className="relative">
        <Input
          type={visible ? 'text' : 'password'}
          className={cn('pr-10', className)}
          ref={ref}
          disabled={disabled}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          className={cn(
            'absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded',
            'text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
          )}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
