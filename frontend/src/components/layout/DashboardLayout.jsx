import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { SidebarContent } from "./Sidebar";
import { Header } from "./Header";
import { useLanguage } from "../../hooks/useLanguage";
import { Outlet } from "react-router-dom";

/**
 * App shell: expandable navigation rail on desktop (collapsed 76px ⇄ expanded
 * 272px), overlay drawer on mobile/tablet, top header, and main content area.
 */
const SIDEBAR_STORAGE = "ibvap-sidebar-state";

function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

export function DashboardLayout() {
  const { lang, setLang } = useLanguage();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE) === "collapsed";
    } catch (e) {
      return false;
    }
  });

  const closeDrawer = () => setDrawerOpen(false);
  useEscape(drawerOpen, closeDrawer);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_STORAGE, next ? "collapsed" : "expanded");
      } catch (e) {
        /* ignore */
      }
      return next;
    });
  };

  // Close the mobile drawer automatically whenever the route changes.
  useEffect(() => {
    closeDrawer();
  }, [location.pathname]);

  const shellBg =
    "min-h-screen bg-[rgb(var(--c-bg))]";

  const SIDEBAR_W = "w-[272px]";
  const SIDEBAR_RAIL_W = "w-[76px]";

  return (
    <div className={shellBg}>
      {/* Desktop sidebar (full or collapsed rail) */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden overflow-visible border-r border-slate-200 bg-white shadow-card transition-[width] duration-250 ease-in-out dark:border-[#243247] dark:bg-[#071426] lg:block ${
          collapsed ? SIDEBAR_RAIL_W : SIDEBAR_W
        }`}
      >
        <div className="h-full w-full">
          <SidebarContent collapsed={collapsed} onToggleCollapse={toggleCollapse} />
        </div>
      </aside>

      {/* Mobile / tablet drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 animate-[backdropIn_0.2s_ease-out] bg-black/40"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-72 animate-[drawerIn_0.25s_ease-out] bg-white shadow-pop dark:bg-[#071426]">
            <SidebarContent onNavigate={closeDrawer} showClose onClose={closeDrawer} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div
        className={`flex min-h-screen flex-col transition-[padding] duration-250 ease-in-out ${
          collapsed ? "lg:pl-[76px]" : "lg:pl-[272px]"
        }`}
      >
        <Header
          onMenuClick={() => setDrawerOpen(true)}
          lang={lang}
          setLang={setLang}
        />
        <main
          key={location.pathname}
          className="page-enter flex-1 px-4 py-6 lg:px-6"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
