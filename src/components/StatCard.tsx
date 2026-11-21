'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  count: number;
  icon: LucideIcon;
  colorScheme: 'red' | 'amber' | 'blue' | 'purple' | 'slate';
  active?: boolean;
  onClick?: () => void;
  subtitle?: string;
}

export function StatCard({
  title,
  count,
  icon: Icon,
  colorScheme,
  active,
  onClick,
  subtitle,
}: StatCardProps) {
  const schemeStyles = {
    red: {
      bg: 'bg-red-50 hover:bg-red-100/80 border-red-200 text-red-900',
      activeBorder: 'ring-2 ring-red-500 border-red-500',
      iconBg: 'bg-red-500 text-white',
      badge: 'bg-red-100 text-red-800',
    },
    amber: {
      bg: 'bg-amber-50 hover:bg-amber-100/80 border-amber-200 text-amber-900',
      activeBorder: 'ring-2 ring-amber-500 border-amber-500',
      iconBg: 'bg-amber-500 text-white',
      badge: 'bg-amber-100 text-amber-800',
    },
    blue: {
      bg: 'bg-sky-50 hover:bg-sky-100/80 border-sky-200 text-sky-900',
      activeBorder: 'ring-2 ring-sky-500 border-sky-500',
      iconBg: 'bg-sky-500 text-white',
      badge: 'bg-sky-100 text-sky-800',
    },
    purple: {
      bg: 'bg-indigo-50 hover:bg-indigo-100/80 border-indigo-200 text-indigo-900',
      activeBorder: 'ring-2 ring-indigo-500 border-indigo-500',
      iconBg: 'bg-indigo-500 text-white',
      badge: 'bg-indigo-100 text-indigo-800',
    },
    slate: {
      bg: 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800',
      activeBorder: 'ring-2 ring-slate-400 border-slate-400',
      iconBg: 'bg-slate-700 text-white',
      badge: 'bg-slate-100 text-slate-800',
    },
  };

  const style = schemeStyles[colorScheme];

  return (
    <div
      onClick={onClick}
      className={`border rounded-xl p-4 transition-all duration-150 cursor-pointer shadow-sm ${style.bg} ${
        active ? style.activeBorder : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shadow-sm ${style.iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-600">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{count}</p>
          </div>
        </div>
      </div>
      {subtitle && <p className="text-[11px] text-slate-500 mt-2 font-medium">{subtitle}</p>}
    </div>
  );
}
