import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

// Shared between SidebarContent (tapping the already-active rail item
// toggles this) and MasterDetailLayout (the list pane's own open/closed
// state) -- they're siblings under (app)/_layout.tsx's Drawer, not
// parent/child, so a plain prop can't connect them.
type MasterDetailPanelContextValue = {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
};

const MasterDetailPanelContext = createContext<MasterDetailPanelContextValue | null>(null);

export function MasterDetailPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const open = useCallback(() => setIsOpen(true), []);
  return <MasterDetailPanelContext.Provider value={{ isOpen, toggle, open }}>{children}</MasterDetailPanelContext.Provider>;
}

export function useMasterDetailPanel(): MasterDetailPanelContextValue {
  const ctx = useContext(MasterDetailPanelContext);
  if (!ctx) throw new Error('useMasterDetailPanel must be used within MasterDetailPanelProvider');
  return ctx;
}
