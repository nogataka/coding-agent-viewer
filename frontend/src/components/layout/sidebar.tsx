import { type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';
import { NavLink as RouterNavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface SidebarProps {
  className?: string;
  children?: ReactNode;
}

export function Sidebar({ className, children }: SidebarProps) {
  return (
    <aside
      className={cn(
        'w-64 bg-primary text-primary-foreground flex flex-col h-full shadow-lg',
        className
      )}
    >
      {children}
    </aside>
  );
}

interface SidebarHeaderProps {
  className?: string;
  children?: ReactNode;
}

export function SidebarHeader({ className, children }: SidebarHeaderProps) {
  return (
    <div className={cn('px-6 py-8 border-b border-white/10', className)}>
      {children}
    </div>
  );
}

interface SidebarLogoProps {
  icon?: ReactNode;
  text: string;
  className?: string;
}

export function SidebarLogo({ icon, text, className }: SidebarLogoProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 text-lg font-semibold tracking-tight',
        className
      )}
    >
      {icon}
      <span className="truncate">{text}</span>
    </div>
  );
}

interface SidebarNavProps {
  className?: string;
  children?: ReactNode;
}

export function SidebarNav({ className, children }: SidebarNavProps) {
  return (
    <nav
      className={cn(
        'flex-1 px-4 py-6 overflow-y-auto scrollbar-thin',
        className
      )}
    >
      {children}
    </nav>
  );
}

interface NavSectionProps {
  title?: string;
  className?: string;
  children?: ReactNode;
}

export function NavSection({ title, className, children }: NavSectionProps) {
  return (
    <div className={cn('mb-8', className)}>
      {title && (
        <div className="text-[11px] font-semibold uppercase tracking-wide text-white/60 px-3 mb-2">
          {title}
        </div>
      )}
      <div className="space-y-1">{children}</div>
    </div>
  );
}

interface SidebarLinkBaseProps {
  icon?: LucideIcon;
  badge?: string | number;
  active?: boolean;
  className?: string;
  children: ReactNode;
}

function SidebarLinkBase({
  icon: Icon,
  badge,
  active,
  className,
  children,
}: SidebarLinkBaseProps) {
  return (
    <span
      className={cn(
        'flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors w-full text-left',
        active
          ? 'bg-white/15 text-primary-foreground'
          : 'text-white/70 hover:bg-white/10',
        className
      )}
    >
      <span className="flex items-center gap-2.5">
        {Icon && <Icon className="w-4 h-4" />}
        <span className="truncate">{children}</span>
      </span>
      {badge && (
        <span className="bg-white/10 px-1.5 py-0.5 rounded-full text-[10px] font-semibold min-w-[20px] text-center">
          {badge}
        </span>
      )}
    </span>
  );
}

interface SidebarLinkProps extends SidebarLinkBaseProps {
  to: string;
  exact?: boolean;
}

export function SidebarLink({ to, exact, ...rest }: SidebarLinkProps) {
  return (
    <RouterNavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        cn(
          'block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
          {
            'aria-current-page': isActive,
          }
        )
      }
    >
      {({ isActive }) => <SidebarLinkBase {...rest} active={isActive} />}
    </RouterNavLink>
  );
}

interface SidebarButtonLinkProps extends SidebarLinkBaseProps {
  onClick?: () => void;
}

export function SidebarButtonLink({
  onClick,
  ...rest
}: SidebarButtonLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-md"
    >
      <SidebarLinkBase {...rest} />
    </button>
  );
}

interface SidebarFooterProps {
  className?: string;
  children?: ReactNode;
}

export function SidebarFooter({ className, children }: SidebarFooterProps) {
  return (
    <div className={cn('px-5 py-6 border-t border-white/10', className)}>
      {children}
    </div>
  );
}
