import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={'rounded-xl border border-line bg-surface ' + className}>{children}</div>
  );
}

type BtnVariant = 'brand' | 'ghost' | 'danger' | 'success';

export function Button({
  children,
  variant = 'brand',
  className = '',
  ...rest
}: {
  children: ReactNode;
  variant?: BtnVariant;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles: Record<BtnVariant, string> = {
    brand: 'bg-brand text-white hover:opacity-90',
    success: 'bg-success text-white hover:opacity-90',
    danger: 'bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25',
    ghost: 'bg-surface2 text-inkdim border border-line hover:text-ink',
  };
  return (
    <button
      {...rest}
      className={
        'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ' +
        styles[variant] +
        ' ' +
        className
      }
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-inkdim">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-line bg-surface2 px-3 py-2 text-ink outline-none focus:border-brand';
